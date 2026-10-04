import { ControlError } from "../durable/contracts";
import {
  PAYMENT,
  type RefundAction,
  type ProviderRefund,
  type RefundProvider,
  type PaymentEvidence,
} from "./contracts";
// Intentionally loopback-only. No live payment endpoints or customer-selected URLs.
export class FetchSandboxStripe implements RefundProvider {
  readonly workspaceId = "local-proof";
  constructor(
    readonly base = process.env.LOOPLABS_REFUND_TWIN_URL || "",
    readonly token = process.env.LOOPLABS_REFUND_TWIN_TOKEN || "",
    readonly timeout = 1500,
  ) {
    if (
      base !== "http://127.0.0.1:8017" ||
      !/^sk_test_[A-Za-z0-9_-]{32,}$/.test(token)
    )
      throw new ControlError(
        503,
        "Configure the dedicated local FetchSandbox refund twin. Live payment endpoints are disabled.",
      );
  }
  async request(path: string, init: RequestInit = {}) {
    const r = await fetch(this.base + path, {
      ...init,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(this.timeout),
      headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
    });
    if (!r.ok)
      throw new ControlError(
        503,
        "Provider evidence unavailable. Do not assume failure or retry a refund.",
      );
    return r.json();
  }
  async payment(): Promise<PaymentEvidence> {
    const p = await this.request(`/v1/charges/${PAYMENT}`);
    if (
      p.id !== PAYMENT ||
      p.currency !== "usd" ||
      p.paid !== true ||
      !Number.isSafeInteger(p.amount) ||
      p.amount <= 0 ||
      !Number.isSafeInteger(p.amount_refunded) ||
      p.amount_refunded < 0 ||
      p.amount_refunded > p.amount
    )
      throw new ControlError(503, "Payment evidence is invalid.");
    return {
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      paid: p.paid,
      amount_refunded: p.amount_refunded,
    };
  }
  async refunds(): Promise<ProviderRefund[]> {
    const list = await this.request("/v1/refunds?limit=100");
    if (
      !Array.isArray(list.data) ||
      list.has_more !== false ||
      list.data.some(
        (r: ProviderRefund) =>
          !r ||
          typeof r.id !== "string" ||
          !r.id.startsWith("re_") ||
          !Number.isSafeInteger(r.amount) ||
          r.amount <= 0 ||
          r.currency !== "usd" ||
          r.charge !== PAYMENT ||
          typeof r.metadata?.looplabs_action !== "string" ||
          !["pending", "succeeded", "failed", "canceled"].includes(r.status),
      )
    )
      throw new ControlError(
        503,
        "Incomplete or invalid refund evidence; manual review required.",
      );
    return list.data;
  }
  async create(
    a: RefundAction,
    lostResponse: boolean,
  ): Promise<ProviderRefund> {
    return this.request("/v1/refunds", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": `looplabs-${a.id}`,
        ...(lostResponse ? { "X-LoopLabs-Lose-Response": "true" } : {}),
      },
      body: new URLSearchParams({
        charge: a.payment_id,
        amount: String(a.amount),
        "metadata[looplabs_action]": a.id,
        reason: "requested_by_customer",
      }).toString(),
    });
  }
}
