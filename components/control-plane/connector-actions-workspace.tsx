"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { Connector, ConnectorAction } from "@/lib/connectors/contracts";
import { PageTitle } from "./ui";
interface Data {
  policies: { connector: Connector; active: boolean; version: number }[];
  actions: ConnectorAction[];
  events: {
    id: string;
    action_id: string;
    kind: string;
    subject: string;
    at: string;
  }[];
}
export function ConnectorActionsWorkspace({
  connector,
}: {
  connector: Connector;
}) {
  const [data, setData] = useState<Data | null>(null),
    [agents, setAgents] = useState<
      { id: string; tools: string[]; active: boolean }[]
    >([]);
  const [agent, setAgent] = useState(""),
    [lifecycle, setLifecycle] = useState("customer"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(async () => {
    const rs = await Promise.all([
      fetch("/api/durable/connectors", { cache: "no-store" }),
      fetch("/api/workspace/agents", { cache: "no-store" }),
    ]);
    const [v, a] = await Promise.all(rs.map((r) => r.json()));
    if (rs.some((r) => !r.ok)) throw new Error(v.error || a.error);
    setData(v);
    setAgents(a.agents);
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  useEffect(() => {
    setAgent("");
  }, [connector]);
  async function act(operation: string, p: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/durable/connectors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, ...p }),
      });
      const v = await r.json();
      if (!r.ok) throw new Error(v.error);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request unavailable.");
    } finally {
      setBusy(false);
    }
  }
  const available = agents.filter(
    (a) => a.active && a.tools.includes(`twin.${connector}`),
  );
  const active = data?.policies.find((p) => p.connector === connector)?.active;
  const name =
    connector === "crm" ? "CRM contact updates" : "Customer messages";
  return (
    <div className="cp-durable">
      <PageTitle
        eyebrow="SAVED WORKFLOW"
        title={name}
        description={
          connector === "crm"
            ? "Approve an exact lifecycle change, apply it to a simulated contact, and read back the outcome."
            : "Approve a fixed message to a sample customer, then verify provider acceptance before another attempt."
        }
      />
      <section className="cp-durable-scope">
        <strong>Simulated systems. Real control decisions.</strong>
        <p>
          FetchSandbox supplies the private provider twins. Requests, approvals
          and outcomes are saved on the server. No customer CRM is connected, no
          email is delivered, and no AI model runs.
        </p>
        <p>
          Every request needs a named approval. If you submit it here, a
          different workspace member must approve. Agent keys can request
          actions; they cannot approve or execute.
        </p>
      </section>
      {error && (
        <p role="alert" className="cp-durable-message is-error">
          {error}
        </p>
      )}
      <section className="cp-panel cp-durable-card">
        <h2>Request one bounded action</h2>
        <p>
          {connector === "crm"
            ? "Boundary: lifecycle stage on contact 1001. A later contact change prevents blind retry."
            : "Boundary: the “case received” template to customer@example.test. Custom recipients and text are refused. Provider acceptance does not establish real delivery."}
        </p>
        <form
          className="cp-durable-form"
          onSubmit={(e) => {
            e.preventDefault();
            void act("propose", {
              actionId: crypto.randomUUID(),
              agentId: agent,
              connector,
              payload:
                connector === "crm"
                  ? { lifecycle }
                  : { template: "case_received" },
            });
          }}
        >
          <label>
            Registered agent
            <select
              required
              value={agent}
              onChange={(e) => setAgent(e.target.value)}
            >
              <option value="">Choose an agent</option>
              {available.map((a) => (
                <option key={a.id}>{a.id}</option>
              ))}
            </select>
          </label>
          {connector === "crm" ? (
            <label>
              Lifecycle stage
              <select
                value={lifecycle}
                onChange={(e) => setLifecycle(e.target.value)}
              >
                <option value="customer">Customer</option>
                <option value="lead">Lead</option>
              </select>
            </label>
          ) : (
            <label>
              Approved template
              <input value="We received your case" readOnly />
            </label>
          )}
          <button
            className="cp-button cp-button-dark"
            disabled={busy || !agent || !active}
          >
            Request approval
          </button>
        </form>
        {!available.length && (
          <p>
            <Link href="/control-plane/agents">
              Register a {connector === "crm" ? "CRM" : "messaging"} agent
            </Link>{" "}
            to start.
          </p>
        )}
        <p>
          Connector:{" "}
          {data
            ? active
              ? "accepting new requests"
              : "contained"
            : "checking…"}
          . Containment stops queued work; it cannot recall an already
          dispatched effect.
        </p>
        <button
          className="cp-button"
          disabled={busy || !data}
          onClick={() => void act(active ? "contain" : "enable", { connector })}
        >
          {active ? "Contain this connector" : "Enable new requests"}
        </button>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>Actions and outcome evidence</h2>
        <p>
          Uncertain means we could not prove the result. Verification reads the
          provider; it never sends the action again.
        </p>
        {data?.actions
          .filter((a) => a.connector === connector)
          .map((a) => (
            <article className="cp-durable-scope" key={a.id}>
              <h3>
                {connector === "crm"
                  ? `Set lifecycle to ${(a.payload as { lifecycle: string }).lifecycle}`
                  : "Send the case-received message"}
              </h3>
              <p>
                <strong>{a.state}</strong> · {a.reason}
              </p>
              <p>
                Agent: {a.agent_id} · Requested by: {a.proposed_by}
                {a.approved_by ? ` · Approved by: ${a.approved_by}` : ""}
              </p>
              {a.state === "held" && (
                <>
                  <button
                    className="cp-button"
                    disabled={busy}
                    onClick={() =>
                      void act("approve", {
                        actionId: a.id,
                        payloadHash: a.payload_hash,
                      })
                    }
                  >
                    Approve exact request
                  </button>{" "}
                  <button
                    className="cp-button"
                    disabled={busy}
                    onClick={() =>
                      void act("reject", {
                        actionId: a.id,
                        payloadHash: a.payload_hash,
                      })
                    }
                  >
                    Reject
                  </button>
                </>
              )}
              {a.state === "ready" && (
                <>
                  <button
                    className="cp-button cp-button-dark"
                    disabled={busy}
                    onClick={() => void act("execute", { actionId: a.id })}
                  >
                    Execute approved action
                  </button>{" "}
                  <button
                    className="cp-button"
                    disabled={busy}
                    onClick={() =>
                      void act("execute", {
                        actionId: a.id,
                        lostResponse: true,
                      })
                    }
                  >
                    Simulate a lost response
                  </button>
                </>
              )}
              {["uncertain", "executing", "succeeded"].includes(a.state) && (
                <button
                  className="cp-button"
                  disabled={busy}
                  onClick={() => void act("reconcile", { actionId: a.id })}
                >
                  Verify with provider
                </button>
              )}
            </article>
          ))}
        {data && !data.actions.some((a) => a.connector === connector) && (
          <p>
            No saved actions yet. Register an agent and request approval above.
          </p>
        )}
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>Saved decision history</h2>
        {data?.events
          .filter((e) =>
            data.actions.some(
              (a) => a.id === e.action_id && a.connector === connector,
            ),
          )
          .slice(0, 20)
          .map((e) => (
            <p key={e.id}>
              {e.kind} · {e.subject} · {new Date(e.at).toLocaleString()}
            </p>
          ))}
      </section>
    </div>
  );
}
