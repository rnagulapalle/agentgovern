"use client";

import { useId, useState } from "react";
import { eventLabels, telemetryDecision, telemetryRuns, telemetrySteps } from "@/lib/workspace/workflow-telemetry-view";

type Run = ReturnType<typeof telemetryRuns>[number];

function toolSummary(run: Run) {
  const count = telemetrySteps(run.events).filter(step => step.action).length;
  return count ? `${count} tool steps` : "Tool steps not reported";
}

function requestLabel(run: Run) {
  return run.policy?.requestedPercent != null ? `${run.policy.requestedPercent}% discount` : "Workflow execution";
}

/** Presentation selection never changes a saved run or sends an approval. */
export function AwsExecutionBrowser({ runs, runtimeVersion, onQuote }: {
  runs: Run[];
  runtimeVersion: string;
  onQuote: (id: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const traceId = useId();
  // Resolve from the current filtered source, never retain another run's events.
  const selected = runs.find(run => run.id === selectedId);

  return <div className={`aws-execution-browser${selected ? " has-selection" : ""}`}>
    <div className="aws-execution-list" aria-label="Workflow executions">
      <div className="aws-execution-columns" aria-hidden="true"><span>Request / channel</span><span>Decision</span><span>Outcome / started</span></div>
      {runs.map(run => <button type="button" className="aws-execution-summary aws-execution" key={run.id}
        aria-label={`Review ${requestLabel(run)} · ${run.id}`} aria-pressed={selected?.id === run.id}
        aria-controls={traceId} onClick={() => setSelectedId(run.id)}>
        <span><strong>{requestLabel(run)}</strong><small className="aws-channel">{run.trigger} · {toolSummary(run)}</small></span>
        <span>{telemetryDecision(run.events, run.policy?.decision)}</span>
        <span><span>{run.status}</span><time dateTime={run.startedAt ?? run.events[0].occurredAt}>{new Date(run.startedAt ?? run.events[0].occurredAt).toLocaleString()}</time></span>
      </button>)}
    </div>
    <aside id={traceId} className="aws-run-trace" aria-label="Execution trace">
      {selected ? <>
        <div className="aws-trace-heading"><div><span className="aws-eyebrow">SELECTED EXECUTION</span><h4>{requestLabel(selected)}</h4></div><button type="button" className="cp-button secondary" onClick={() => setSelectedId(null)}>Close trace</button></div>
        <p className="aws-trace-outcome">{selected.status}</p>
        <h4>Execution steps</h4>
        <p className="aws-field-help">Reported by the AWS workflow. This trace does not independently verify its effects.</p>
        {selected.quoteIds.length > 0 ? <p>Related quote: {selected.quoteIds.map(id => <button key={id} className="cp-button secondary" onClick={() => onQuote(id)}>{id}</button>)}</p> : <p>Quote reference was not reported in these events.</p>}
        {!selected.startObserved && <p>The execution start was not observed. The displayed time is its first observed event.</p>}
        {selected.policy && <p className="aws-field-help">Policy reported by the agent: {selected.policy.approvalThreshold !== null ? `manager approval from ${selected.policy.approvalThreshold}%.` : "Approval threshold not reported."} {selected.policy.maximumDiscount !== null ? `Requests above ${selected.policy.maximumDiscount}% are denied.` : ""}</p>}
        <ol className="aws-execution-steps" aria-label={`Execution steps for ${selected.id}`}>{telemetrySteps(selected.events).map(step => <li key={step.key}>
          <div><strong>{step.title}</strong>{step.state && <span className="aws-status">{step.state}</span>}{step.first.provider && <p>{step.first.provider}</p>}{step.last.reasonCode && <p>{step.last.reasonCode.replaceAll("_", " ")}</p>}<time dateTime={step.first.occurredAt}>{new Date(step.first.occurredAt).toLocaleTimeString()}</time>{step.first.attempt > 1 && <span> · Attempt {step.first.attempt}</span>}</div>
        </li>)}</ol>
        <details className="aws-trace-technical"><summary>Technical details · {selected.events.length} source events</summary><p>Execution reference: {selected.id}</p><p>Trace: {selected.events[0].traceId}</p><p>Enrolled runtime version: {runtimeVersion}. Deployment versions are reported by the source.</p><ol>{selected.events.map(event => <li key={event.eventId}>{eventLabels[event.eventName]}{event.actionName ? ` · ${event.actionName.replaceAll("_", " ")}` : ""} · {event.occurredAt} · Attempt {event.attempt}</li>)}</ol></details>
      </> : <div className="aws-trace-empty"><span className="aws-eyebrow">EXECUTION TRACE</span><h4>Select an execution</h4><p>See its policy decision, approval events, tool steps and reported outcome here.</p></div>}
    </aside>
  </div>;
}
