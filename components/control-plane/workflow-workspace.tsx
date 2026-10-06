"use client";
import { useCallback, useEffect, useState, useRef } from "react";
import Link from "next/link";
import { PageTitle } from "./ui";
import { RequestPlanner } from "./request-planner";
import { explainStep } from "@/lib/workflows/request";
type Step = {
  ordinal: number;
  action_id: string;
  agent_id: string;
  connector: string;
  payload: object;
  state: string | null;
  reason: string | null;
  payload_hash: string | null;
};
type Run = { id: string; state: string; steps: Step[] };
type Agent = { id: string; tools: string[] };
async function call(url: string, p?: object) {
  const r = await fetch(url, {
    cache: "no-store",
    ...(p
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(p),
        }
      : {}),
  });
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Request could not be confirmed.");
  return d;
}
export function WorkflowWorkspace({ guided = false, embeddedRunId }: { guided?: boolean; embeddedRunId?: string }) {
  const [reviewed, setReviewed] = useState(false);
  const creation = useRef<string>("");
  const [agents, setAgents] = useState<Agent[]>([]),
    [runs, setRuns] = useState<{ id: string; state: string }[]>([]),
    [run, setRun] = useState<Run | null>(null),
    [crm, setCrm] = useState(""),
    [email, setEmail] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [a, r] = await Promise.all([
      call("/api/workspace/agents"),
      call("/api/durable/workflows"),
    ]);
    setAgents(a.agents);
    setRuns(r);
  }, []);
  useEffect(() => {
    load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    if (embeddedRunId) call("/api/durable/workflows?run=" + embeddedRunId).then(setRun).catch((e) => setError(e.message));
  }, [embeddedRunId]);
  async function task(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The request could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function open(id: string) {
    setRun(await call("/api/durable/workflows?run=" + id));
  }
  async function action(s: Step, operation: string, lostResponse = false) {
    await task(async () => {
      await call(
        "/api/durable/connectors",
        operation === "propose"
          ? {
              operation,
              actionId: s.action_id,
              agentId: s.agent_id,
              connector: s.connector,
              payload: s.payload,
            }
          : operation === "approve"
            ? { operation, actionId: s.action_id, payloadHash: s.payload_hash }
            : operation === "execute"
              ? { operation, actionId: s.action_id, lostResponse }
              : { operation, actionId: s.action_id },
      );
      await open(run!.id);
    });
  }
  return (
    <div className="cp-durable">
      {!embeddedRunId && <PageTitle
        eyebrow={guided ? "WORK WITH AGENTS" : "SAVED WORKFLOW RUNS"}
        title={guided ? "Describe the work. Review the plan." : "Keep the next step on hold"}
        description={guided ? "Prepare a supported job, choose scoped agents, and follow decisions through approval and verified outcomes." : "Verify a record update before a customer message can execute. Decisions and dependencies survive a refresh."}
      />}
      <section className="cp-durable-scope">
        <strong>Prepared CRM and messaging workflow.</strong>
        <p>
          Two scoped agents submit actions; named people approve them. A final
          check verifies both outcomes. External systems are private
          FetchSandbox twins: no real CRM, email or model is connected.
        </p>
      </section>
      {guided && <RequestPlanner onReview={setReviewed} />}
      {error && (
        <p role="alert" className="cp-durable-error">
          {error}
        </p>
      )}
      {!embeddedRunId && (!guided || reviewed) && <section className="cp-panel cp-durable-card">
        <h2>Start a customer handoff</h2>
        <p>
          Choose registered agents. Enrollment restricts them to workflow steps;
          standalone requests are refused. The message stays held until the
          record update is verified.
        </p>
        <div className="cp-durable-form">
          <label>
            CRM agent{" "}
            <select value={crm} onChange={(e) => setCrm(e.target.value)}>
              <option value="">Choose an agent</option>
              {agents
                .filter((a) => a.tools.includes("twin.crm"))
                .map((a) => (
                  <option key={a.id}>{a.id}</option>
                ))}
            </select>
          </label>{" "}
          <label>
            Messaging agent{" "}
            <select value={email} onChange={(e) => setEmail(e.target.value)}>
              <option value="">Choose an agent</option>
              {agents
                .filter((a) => a.tools.includes("twin.email"))
                .map((a) => (
                  <option key={a.id}>{a.id}</option>
                ))}
            </select>
          </label>{" "}
          <button
            className="cp-button"
            disabled={busy || !crm || !email}
            onClick={() =>
              task(async () => {
                if (!creation.current) creation.current = crypto.randomUUID();
                const r = await call("/api/durable/workflows", {
                  operation: "create",
                  crmAgent: crm,
                  emailAgent: email,
                  runId: creation.current,
                });
                creation.current = "";
                await open(r.id);
              })
            }
          >
          {guided ? "Create reviewed workflow" : "Start workflow"}
          </button>
        </div>
        <p>
          <Link href="/control-plane/agents">Register agents →</Link>
        </p>
      </section>}
      {!embeddedRunId && <section className="cp-panel cp-durable-card">
        <h2>Saved runs</h2>
        {runs.map((r) => (
          <p key={r.id}>
            <button disabled={busy} onClick={() => task(() => open(r.id))}>
              {r.id.slice(0, 8)} · {r.state}
            </button>
          </p>
        ))}
      </section>}
      {run && (
        <section className="cp-panel cp-durable-card">
          <h2>Customer handoff · {run.state}</h2>
          <p className="cp-durable-id">Run {run.id}</p>
          {run.steps.map((s) => (
            <article className="cp-durable-scope" key={s.ordinal}>
              <h3>
                {s.ordinal === 1
                  ? `1. Set the sample contact lifecycle to ${(s.payload as { lifecycle: string }).lifecycle}`
                  : "2. Send the prepared acknowledgement"}
              </h3>
              <p>
                {s.agent_id} · {s.state || "Not submitted"}
              </p>
              <p>
                {s.reason || "The scoped agent can now submit this exact step."}
              </p>
              <p>{explainStep(s.state)}</p>
              <div className="cp-durable-grid">
                {!s.state && (
                  <button disabled={busy} onClick={() => action(s, "propose")}>
                    Submit prepared action
                  </button>
                )}
                {s.state === "held" && (
                  <button disabled={busy} onClick={() => action(s, "approve")}>
                    Approve exact action
                  </button>
                )}
                {s.state === "ready" && (
                  <>
                    <button
                      disabled={busy}
                      onClick={() => action(s, "execute")}
                    >
                      Execute
                    </button>
                    <button
                      disabled={busy}
                      onClick={() => action(s, "execute", true)}
                    >
                      Execute · lose response
                    </button>
                  </>
                )}
                {["uncertain", "executing", "succeeded"].includes(
                  s.state || "",
                ) && (
                  <button
                    disabled={busy}
                    onClick={() => action(s, "reconcile")}
                  >
                    Verify outcome
                  </button>
                )}
              </div>
            </article>
          ))}
          <h3>3. Verify the full run</h3>
          <p>
            Both effects must be confirmed. Uncertainty and conflicting records
            keep the run open.
          </p>
          <p>Pausing stops new dispatches; an action already sent may still take effect. Paused runs cannot resume in this version.</p>
          <button
            disabled={busy || run.state !== "active"}
            className="cp-button"
            onClick={() =>
              task(async () => {
                await call("/api/durable/workflows", {
                  operation: "verify",
                  runId: run.id,
                });
                await open(run.id);
              })
            }
          >
            Verify and complete
          </button>{" "}
          <button
            disabled={busy || run.state !== "active"}
            onClick={() =>
              task(async () => {
                await call("/api/durable/workflows", {
                  operation: "pause",
                  runId: run.id,
                });
                await open(run.id);
              })
            }
          >
            Pause workflow
          </button>
          <details>
            <summary>Connect an external agent</summary>
            <p>
              Use its private scoped key with the workflow-agent example. Each
              agent receives only its own step. It can submit and inspect, but
              cannot approve or execute. Prepared buttons above submit as the
              signed-in person; they do not run an autonomous agent.
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
