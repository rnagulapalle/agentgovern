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
  executing: "Applying change",
  succeeded: "Change confirmed",
  uncertain: "Outcome uncertain",
  conflict: "Manual review",
  recovered: "State restored",
  cancelled: "Permission changed",
};
export function DurableWorkspace() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
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
      if (response.status === 401 || response.status === 403) {
        setSnapshot(null);
        return null;
      }
      throw new Error(data.error);
    }
    setSnapshot(data);
    return data as Snapshot;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  const discountAgents = snapshot?.agents.filter(a => a.tools.includes("proof.discount")) || [];
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
    setNotice(result.reason || "Workspace updated.");
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
        eyebrow="DISCOUNT WORKFLOW"
        title="Discount changes"
        description="Review what agents want to change, approve exceptions, and resolve uncertain outcomes. Your actions and decisions stay saved across sessions."
        action={
          snapshot ? (
            <button
              className="cp-button"
              disabled={busy}
              onClick={() =>
                task(async () => {
                  await refresh();
                  setNotice("Workspace is up to date.");
                })
              }
            >
              Refresh workspace
            </button>
          ) : undefined
        }
      />
      <div className="cp-durable-scope">
        <strong>Connected sample data</strong>
        <p>
          <Link href="/control-plane/actions?workflow=refunds">
            View refund workflow →
          </Link>
        </p>
        <p>
          Manage changes to a sample discount record. Decisions are saved on the
          server; your customer systems are not connected.
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
          <h2>{error ? "Workspace needs attention" : "Loading discount actions…"}</h2>
          <p>Your team sign-in provides access to this workflow.</p>
          <Link className="cp-button" href="/sign-in">Sign in again</Link>
        </section>
      ) : (
        <>
          <div className="cp-durable-grid">
            <section className="cp-panel cp-durable-card">
              <h2>Current discount</h2>
              <div className="cp-durable-number">
                {snapshot.record.discount}%
              </div>
              <p>Current discount · version {snapshot.record.version}</p>
              <p>The latest saved value for the connected sample record.</p>
            </section>
            <section className="cp-panel cp-durable-card">
              <h2>Workspace agent access</h2>
              <p>
                <strong>
                  {snapshot.agents.every((a) => a.active)
                    ? "Active"
                    : "Paused"}
                </strong>
              </p>
              <p>Discount agents may update the sample discount. Pausing workspace agents also pauses the refund agent.</p>
              <p>
                {discountAgents.reduce((n,a)=>n+a.reserved,0)} of{" "}
                {discountAgents.reduce((n,a)=>n+a.action_limit,0)} allocated discount actions
                used. Repeating a request does not use another action.
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
                  ? "Pause workspace agents"
                  : "Resume workspace agents"}
              </button>
            </section>
            <section className="cp-panel cp-durable-card">
              <h2>Approval rules</h2>
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
                  Save approval rule
                </button>
              </form>
            </section>
          </div>
          <section className="cp-panel cp-durable-card">
            <PanelHead
              title="Request a discount change"
              sub="Choose an agent and a discount. Its permissions and the current approval rules determine whether the action can proceed."
            />
            <form
              className="cp-durable-form"
              onSubmit={(e) => {
                e.preventDefault();
                task(async () => {
                  const p = submitted || {
                    actionId: crypto.randomUUID(),
                    agentId: agentId || discountAgents[0].id,
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
                  value={agentId || discountAgents[0]?.id}
                  onChange={(e) => setAgentId(e.target.value)}
                >
                  {discountAgents.map((a) => (
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
              <button className="cp-button cp-button-dark" disabled={busy || !discountAgents.length}>
                {submitted ? "Check the same request" : "Submit action"}
              </button>
              {submitted && (
                <button
                  type="button"
                  className="cp-button"
                  disabled={busy}
                  onClick={() => setSubmitted(null)}
                >
                  New request
                </button>
              )}
            </form>
            {submitted && (
              <p className="cp-durable-help">
                This request is tied to record version {submitted.expectedVersion}.
                Checking it again keeps the original request and does not create
                another change.
              </p>
            )}
          </section>
          <section className="cp-panel cp-durable-card">
            <PanelHead
              title="Execution and recovery"
              sub="Follow each request from approval to a confirmed change. Uncertain outcomes wait for review."
            />
            <p className="cp-durable-help">
              An allowed change is ready to apply. Requests above the approval limit
              wait for a person; those above the maximum are blocked. If a
              response is interrupted, check the saved outcome before trying
              again. Pause agent actions before restoring a previous discount.
            </p>
            <div className="cp-durable-actions">
              {snapshot.actions.length === 0 ? (
                <p>No actions yet. Request a discount change to get started.</p>
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
                    </dl>
                    <details>
                      <summary>Review action details</summary>
                      <p>
                        Discount: {a.discount}%. Expected record version:{" "}
                        {a.expected_version}.
                      </p>
                      <p className="cp-durable-id">Request reference: {a.id}</p>
                    </details>
                    <div className="cp-durable-buttons">
                      {a.state === "held" && (
                        <>
                          <button
                            className="cp-button cp-button-dark"
                            disabled={busy}
                            onClick={() => operation(a, "approve")}
                          >
                            Approve this discount
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
                            Apply discount
                          </button>
                          <button
                            className="cp-button"
                            disabled={busy}
                            onClick={() => operation(a, "execute", true)}
                          >
                            Explore an interrupted response
                          </button>
                        </>
                      )}
                      {["uncertain", "executing"].includes(a.state) && (
                        <button
                          className="cp-button cp-button-dark"
                          disabled={busy}
                          onClick={() => operation(a, "reconcile")}
                        >
                          Check outcome
                        </button>
                      )}
                      {a.state === "succeeded" && (
                        <button
                          className="cp-button"
                          disabled={busy}
                          onClick={() => operation(a, "recover")}
                        >
                          Restore previous discount
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
              title="Decision history"
              sub="See who acted, what changed, and when. Your history remains available when you return."
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
                    link.download = "looplabs-action-history.json";
                    link.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  Export history
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
              recent events. Earlier history remains saved on the server.
            </p>
          </section>

        </>
      )}
    </div>
  );
}
