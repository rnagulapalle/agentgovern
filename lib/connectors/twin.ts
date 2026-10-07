import { ControlError } from "../durable/contracts";
import type {
  Connector,
  ConnectorAction,
  ConnectorProvider,
  Observation,
} from "./contracts";
export class FetchSandboxConnectors implements ConnectorProvider {
  readonly workspaceId = "local-proof";
  readonly contactId = "1001";
  constructor(
    readonly base = process.env.LOOPLABS_CONNECTOR_TWIN_URL || "",
    readonly token = process.env.LOOPLABS_CONNECTOR_TWIN_TOKEN || "",
    readonly timeout = 1500,
  ) {
    if (
      !["http://127.0.0.1:8018", "http://connector-twin:8018"].includes(base) ||
      !/^[a-zA-Z0-9_-]{32,128}$/.test(token)
    )
      throw new ControlError(
        503,
        "Sample CRM and messaging connector is not configured.",
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
        "Connector evidence unavailable. No safe retry inferred.",
      );
    return r.json();
  }
  body(a: ConnectorAction) { return connectorBody(a); }
  async contact() { return this.request("/crm/crm/v3/objects/contacts/1001"); }
  async source(connector: Connector) {
    if (connector === "email") return null;
    const r = await this.request("/crm/crm/v3/objects/contacts/1001");
    if (r.id !== "1001" || typeof r.updatedAt !== "string" || !r.updatedAt)
      throw new ControlError(503, "Trusted contact version is unavailable.");
    return r.updatedAt as string;
  }
  async write(a: ConnectorAction, loseResponse: boolean): Promise<Observation> {
    await this.request(
      a.connector === "crm"
        ? "/crm/crm/v3/objects/contacts/1001"
        : "/email/emails",
      {
        method: a.connector === "crm" ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `looplabs-${a.id}`,
          ...(a.connector === "crm"
            ? {
                "If-Match": (a.payload as { sourceVersion: string })
                  .sourceVersion,
              }
            : {}),
          ...(loseResponse ? { "X-LoopLabs-Lose-Response": "true" } : {}),
        },
        body: JSON.stringify(this.body(a)),
      },
    );
    return this.inspect(a);
  }
  async inspect(a: ConnectorAction): Promise<Observation> {
    const e = await this.request(`/proof/effects/${a.id}`);
    if (
      e.actionId !== a.id ||
      e.connector !== a.connector ||
      JSON.stringify(e.body) !== JSON.stringify(this.body(a)) ||
      typeof e.reference !== "string"
    )
      return {
        outcome: "conflict",
        detail: "Effect evidence does not match the exact requested action.",
      };
    const r = await this.request(
      a.connector === "crm"
        ? "/crm/crm/v3/objects/contacts/1001"
        : `/email/emails/${encodeURIComponent(e.reference)}`,
    );
    if (a.connector === "crm") {
      if (
        e.reference !== "1001" ||
        r.id !== "1001" ||
        r.properties?.lifecyclestage !==
          (a.payload as { lifecycle: string }).lifecycle ||
        r.updatedAt !== e.observedVersion
      )
        return {
          outcome: "conflict",
          detail:
            "The sample contact changed after this action. Do not overwrite or retry.",
        };
      return {
        outcome: "verified",
        reference: r.id,
        detail:
          "Exact contact update verified by read-back from the simulated CRM.",
      };
    }
    if (
      r.id !== e.reference ||
      r.subject !== this.body(a).subject ||
      !Array.isArray(r.to) ||
      r.to.length !== 1 ||
      r.to[0] !== "customer@example.test" ||
      r.from !== this.body(a).from ||
      r.text !== this.body(a).text
    )
      return {
        outcome: "conflict",
        detail:
          "Message evidence differs from the approved template or recipient.",
      };
    if (!["sent", "delivered"].includes(r.last_event))
      return {
        outcome: "unknown",
        reference: r.id,
        detail:
          "Message acceptance is not established; delivery or failure requires review.",
      };
    return {
      outcome: "verified",
      reference: r.id,
      detail:
        "Simulated provider accepted the approved message. This is not proof of real delivery.",
    };
  }
}

export function connectorBody(a: ConnectorAction) {
    return a.connector === "crm"
      ? {
          properties: {
            lifecyclestage: (a.payload as { lifecycle: string }).lifecycle,
          },
        }
      : {
          from: "LoopLabs <support@looplabs.example>",
          to: ["customer@example.test"],
          subject: "We received your case",
          text: "Your request was received. A team member will review it.",
        };
}
