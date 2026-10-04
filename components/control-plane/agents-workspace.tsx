"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { PageTitle } from "./ui";
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
  const refresh = useCallback(async () => {
    const r = await fetch("/api/workspace/agents", { cache: "no-store" });
    const v = await r.json();
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
        description="Give each agent a name, accountable owner, role and allowed action. New agents can use the connected sample discount record."
      />
      {error && (
        <p role="alert" className="cp-durable-message is-error">
          {error}
        </p>
      )}
      <section className="cp-panel cp-durable-card">
        <h2>Onboard an agent</h2>
        <p>
          Discount agents can request a change to the sample discount record.
          Approval rules and action limits apply on the server. The prepared
          refund agent has its own payment boundary.
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
                  role: "discount_agent",
                  connector: "discount_record",
                  actionLimit: Number(values.actionLimit),
                }),
              });
              const v = await r.json();
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
            <input value="Discount agent" readOnly />
          </label>
          <label>
            Connector
            <input value="Sample discount record" readOnly />
          </label>
          <label>
            Allocated actions
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
              This key can propose and read this agent’s discount actions. It
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
                <dd>
                  {a.role === "refund_agent" ||
                  a.tools.includes("stripe.refund")
                    ? "Refund agent"
                    : "Discount agent"}
                </dd>
              </div>
              <div>
                <dt>Allowed action</dt>
                <dd>
                  {a.tools.includes("stripe.refund")
                    ? "Refund the prepared payment"
                    : "Update the sample discount"}
                </dd>
              </div>
              <div>
                <dt>Action allowance</dt>
                <dd>
                  {a.reserved} / {a.action_limit} allocated actions
                </dd>
              </div>
            </dl>
            <Link
              className="cp-button"
              href={
                a.tools.includes("stripe.refund")
                  ? "/control-plane/actions?workflow=refunds"
                  : "/control-plane/actions?workflow=discounts"
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
