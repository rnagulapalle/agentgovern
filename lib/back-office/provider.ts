import { ControlError } from "../durable/contracts";
export type Order = {
  id: string;
  status: "open" | "cancelled" | "fulfilled";
  version: number;
  actionId: string | null;
};
export type Message = {
  caseId: string;
  refundId: string;
  amount: number;
  recipient: "customer@example.test";
  status: "accepted";
};
export interface CaseProvider {
  order(id: string): Promise<Order>;
  cancel(id: string, version: number, loseResponse: boolean): Promise<void>;
  message(id: string): Promise<Message | null>;
  send(message: Message, loseResponse: boolean): Promise<void>;
}
export class FetchSandboxBackOffice implements CaseProvider {
  constructor(
    readonly base = process.env.LOOPLABS_BACKOFFICE_TWIN_URL || "",
    readonly token = process.env.LOOPLABS_BACKOFFICE_TWIN_TOKEN || "",
  ) {
    if (
      !["http://127.0.0.1:8019", "http://backoffice-twin:8019"].includes(
        base,
      ) ||
      !/^[A-Za-z0-9_-]{32,}$/.test(token)
    )
      throw new ControlError(
        503,
        "Configure the private cancellation and email fixture first. Live connectors are disabled.",
      );
  }
  async request(path: string, body?: object, lost = false) {
    const r = await fetch(this.base + path, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(1500),
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
        ...(lost ? { "X-LoopLabs-Lose-Response": "true" } : {}),
      },
      ...(body ? { method: "POST", body: JSON.stringify(body) } : {}),
    });
    if (!r.ok)
      throw new ControlError(
        503,
        "Provider outcome could not be verified. Inspect before retrying.",
      );
    return r.json();
  }
  async order(id: string): Promise<Order> {
    const o = await this.request(`/orders/${id}`);
    if (
      o.id !== id ||
      !["open", "cancelled", "fulfilled"].includes(o.status) ||
      !Number.isSafeInteger(o.version) ||
      o.version < 1 ||
      !(o.actionId === null || o.actionId === id)
    )
      throw new ControlError(503, "Invalid order evidence.");
    return o;
  }
  async cancel(id: string, version: number, lost: boolean) {
    await this.request(`/orders/${id}`, { version }, lost);
  }
  async message(id: string): Promise<Message | null> {
    const m = await this.request(`/messages/${id}`);
    if (m === null) return null;
    if (
      m.caseId !== id ||
      m.recipient !== "customer@example.test" ||
      m.status !== "accepted" ||
      typeof m.refundId !== "string" ||
      !m.refundId.startsWith("re_") ||
      !Number.isSafeInteger(m.amount) ||
      m.amount <= 0
    )
      throw new ControlError(503, "Invalid message evidence.");
    return m;
  }
  async send(m: Message, lost: boolean) {
    await this.request(`/messages/${m.caseId}`, m, lost);
  }
}
