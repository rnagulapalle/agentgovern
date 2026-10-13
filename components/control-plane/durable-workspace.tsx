"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DiscountHistory } from "./discount-history";
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
export function DurableWorkspace({ scriptDemo = false }: { scriptDemo?: boolean }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [discount, setDiscount] = useState(5);
  const [agentId, setAgentId] = useState("");
  const [submitted, setSubmitted] = useState<Proposal | null>(null);
  const [autoLimit, setAutoLimit] = useState(10);
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
  const policyAutoLimit = snapshot?.policy.auto_limit;
  useEffect(() => { if (policyAutoLimit !== undefined) setAutoLimit(policyAutoLimit); }, [policyAutoLimit]);
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
        {!scriptDemo && <p>
          <Link href="/control-plane/actions?workflow=refunds">
            View refund workflow →
          </Link>
        </p>}
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
              <h2>Discount connector access</h2>
              <p>
                <strong>
                  {!discountAgents.length ? "No discount agents enrolled" : discountAgents.every((a) => a.active)
                    ? "Active"
                    : "Paused"}
                </strong>
              </p>
              <p>Containment stops new discount work and leaves uncertain effects for verification. Other connectors are unchanged.</p>
              <p>
                {discountAgents.reduce((n,a)=>n+a.reserved,0)} of{" "}
                {discountAgents.reduce((n,a)=>n+a.action_limit,0)} allocated discount actions
                used. Repeating a request does not use another action.
              </p>
              <button
                className="cp-button"
                disabled={busy || !discountAgents.length}
                onClick={() =>
                  task(() =>
                    request({
                      operation: "discountConnectorAccess",
                      active: !discountAgents.every((a) => a.active),
                    }),
                  )
                }
              >
                {discountAgents.every((a) => a.active)
                  ? "Contain this connector"
                  : "Enable this connector"}
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
                  if (!discountAgents.length) throw new Error("Register a discount agent first.");
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
                      <div>
                        <dt>Approval expires</dt>
                        <dd>{a.approval_until ? new Date(a.approval_until).toLocaleString() : "Not applicable"}</dd>
                      </div>
                      <div>
                        <dt>Recorded effects</dt>
                        <dd>{snapshot.effects.filter(e => e.action_id === a.id).length}</dd>
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
                          <p>A different named member must approve a request you submitted.</p>
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
                            Execute discount
                          </button>
                          <button
                            className="cp-button"
                            disabled={busy}
                            onClick={() => operation(a, "execute", true)}
                          >
                            Execute · lose response
                          </button>
                        </>
                      )}
                      {["uncertain", "executing"].includes(a.state) && (
                        <button
                          className="cp-button cp-button-dark"
                          disabled={busy}
                          onClick={() => operation(a, "reconcile")}
                        >
                          Verify outcome
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
          <DiscountHistory snapshot={snapshot} />

        </>
      )}
    </div>
  );
}
