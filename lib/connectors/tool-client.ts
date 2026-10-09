import { parseConnectorProposal, type ConnectorProposal, type ConnectorAction } from "./contracts";
export type ToolDecision = Pick<ConnectorAction, "id" | "agent_id" | "connector" | "state" | "payload_hash">;
export class ToolRequestError extends Error {
  constructor(readonly outcome: "refused" | "unconfirmed", readonly status?: number) {
    super(outcome === "refused" ? "The control plane refused this request." : "The request outcome is unconfirmed. Read saved state before deciding whether to retry the same action ID.");
  }
}
// Trusted server/agent runtime only. A client is not a deployment enforcement
// boundary. It holds no provider credential and cannot approve or execute.
export class LoopLabsToolClient {
  private readonly endpoint: string;
  constructor(origin: string, private readonly agentId: string, private readonly credential: () => Promise<string>, private readonly timeoutMs = 10000) {
    const u = new URL(origin);
    if ((u.protocol !== "https:" && !(u.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(u.hostname))) || u.username || u.password || u.pathname !== "/" || u.search || u.hash || !/^[a-zA-Z0-9_-]{1,64}$/.test(agentId) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
      throw new Error("Use a reviewed HTTPS origin, registered agent identity and bounded timeout; HTTP is loopback-only.");
    this.endpoint = `${u.origin}/api/durable/connectors`;
  }
  private async request(actionId: string, connector: ConnectorAction["connector"] | undefined, body?: string): Promise<ToolDecision> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new ToolRequestError("unconfirmed")); }, this.timeoutMs); });
    try {
      const token = await Promise.race([this.credential(), deadline]);
      if (controller.signal.aborted || !/^[a-zA-Z0-9_-]{32,256}$/.test(token)) throw new ToolRequestError("refused");
      const response = await Promise.race([fetch(body ? this.endpoint : `${this.endpoint}?action=${actionId}`, {
        method: body ? "POST" : "GET", ...(body ? { body } : {}), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, redirect: "error", credentials: "omit", cache: "no-store", signal: controller.signal,
      }), deadline]);
      if (!response.ok) throw new ToolRequestError(response.status >= 400 && response.status < 500 ? "refused" : "unconfirmed", response.status);
      const reader = response.body?.getReader();
      if (!reader) throw new ToolRequestError("unconfirmed");
      const chunks: Uint8Array[] = []; let size = 0;
      try {
        for (;;) {
          const { done, value } = await Promise.race([reader.read(), deadline]);
          if (done) break; size += value.byteLength;
          if (size > 65536) { await Promise.race([reader.cancel(), deadline]); throw new ToolRequestError("unconfirmed"); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const text = Buffer.concat(chunks).toString("utf8");
      const v = JSON.parse(text);
      if (!v || v.id !== actionId || v.agent_id !== this.agentId || !["crm", "email"].includes(v.connector) || (connector !== undefined && v.connector !== connector) || !["held", "ready", "executing", "succeeded", "uncertain", "conflict", "rejected", "cancelled"].includes(v.state) || !/^[a-f0-9]{64}$/.test(v.payload_hash)) throw new ToolRequestError("unconfirmed");
      return { id: v.id, agent_id: v.agent_id, connector: v.connector, state: v.state, payload_hash: v.payload_hash };
    } catch (e) {
      if (e instanceof ToolRequestError) throw e;
      // Never surface transport/provider bodies or secrets. No resend on loss.
      throw new ToolRequestError("unconfirmed");
    } finally { clearTimeout(timer!); controller.abort(); }
  }
  propose(proposal: Omit<ConnectorProposal, "agentId">) {
    // Parse/copy before awaiting credentials; a caller cannot alter the saved
    // envelope during token acquisition. Preserve its explicit idempotency key.
    const p = parseConnectorProposal({ ...proposal, agentId: this.agentId });
    return this.request(p.actionId, p.connector, JSON.stringify({ operation: "propose", ...p }));
  }
  read(actionId: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(actionId)) throw new Error("Use the original action UUID.");
    return this.request(actionId, undefined);
  }
}
