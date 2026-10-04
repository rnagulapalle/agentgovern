"use client";
import Link from "next/link";
import { workspaceJson } from "@/lib/workspace/response";
import { useCallback, useEffect, useState } from "react";
import { PageTitle } from "./ui";
import { agentPresentation } from "@/lib/workspace/presentation";
interface Directory {
  agents: {
    id: string;
    name: string | null;
    owner: string | null;
    role: string | null;
    connector: string | null;
    active: boolean;
    tools: string[];
    action_limit: number;
    reserved: number;
  }[];
  owners: { email: string; name: string }[];
}
export function AgentsWorkspace() {
  const [data, setData] = useState<Directory | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState("");
  const [connector, setConnector] = useState("discount_record");
  const refresh = useCallback(async () => {
    const r = await fetch("/api/workspace/agents", { cache: "no-store" });
    const v = await workspaceJson(r);
    if (!r.ok) throw new Error(v.error);
    setData(v);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  return (
    <div className="cp-durable">
      <PageTitle
        eyebrow="AGENT IDENTITY"
        title="Agents and boundaries"
        description="Give each agent an owner and one allowed action: sample discounts, simulated CRM updates or prepared customer messages."
      />
      {error && (
        <p role="alert" className="cp-durable-message is-error">
          {error}
        </p>
      )}
      <section className="cp-panel cp-durable-card">
        <h2>Onboard an agent</h2>
        <p>
          Choose one supported connector. Rules and action limits apply on the
          server. CRM and customer-message actions always require named
          approval. The prepared refund agent has its own payment boundary.
        </p>
        <form
          className="cp-durable-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            setKey("");
            const form = e.currentTarget;
            const values = Object.fromEntries(new FormData(form));
            try {
              const r = await fetch("/api/workspace/agents", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...values,
                  role:
                    connector === "discount_record"
                      ? "discount_agent"
                      : connector === "crm_twin"
                        ? "crm_agent"
                        : "email_agent",
                  connector,
                  actionLimit: Number(values.actionLimit),
                }),
              });
              const v = await workspaceJson(r);
              if (!r.ok) throw new Error(v.error);
              setKey(v.agentToken);
              form.reset();
              await refresh();
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Could not onboard the agent.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label>
            Agent name
            <input
              name="name"
              required
              maxLength={120}
              placeholder="Customer offers agent"
            />
          </label>
          <label>
            Agent ID
            <input
              name="id"
              required
              pattern="[a-zA-Z0-9_-]{1,64}"
              maxLength={64}
              placeholder="customer-offers"
            />
          </label>
          <label>
            Accountable owner
            <select name="owner" required defaultValue="">
              <option value="" disabled>
                Choose a workspace member
              </option>
              {data?.owners.map((o) => (
                <option key={o.email} value={o.email}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Role
            <input
              value={
                connector === "discount_record"
                  ? "Discount agent"
                  : connector === "crm_twin"
                    ? "CRM agent"
                    : "Messaging agent"
              }
              readOnly
            />
          </label>
          <label>
            Connector
            <select
              value={connector}
              onChange={(e) => setConnector(e.target.value)}
            >
              <option value="discount_record">Sample discount record</option>
              <option value="crm_twin">Simulated CRM contact</option>
              <option value="email_twin">Simulated customer messages</option>
            </select>
          </label>
          <label>
            Lifetime requests
            <input
              type="number"
              name="actionLimit"
              min={1}
              max={1000}
              defaultValue={100}
              required
            />
          </label>
          <button className="cp-button cp-button-dark" disabled={busy || !data}>
            {busy ? "Registering…" : "Register agent"}
          </button>
        </form>
        {key && (
          <div className="cp-durable-scope" data-private>
            <strong>Private agent key — shown once</strong>
            <p>
              This key can propose and read this agent’s allowed actions. It
              cannot approve, execute or configure the workspace. Save it
              privately for a trusted agent runtime.
            </p>
            <input
              type="password"
              readOnly
              value={key}
              aria-label="Private agent key"
            />
            <button
              className="cp-button"
              onClick={() => navigator.clipboard.writeText(key)}
            >
              Copy key
            </button>
            <button className="cp-button" onClick={() => setKey("")}>
              Dismiss key
            </button>
          </div>
        )}
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>Registered agents</h2>
        {data?.agents.map((a) => (
          <article className="workspace-agent" key={a.id}>
            <div>
              <h3>{a.name || a.id}</h3>
              <p>
                {a.active ? "Active" : "Paused"} · {a.id}
              </p>
            </div>
            <dl>
              <div>
                <dt>Owner</dt>
                <dd>{a.owner || "Workspace owner"}</dd>
              </div>
              <div>
                <dt>Role</dt>
                <dd>{agentPresentation(a.tools).role}</dd>
              </div>
              <div>
                <dt>Allowed action</dt>
                <dd>{agentPresentation(a.tools).action}</dd>
              </div>
              <div>
                <dt>
                  {a.tools.includes("stripe.refund")
                    ? "Refund boundary"
                    : "Request allowance"}
                </dt>
                <dd>
                  {a.tools.includes("stripe.refund")
                    ? "Amount and budget rules on the Refunds workflow"
                    : `${a.reserved} / ${a.action_limit} lifetime requests`}
                </dd>
              </div>
            </dl>
            <Link
              className="cp-button"
              href={
                agentPresentation(a.tools).workflow
                  ? `/control-plane/actions?workflow=${agentPresentation(a.tools).workflow}`
                  : "/control-plane/connectors"
              }
            >
              Review actions →
            </Link>
          </article>
        ))}
      </section>
    </div>
  );
}
