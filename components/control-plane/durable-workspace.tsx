"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageTitle, PanelHead, Status } from "./ui";
import type {
  DurableAction,
  Proposal,
  Snapshot,
} from "@/lib/durable/contracts";

const labels: Record<string, string> = {
  held: "Needs approval",
  ready: "Ready to execute",
  executing: "Worker executing",
  succeeded: "Effect recorded",
  uncertain: "Outcome uncertain",
  conflict: "Manual review",
  recovered: "State restored",
  cancelled: "Authorization invalidated",
};
export function DurableWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [discount, setDiscount] = useState(5);
  const [agentId, setAgentId] = useState("");
  const [submitted, setSubmitted] = useState<Proposal | null>(null);
  const [autoLimit, setAutoLimit] = useState(10);
  const [showAllEvents, setShowAllEvents] = useState(false);
  const refresh = useCallback(async () => {
    const response = await fetch("/api/durable", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) setSnapshot(null);
      throw new Error(data.error);
    }
    setSnapshot(data);
    return data as Snapshot;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const signedIn = Boolean(snapshot);
  useEffect(() => {
    if (!signedIn) return;
    const timer = setInterval(
      () => refresh().catch((e) => setError(e.message)),
      5000,
    );
    return () => clearInterval(timer);
  }, [signedIn, refresh]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Operation could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function request(value: Record<string, unknown>) {
    const response = await fetch("/api/durable", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    await refresh();
    setNotice(result.reason || "Control change saved in PostgreSQL.");
  }
  async function operation(a: DurableAction, op: string, lostResponse = false) {
    await task(() =>
      request({
        operation: op,
        actionId: a.id,
        ...(op === "approve" || op === "reject"
          ? { payloadHash: a.payload_hash }
          : {}),
        ...(op === "execute" ? { lostResponse } : {}),
      }),
    );
  }
  return (
    <div className="cp-durable">
      <PageTitle
        eyebrow="SERVER-BACKED PROOF"
        title="Durable action controls"
        description="Submit an action, approve its exact payload, and verify the effect. State and decisions are saved in PostgreSQL."
        action={
          snapshot ? (
            <button
              className="cp-button"
              disabled={busy}
              onClick={() =>
                task(async () => {
                  await refresh();
                  setNotice("Read the latest persisted state.");
                })
              }
            >
              Refresh state
            </button>
          ) : undefined
        }
      />
      <div className="cp-durable-scope">
        <strong>Controlled connector · test data only</strong>
        <p>
          <Link href="/control-plane/refunds">
            Try the refund agent with a FetchSandbox payment twin →
          </Link>
        </p>
        <p>
          This workspace changes one PostgreSQL test record. It does not connect
          to your CRM, send messages, call models, or process payments. The
          original product tour remains a separate browser-local demo.
        </p>
      </div>
      {error && (
        <div className="cp-durable-message is-error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="cp-durable-message" role="status">
          {notice}
        </div>
      )}
      {!snapshot ? (
        <section className="cp-panel cp-durable-card">
          <PanelHead
            title="Open your durable workspace"
            sub="Use the operator token provisioned by your administrator. It is not saved in local storage."
          />
          <form
            className="cp-durable-form"
            onSubmit={(e) => {
              e.preventDefault();
              task(async () => {
                const response = await fetch("/api/durable/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token }),
                });
                const value = await response.json();
                if (!response.ok) throw new Error(value.error);
                setToken("");
                await refresh();
                setNotice(
                  "Connected to PostgreSQL. Your browser uses an HTTP-only session cookie.",
                );
              });
            }}
          >
            <label>
              Operator access token
              <input
                type="password"
                required
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </label>
            <button className="cp-button cp-button-dark" disabled={busy}>
              Open workspace
            </button>
          </form>
          <p className="cp-durable-help">
            Local setup: follow <code>docs/DURABLE_CONTROL_PLANE.md</code>, run{" "}
            <code>pnpm durable:setup</code>, then use the private credentials
            file. Never share tokens in screenshots or commit them.
          </p>
        </section>
      ) : (
        <>
          <div className="cp-durable-grid">
            <section className="cp-panel cp-durable-card">
              <h2>Observed test record</h2>
              <div className="cp-durable-number">
                {snapshot.record.discount}%
              </div>
              <p>Current discount · version {snapshot.record.version}</p>
              <p>One controlled record, stored on the server.</p>
            </section>
            <section className="cp-panel cp-durable-card">
              <h2>Agent authority</h2>
              <p>
                <strong>
                  {snapshot.agents.every((a) => a.active)
                    ? "Active"
                    : "Contained"}
                </strong>
              </p>
              <p>Tool: proof.discount</p>
              <p>
                {snapshot.agents[0]?.reserved} of{" "}
                {snapshot.agents[0]?.action_limit} lifetime action admissions
                used. Replays use no extra allowance.
              </p>
              <button
                className="cp-button"
                disabled={busy}
                onClick={() =>
                  task(() =>
                    request({
                      operation: "configure",
                      agentActive: !snapshot.agents.every((a) => a.active),
                    }),
                  )
                }
              >
                {snapshot.agents.every((a) => a.active)
                  ? "Contain agents"
                  : "Enable agents"}
              </button>
            </section>
            <section className="cp-panel cp-durable-card">
              <h2>Action policy</h2>
              <p>
                Version {snapshot.policy.version}. Above{" "}
                {snapshot.policy.auto_limit}% needs approval. Above{" "}
                {snapshot.policy.hard_limit}% is blocked.
              </p>
              <form
                className="cp-durable-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  task(() => request({ operation: "configure", autoLimit }));
                }}
              >
                <label>
                  Automatic discount limit (%)
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={autoLimit}
                    onChange={(e) => setAutoLimit(Number(e.target.value))}
                  />
                </label>
                <button className="cp-button" disabled={busy}>
                  Save new policy version
                </button>
              </form>
            </section>
          </div>
          <section className="cp-panel cp-durable-card">
            <PanelHead
              title="Submit a protected action"
              sub="The operator can test a registered agent. Agent API callers must authenticate as the exact proposing agent."
            />
            <form
              className="cp-durable-form"
              onSubmit={(e) => {
                e.preventDefault();
                task(async () => {
                  const p = submitted || {
                    actionId: crypto.randomUUID(),
                    agentId: agentId || snapshot.agents[0].id,
                    discount,
                    expectedVersion: snapshot.record.version,
                  };
                  setSubmitted(p);
                  await request({ operation: "propose", ...p });
                });
              }}
            >
              <label>
                Registered agent
                <select
                  disabled={Boolean(submitted)}
                  value={agentId || snapshot.agents[0]?.id}
                  onChange={(e) => setAgentId(e.target.value)}
                >
                  {snapshot.agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.id}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Requested discount (%)
                <input
                  type="number"
                  required
                  min={0}
                  max={100}
                  value={discount}
                  disabled={Boolean(submitted)}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                />
              </label>
              <button className="cp-button cp-button-dark" disabled={busy}>
                {submitted ? "Replay same action ID" : "Submit action"}
              </button>
              {submitted && (
                <button
                  type="button"
                  className="cp-button"
                  disabled={busy}
                  onClick={() => setSubmitted(null)}
                >
                  Prepare a new action
                </button>
              )}
            </form>
            {submitted && (
              <p className="cp-durable-help">
                Action {submitted.actionId} · source version{" "}
                {submitted.expectedVersion}. Replaying keeps the same payload
                and must not create another action or effect.
              </p>
            )}
          </section>
          <section className="cp-panel cp-durable-card">
            <PanelHead
              title="Execution and recovery"
              sub="Ready → executing → effect recorded. Uncertain outcomes stop until verified."
            />
            <p className="cp-durable-help">
              Try 5% for automatic authorization, 25% for approval, or 70% for a
              policy block. Choose “Execute with lost response” to write the
              test record but hold the action as uncertain. Reconcile it to
              prove that no second write occurs. To restore a successful action,
              contain the agents first.
            </p>
            <div className="cp-durable-actions">
              {snapshot.actions.length === 0 ? (
                <p>No actions yet. Submit the first one above.</p>
              ) : (
                snapshot.actions.map((a) => (
                  <article key={a.id}>
                    <div className="cp-durable-action-head">
                      <h3>
                        {a.discount}% discount · source version{" "}
                        {a.expected_version}
                      </h3>
                      <Status
                        value={a.state}
                        label={labels[a.state] || a.state}
                      />
                    </div>
                    <p>{a.reason}</p>
                    <dl>
                      <div>
                        <dt>Agent</dt>
                        <dd>{a.agent_id}</dd>
                      </div>
                      <div>
                        <dt>Policy</dt>
                        <dd>Version {a.policy_version}</dd>
                      </div>
                      <div>
                        <dt>Approval</dt>
                        <dd>{a.approved_by || "Not issued"}</dd>
                      </div>
                      <div>
                        <dt>Action ID</dt>
                        <dd className="cp-durable-id">{a.id}</dd>
                      </div>
                    </dl>
                    <details>
                      <summary>Inspect the bound payload</summary>
                      <p>
                        Discount: {a.discount}%. Expected record version:{" "}
                        {a.expected_version}.
                      </p>
                      <p className="cp-durable-id">
                        SHA-256 payload digest: {a.payload_hash}
                      </p>
                    </details>
                    <div className="cp-durable-buttons">
                      {a.state === "held" && (
                        <>
                          <button
                            className="cp-button cp-button-dark"
                            disabled={busy}
                            onClick={() => operation(a, "approve")}
                          >
                            Approve exact action
                          </button>
                          <button
                            className="cp-button"
                            disabled={busy}
                            onClick={() => operation(a, "reject")}
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
                            onClick={() => operation(a, "execute")}
                          >
                            Execute test write
                          </button>
                          <button
                            className="cp-button"
                            disabled={busy}
                            onClick={() => operation(a, "execute", true)}
                          >
                            Execute with lost response
                          </button>
                        </>
                      )}
                      {["uncertain", "executing"].includes(a.state) && (
                        <button
                          className="cp-button cp-button-dark"
                          disabled={busy}
                          onClick={() => operation(a, "reconcile")}
                        >
                          Verify outcome before retry
                        </button>
                      )}
                      {a.state === "succeeded" && (
                        <button
                          className="cp-button"
                          disabled={busy}
                          onClick={() => operation(a, "recover")}
                        >
                          Verify & restore previous state
                        </button>
                      )}
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
          <section className="cp-panel cp-durable-card">
            <PanelHead
              title="Persisted decision history"
              sub="Server records with authenticated subjects. Database administrators retain control; this is not cryptographically signed evidence."
              action={
                <button
                  className="cp-button"
                  onClick={() => {
                    const url = URL.createObjectURL(
                      new Blob([JSON.stringify(snapshot, null, 2)], {
                        type: "application/json",
                      }),
                    );
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = "looplabs-durable-proof.json";
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export proof
                </button>
              }
            />
            <ol className="cp-durable-events">
              {snapshot.events.slice(0, showAllEvents ? 200 : 10).map((e) => (
                <li key={e.id}>
                  <strong>{e.kind.replaceAll("_", " ")}</strong>
                  <span>
                    {e.subject} · {new Date(e.at).toLocaleString()}
                  </span>
                  <span className="cp-durable-id">
                    {e.action_id || "Workspace control"}
                  </span>
                </li>
              ))}
            </ol>
            {snapshot.events.length > 10 && (
              <button
                className="cp-button"
                onClick={() => setShowAllEvents((v) => !v)}
              >
                {showAllEvents
                  ? "Show latest 10 decisions"
                  : `Show ${snapshot.events.length} recent decisions`}
              </button>
            )}
            <p className="cp-durable-help">
              This view and export include up to 100 recent actions and 200
              recent events. Older records remain in PostgreSQL.
            </p>
          </section>
          <button
            className="cp-button"
            disabled={busy}
            onClick={() =>
              task(async () => {
                const response = await fetch("/api/durable/session", {
                  method: "DELETE",
                });
                if (!response.ok) throw new Error("Sign-out failed.");
                setSnapshot(null);
                setSubmitted(null);
                setNotice("Signed out. Server state remains saved.");
              })
            }
          >
            Sign out
          </button>
        </>
      )}
    </div>
  );
}
