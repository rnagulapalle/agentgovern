"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageTitle } from "./ui";
import { EXAMPLE_PROMPT, type Plan } from "@/lib/back-office/plan";
import type { Case } from "@/lib/back-office/service";
type Draft = { id: string; hash: string; plan: Plan; published: boolean };
async function call(payload?: object) {
  const r = await fetch("/api/durable/back-office", {
    cache: "no-store",
    ...(payload
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "The request could not be verified.");
  return d;
}
export function BackOfficeWorkspace() {
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT),
    [plans, setPlans] = useState<Draft[]>([]),
    [cases, setCases] = useState<Case[]>([]),
    [selected, setSelected] = useState(""),
    [amount, setAmount] = useState("20"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const draftKey = useRef(""),
    caseKey = useRef("");
  const load = useCallback(async () => {
    const d = await call();
    setPlans(d.plans);
    setCases(d.cases);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  async function task(fn: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to verify this operation.",
      );
    } finally {
      setBusy(false);
    }
  }
  const plan = plans.find((p) => p.id === selected);
  return (
    <div className="cp-durable cp-backoffice">
      <PageTitle
        eyebrow="CANCELLATION BACK OFFICE"
        title="From cancellation to a verified confirmation"
        description="Describe the process, review its boundaries, and test it with a second approver before enabling the prepared workflow."
      />
      <section className="cp-durable-scope">
        <strong>
          Private provider-twin workflow · no real orders, money or email.
        </strong>
        <p>
          This bounded template uses the existing refund controls, a sample
          order fixture and FetchSandbox email. The prompt configures this
          process; it is not a general AI workflow builder. Each case shares the
          prepared test payment and sends only to customer@example.test.
        </p>
      </section>
      {error && (
        <p role="alert" className="cp-durable-error">
          {error}
        </p>
      )}
      <section className="cp-panel cp-durable-card">
        <h2>1. Describe your process</h2>
        <p>
          Keep these five instructions. Change the refund ceiling between $1 and
          $100. Other requirements are flagged for review.
        </p>
        <label>
          Process description
          <textarea
            rows={5}
            value={prompt}
            onChange={(e) => {
              setPrompt(e.target.value);
              draftKey.current = "";
            }}
          />
        </label>
        <button
          className="cp-button"
          disabled={busy}
          onClick={() =>
            task(async () => {
              draftKey.current ||= crypto.randomUUID();
              const p = await call({
                operation: "draft",
                id: draftKey.current,
                prompt,
              });
              setSelected(p.id);
            })
          }
        >
          Review draft
        </button>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>2. Review the plan</h2>
        <label>
          Saved process
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              caseKey.current = "";
            }}
          >
            <option value="">Choose a process</option>
            {plans.map((p) => (
              <option key={p.id} value={p.id}>
                Cancellation · ${(p.plan.limit / 100).toFixed(0)} ceiling ·{" "}
                {p.published ? "Enabled" : "Draft"}
              </option>
            ))}
          </select>
        </label>
        {plan && (
          <>
            <ol>
              {plan.plan.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p>
              A different person approves the exact amount and recipient for 15
              minutes. Fulfilled or uncertain orders cannot proceed. Refund
              uncertainty holds the confirmation. A timeout is never permission
              to repeat a write.
            </p>
          </>
        )}
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>3. Test one cancellation</h2>
        <p>
          Create a sample cancellation, then ask the other founder to approve
          it. The approver can run each step and inspect its evidence. There is
          no unattended worker or inbound customer webhook in this version.
        </p>
        <label>
          Refund amount (USD)
          <input
            type="number"
            min="1"
            max="100"
            step="0.01"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              caseKey.current = "";
            }}
          />
        </label>
        <button
          className="cp-button"
          disabled={busy || !plan}
          onClick={() =>
            task(async () => {
              caseKey.current ||= crypto.randomUUID();
              await call({
                operation: "create",
                id: caseKey.current,
                planId: selected,
                amount: Math.round(Number(amount) * 100),
              });
              caseKey.current = "";
            })
          }
        >
          Create test cancellation
        </button>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>4. Enable the tested plan</h2>
        <p>
          Enabling requires a completed test for this exact plan. It saves your
          reviewed configuration for more sample cases; it does not deploy a
          live customer integration.
        </p>
        <button
          disabled={busy || !plan || plan.published}
          className="cp-button"
          onClick={() =>
            task(() =>
              call({ operation: "publish", id: plan!.id, hash: plan!.hash }),
            )
          }
        >
          {plan?.published
            ? "Enabled for provider twins"
            : "Enable tested plan"}
        </button>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>Cancellation inbox</h2>
        <p>
          Approvals {cases.filter((c) => c.state === "held").length} · Needs
          attention{" "}
          {
            cases.filter(
              (c) => c.state.includes("uncertain") || c.state === "blocked",
            ).length
          }{" "}
          · Completed {cases.filter((c) => c.state === "completed").length}
        </p>
        {!cases.length && (
          <p>No cancellations yet. Start with one test case above.</p>
        )}
        {cases.map((c) => (
          <article className="cp-durable-scope" key={c.id}>
            <h3>
              ${(c.amount / 100).toFixed(2)} cancellation ·{" "}
              {c.state.replaceAll("_", " ")}
            </h3>
            <p>{c.reason}</p>
            <p>
              Requested by {c.created_by}
              {c.approved_by ? ` · Approved by ${c.approved_by}` : ""}
            </p>
            <p>Sample order {c.id.slice(0, 8)} · Fixed test customer</p>
            <div className="cp-durable-grid">
              {c.state === "held" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    task(() =>
                      call({
                        operation: "approve",
                        id: c.id,
                        hash: c.payload_hash,
                      }),
                    )
                  }
                >
                  Approve exact cancellation
                </button>
              )}
              {["ready", "refund_ready", "email_ready"].includes(c.state) && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      task(() =>
                        call({
                          operation: "advance",
                          id: c.id,
                          loseResponse: false,
                        }),
                      )
                    }
                  >
                    Run next step
                  </button>
                  <button
                    disabled={busy}
                    onClick={() =>
                      task(() =>
                        call({
                          operation: "advance",
                          id: c.id,
                          loseResponse: true,
                        }),
                      )
                    }
                  >
                    Test lost response
                  </button>
                </>
              )}
              {c.state.includes("uncertain") ||
              ["cancelling", "refunding", "emailing"].includes(c.state) ? (
                <button
                  disabled={busy}
                  onClick={() =>
                    task(() => call({ operation: "inspect", id: c.id }))
                  }
                >
                  Inspect provider evidence
                </button>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
