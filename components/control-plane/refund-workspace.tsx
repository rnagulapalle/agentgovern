"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PageTitle, Status } from "./ui";
import {
  PAYMENT,
  money,
  type RefundAction,
  type RefundProposal,
  type RefundSnapshot,
} from "@/lib/refunds/contracts";
const endpoint = "/api/durable/refunds";
const labels: Record<string, string> = {
  held: "Needs approval",
  ready: "Ready to refund",
  executing: "Refund in progress",
  succeeded: "Refund verified",
  blocked: "Blocked before payment",
  uncertain: "Verify before retry",
  conflict: "Manual review",
  cancelled: "Authority invalidated",
  rejected: "Rejected",
};
export function RefundWorkspace() {
  const [snapshot, setSnapshot] = useState<RefundSnapshot | null>(null);
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState(500);
  const [submitted, setSubmitted] = useState<RefundProposal | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const refresh = useCallback(async () => {
    const r = await fetch(endpoint, { cache: "no-store" });
    const data = await r.json();
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) setSnapshot(null);
      throw new Error(data.error);
    }
    setSnapshot(data);
    return data as RefundSnapshot;
  }, []);
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
  }, [refresh]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Request failed; inspect state before retry.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function request(value: Record<string, unknown>) {
    const r = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(value),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    await refresh();
    if (data.id) setSelected(data.id);
    setNotice(data.reason || "Refund controls updated.");
  }
  async function action(
    a: RefundAction,
    operation: string,
    lostResponse = false,
  ) {
    await task(() =>
      request({
        operation,
        actionId: a.id,
        ...(["approve", "reject"].includes(operation)
          ? { payloadHash: a.payload_hash }
          : {}),
        ...(operation === "execute" ? { lostResponse } : {}),
      }),
    );
  }
  const current =
    snapshot?.actions.find((a) => a.id === selected) || snapshot?.actions[0];
  const rows = showHistory ? snapshot?.actions : current ? [current] : [];
  return (
    <div className="cp-durable cp-refunds">
      <PageTitle
        eyebrow="FETCHSANDBOX · TEST PAYMENTS"
        title="A refund agent you can supervise"
        description="A customer asks for a refund. See what the agent can do, what needs your approval, and how an uncertain payment gets resolved."
        action={
          snapshot ? (
            <button
              className="cp-button"
              disabled={busy}
              onClick={() =>
                task(async () => {
                  await refresh();
                  setNotice("Read fresh database and provider state.");
                })
              }
            >
              Refresh evidence
            </button>
          ) : undefined
        }
      />
      <div className="cp-durable-scope">
        <strong>
          Real control-plane transactions. Simulated payment provider.
        </strong>
        <p>
          PostgreSQL saves every decision. A dedicated local FetchSandbox Stripe
          twin holds the test payment and refunds. No real money moves; no model
          is called. The operator drives the prepared agent proposal for this
          walkthrough.
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
          <h2>Open the refund workspace</h2>
          <p>
            Use the same operator token as the durable workspace. It stays in an
            HTTP-only session, never browser storage.
          </p>
          <form
            className="cp-durable-form"
            onSubmit={(e) => {
              e.preventDefault();
              task(async () => {
                const r = await fetch("/api/durable/session", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ token }),
                });
                const v = await r.json();
                if (!r.ok) throw new Error(v.error);
                setToken("");
                await refresh();
              });
            }}
          >
            <label>
              Operator access token
              <input
                type="password"
                value={token}
                autoComplete="off"
                onChange={(e) => setToken(e.target.value)}
                required
              />
            </label>
            <button className="cp-button is-primary" disabled={busy}>
              Open workspace
            </button>
          </form>
        </section>
      ) : (
        <>
          <ol className="cp-refund-steps" aria-label="Refund walkthrough">
            <li>
              <b>1</b> Set boundaries
            </li>
            <li>
              <b>2</b> Propose refund
            </li>
            <li>
              <b>3</b> Review approval
            </li>
            <li>
              <b>4</b> Execute
            </li>
            <li>
              <b>5</b> Verify outcome
            </li>
          </ol>
          <div className="cp-durable-grid">
            <section className="cp-panel cp-durable-card">
              <h2>1. Agent boundaries</h2>
              <Status value={snapshot.agent?.active ? "active" : "contained"} />
              <p>
                <strong>Customer-support refund agent</strong>
                <br />
                Registered identity: refund-agent
                <br />
                Permission: stripe.refund
                <br />
                Scope: this prepared USD payment only.
              </p>
              <p>
                Auto-approve up to{" "}
                <strong>{money(snapshot.policy.auto_limit)}</strong>.<br />
                Human approval up to{" "}
                <strong>{money(snapshot.policy.hard_limit)}</strong>.<br />
                Larger refunds are blocked.
              </p>
              <p>
                Allowance used or reserved: {money(snapshot.policy.reserved)} /{" "}
                {money(snapshot.policy.budget)}. This is a lifetime demo
                allowance, not a daily budget.
              </p>
              <div className="cp-durable-buttons">
                <button
                  className="cp-button"
                  disabled={busy}
                  onClick={() =>
                    task(() =>
                      request({
                        operation: "configure",
                        agentActive: !snapshot.agent?.active,
                      }),
                    )
                  }
                >
                  {snapshot.agent?.active
                    ? "Contain refund agent"
                    : "Enable refund agent"}
                </button>
                <button
                  className="cp-button"
                  disabled={busy}
                  onClick={() =>
                    task(() =>
                      request({
                        operation: "configure",
                        autoLimit: snapshot.policy.auto_limit === 0 ? 1000 : 0,
                      }),
                    )
                  }
                >
                  {snapshot.policy.auto_limit === 0
                    ? "Allow small refunds"
                    : "Require approval for every refund"}
                </button>
              </div>
            </section>
            <section className="cp-panel cp-durable-card">
              <h2>2. Customer request</h2>
              <p>
                A customer requests a partial refund for a service issue on test
                order LL-1001.
              </p>
              <form
                className="cp-durable-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const p: RefundProposal = {
                    actionId: crypto.randomUUID(),
                    agentId: "refund-agent",
                    paymentId: PAYMENT,
                    amount,
                    currency: "usd",
                  };
                  setSubmitted(p);
                  task(() => request({ operation: "propose", ...p }));
                }}
              >
                <label>
                  Refund amount
                  <select
                    value={amount}
                    onChange={(e) => setAmount(Number(e.target.value))}
                  >
                    <option value={500}>$5 — within default authority</option>
                    <option value={2500}>$25 — needs approval</option>
                    <option value={15000}>$150 — above the hard limit</option>
                  </select>
                </label>
                <button className="cp-button is-primary" disabled={busy}>
                  Propose refund
                </button>
              </form>
              <button
                className="cp-button"
                disabled={busy || !submitted}
                onClick={() =>
                  submitted &&
                  task(() => request({ operation: "propose", ...submitted }))
                }
              >
                Replay the same request
              </button>
              <p className="cp-durable-help">
                A replay keeps the original action ID and amount. It must not
                reserve money twice or issue another refund.
              </p>
            </section>
            <section className="cp-panel cp-durable-card">
              <h2>Provider evidence</h2>
              <Status
                value={snapshot.provider.available ? "active" : "uncertain"}
                label={
                  snapshot.provider.available
                    ? "FetchSandbox twin connected"
                    : "Provider unavailable"
                }
              />
              <p className="cp-durable-number">
                {snapshot.provider.payment
                  ? money(snapshot.provider.payment.amount_refunded)
                  : "—"}
              </p>
              <p>
                Refunded from the{" "}
                {snapshot.provider.payment
                  ? money(snapshot.provider.payment.amount)
                  : "$1,000"}{" "}
                test payment.
              </p>
              <p>
                <strong>
                  {snapshot.provider.available
                    ? snapshot.provider.refunds.length
                    : "—"}
                </strong>{" "}
                provider refund records. These are read from the twin, not
                inferred from the dashboard.
              </p>
              <p className="cp-durable-help">
                A successful refund is not reversible here. Recovery verifies
                the outcome; it does not charge the customer again.
              </p>
            </section>
          </div>
          <section className="cp-panel cp-durable-card">
            <h2>3–5. Follow the refund</h2>
            <p>
              For the recovery proof, execute a ready refund with “Lose the
              response.” The twin records the refund before the request times
              out. Then reconcile to verify that existing refund.
            </p>
            <div className="cp-durable-actions">
              {rows?.length ? (
                rows.map((a) => (
                  <article key={a.id}>
                    <div className="cp-durable-action-head">
                      <h3>{money(a.amount)} refund</h3>
                      <Status value={a.state} label={labels[a.state]} />
                    </div>
                    <p>{a.reason}</p>
                    <dl>
                      <div>
                        <dt>Action ID / retry identity</dt>
                        <dd className="cp-durable-id">{a.id}</dd>
                      </div>
                      <div>
                        <dt>Policy / named approver</dt>
                        <dd>
                          Version {a.policy_version} ·{" "}
                          {a.approved_by || "No human approval recorded"}
                        </dd>
                      </div>
                      <div>
                        <dt>Provider refund ID</dt>
                        <dd className="cp-durable-id">
                          {a.provider_id || "Not yet verified"}
                        </dd>
                      </div>
                      <div>
                        <dt>Provider status</dt>
                        <dd>{a.provider_status || "Unknown until verified"}</dd>
                      </div>
                    </dl>
                    <div className="cp-durable-buttons">
                      {a.state === "held" && (
                        <>
                          <button
                            className="cp-button is-primary"
                            disabled={busy}
                            onClick={() => action(a, "approve")}
                          >
                            Approve exact {money(a.amount)}
                          </button>
                          <button
                            className="cp-button"
                            disabled={busy}
                            onClick={() => action(a, "reject")}
                          >
                            Reject refund
                          </button>
                        </>
                      )}
                      {a.state === "ready" && (
                        <>
                          <button
                            className="cp-button is-primary"
                            disabled={busy}
                            onClick={() => action(a, "execute")}
                          >
                            Execute refund
                          </button>
                          <button
                            className="cp-button"
                            disabled={busy}
                            onClick={() => action(a, "execute", true)}
                          >
                            Execute · lose the response
                          </button>
                        </>
                      )}
                      {["uncertain", "executing"].includes(a.state) && (
                        <button
                          className="cp-button is-primary"
                          disabled={busy}
                          onClick={() => action(a, "reconcile")}
                        >
                          Reconcile with provider
                        </button>
                      )}
                      {a.state === "succeeded" && (
                        <p>
                          <strong>
                            Verified. No second refund and no automatic
                            rollback.
                          </strong>
                        </p>
                      )}
                    </div>
                  </article>
                ))
              ) : (
                <p>
                  Propose a refund to start. Try $5, $25, and $150 to see the
                  three decisions.
                </p>
              )}
            </div>
            <button
              className="cp-button"
              onClick={() => setShowHistory(!showHistory)}
            >
              {showHistory
                ? "Show current refund"
                : "Show recent refund history"}
            </button>
          </section>
          <section className="cp-panel cp-durable-card">
            <h2>Persisted decisions</h2>
            <p>
              Last 100 events. Reloading the page preserves the PostgreSQL
              history.
            </p>
            <ul className="cp-durable-events">
              {snapshot.events.slice(0, 12).map((e) => (
                <li key={e.id}>
                  <strong>
                    {e.kind.replaceAll("_", " ")} · {e.subject}
                  </strong>
                  <span className="cp-durable-id">{e.action_id}</span>
                  <span>{new Date(e.at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
      <p className="cp-durable-help">
        <Link href="/control-plane/durable">
          Open the original durable record proof →
        </Link>
      </p>
    </div>
  );
}
