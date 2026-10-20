"use client";

import type {ActivityReference} from "@/lib/workspace/cloud-activity";
import {executionApprovalIds} from '@/lib/workspace/execution-approval-match';
import {executionReference} from "@/lib/workspace/execution-reference";
import {ExecutionBusinessContext} from "./execution-business-context";
import { useId, useState } from "react";
import { eventLabels, telemetryDecision, telemetryRuns, telemetryTimelineSteps, telemetryStepCopy, telemetryRequestLabel, telemetryOutcomeGroup, telemetryRequestContext, telemetryStepSummary, telemetryStepAgent } from "@/lib/workspace/workflow-telemetry-view";

type Run = ReturnType<typeof telemetryRuns>[number];

/** Presentation selection never changes a saved run or sends an approval. */
export function AwsExecutionBrowser({ runs, runtimeVersion, onQuote, initialSelectedId = null, detailsOnly = false, references=[] }: {
  runs: Run[];
  references?:ActivityReference[];
  runtimeVersion: string;
  onQuote: (id: string) => void;
  initialSelectedId?: string | null;
  detailsOnly?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const traceId = useId();
  // Resolve from the current filtered source, never retain another run's events.
  const selected = runs.find(run => run.id === selectedId);
  const requestContext=selected?telemetryRequestContext(selected):null;

  return <div className={`aws-execution-browser${detailsOnly ? " is-detail-view" : ""}${selected ? " has-selection" : ""}`}>
    <div className="aws-execution-list" aria-label="Workflow executions" hidden={detailsOnly}>
      <div className="aws-execution-columns" aria-hidden="true"><span>Request / channel</span><span>Decision</span><span>Outcome / started</span></div>
      {runs.map(run => <button type="button" className="aws-execution-summary aws-execution" key={run.id}
        aria-label={`Review ${telemetryRequestLabel(run)} · ${run.id}`} aria-pressed={selected?.id === run.id}
        aria-controls={traceId} onClick={() => setSelectedId(run.id)}>
        <span><strong>{telemetryRequestLabel(run)}</strong><small><span className="aws-channel">{run.trigger}</span> · {telemetryStepSummary(run)}</small></span>
        <span>{telemetryDecision(run.events, run.policy?.decision)}</span>
        <span><span>{run.status}</span><time dateTime={run.startedAt ?? run.events[0].occurredAt}>{new Date(run.startedAt ?? run.events[0].occurredAt).toLocaleString()}</time></span>
      </button>)}
    </div>
    <aside id={traceId} className="aws-run-trace" aria-label="Execution trace">
      {selected ? <>
        <section className="aws-execution-overview" aria-label="Request summary"><div className="aws-trace-heading"><div><span className="aws-eyebrow">REQUEST SUMMARY</span><h4>{telemetryRequestLabel(selected)}</h4></div>{!detailsOnly && <button type="button" className="cp-button secondary" onClick={() => setSelectedId(null)}>Close trace</button>}</div>
        <p className="aws-outcome-label">Last reported status</p><p className="aws-trace-outcome" data-outcome={telemetryOutcomeGroup(selected)}><span className="aws-outcome-dot" aria-hidden="true"/>{selected.status}</p>
        <dl className="aws-execution-facts"><div><dt>Requested through</dt><dd className="aws-channel">{selected.trigger}</dd></div><div><dt>Started</dt><dd>{new Date(selected.startedAt ?? selected.events[0].occurredAt).toLocaleString()}</dd></div></dl></section>
        <ExecutionBusinessContext key={selected.id+":"+selected.events[0]?.reportedDeploymentVersion} runId={selected.id} approvalIds={executionApprovalIds(selected.events)} reference={executionReference(selected.events,references)}/>
        <section className="aws-execution-journey" aria-label="Execution timeline"><div className="aws-execution-section-heading"><span className="aws-section-marker" aria-hidden="true">02</span><h4>Execution steps</h4></div>
        <p className="aws-timeline-caption">Workflow-reported progress · {telemetryTimelineSteps(selected.events,selected.conflict).length} steps</p>
        {selected.quoteIds.length > 0 ? <p>Related quote: {selected.quoteIds.map(id => <button key={id} className="cp-button secondary" onClick={() => onQuote(id)}>{id}</button>)}</p> : null}
        <ol className="aws-execution-steps aws-human-timeline" aria-label={`Execution steps for ${selected.id}`}>{telemetryTimelineSteps(selected.events,selected.conflict).map((step,index) => {
          const copy=telemetryStepCopy(step);
          const agent=telemetryStepAgent(step,selected.conflict);
          return <li key={step.key} data-tone={copy.tone}><span className="aws-timeline-node" aria-hidden="true">{copy.tone==="done"?"✓":index+1}</span>
            <div className="aws-timeline-content"><div className="aws-timeline-title"><strong>{copy.title}</strong><time dateTime={step.first.occurredAt}>{new Date(step.first.occurredAt).toLocaleTimeString()}</time></div>
            <div className="aws-step-agent" data-reported={agent.reported}><span>{agent.label}</span><strong title={agent.sourceName??undefined}>{agent.name}</strong>{!agent.reported&&<span>Name not reported</span>}</div>
            {step.first.eventName==="workflow.started"&&requestContext?<div className="aws-request-context"><p>{requestContext.description}</p><p className="aws-request-metadata"><span className="aws-channel">{requestContext.channel}</span>{requestContext.version&&<span>Reported version {requestContext.version}</span>}</p><small>Original request text wasn’t shared by this workflow. Time shown is when processing started.</small></div>:copy.detail&&<p>{copy.detail}</p>}<div className="aws-timeline-meta">{step.state&&<span className="aws-status">{step.first.actionName==="request_approval"&&step.state==="Completed"?"Request sent":step.state}</span>}{copy.provider&&copy.provider!=="internal"&&<span>{copy.provider}</span>}{step.first.attempt>1&&<span>Attempt {step.first.attempt}</span>}</div>
            {step.first.eventName==="policy.evaluated"&&<section className="aws-policy-evidence" aria-label="Policy checked"><h5>Policy checked</h5><dl className="aws-review-grid">{(step.first.requestedPercent!==null||step.first.approvalThreshold!==null||step.first.maximumDiscount!==null)&&<><div><dt>Requested discount</dt><dd>{step.first.requestedPercent!==null?`${step.first.requestedPercent}%`:"Not reported"}</dd></div><div><dt>Manager review from</dt><dd>{step.first.approvalThreshold!==null?`${step.first.approvalThreshold}%`:"Not reported"}</dd></div><div><dt>Denied above</dt><dd>{step.first.maximumDiscount!==null?`${step.first.maximumDiscount}%`:"Not reported"}</dd></div></>}<div><dt>Decision</dt><dd>{telemetryDecision([],step.first.decision)}</dd></div><div><dt>Rule</dt><dd>{step.first.ruleId??"Not reported"}</dd></div><div><dt>Rule version</dt><dd>{step.first.ruleVersion??"Not reported"}</dd></div></dl><p className="aws-field-help">Reported by the workflow · this is not a list of every internal rule or proof of enforcement.</p></section>}
            {step.first.eventName==="approval.approved"&&<p className="aws-field-help">The workflow reported approval. See the matched approval record above for the reviewer; this event does not identify them.</p>}
            {step.last.reasonCode&&<details><summary>Reported reason</summary><p>{step.last.reasonCode.replaceAll("_"," ")}</p></details>}</div>
          </li>;
        })}</ol></section>
        <details className="aws-evidence-note aws-execution-evidence"><summary>Source coverage &amp; approval rules</summary>
          <p>Last reported state, not a live approval queue. Reported by the AWS workflow. This trace does not independently verify its effects.</p>
          {selected.quoteIds.length===0 && <p>A related business record was not included in these workflow events.</p>}
          {!selected.startObserved && <p>The execution start was not observed. The displayed time is its first observed event.</p>}
          {selected.policy && <div><h4>Approval rules for this request</h4><p>Policy reported by the agent: {selected.policy.approvalThreshold !== null ? `manager approval from ${selected.policy.approvalThreshold}%.` : "Approval threshold not reported."} {selected.policy.maximumDiscount !== null ? `Requests above ${selected.policy.maximumDiscount}% are denied.` : ""}</p></div>}
        </details>
        <details className="aws-trace-technical"><summary>Technical details · {selected.events.length} source events</summary><p>Execution reference: {selected.id}</p><p>Trace: {selected.events[0].traceId}</p><p>Enrolled runtime version: {runtimeVersion}. Deployment versions are reported by the source.</p><ol>{selected.events.map(event => <li key={event.eventId}>{eventLabels[event.eventName]}{event.actionName ? ` · ${event.actionName.replaceAll("_", " ")}` : ""} · {event.occurredAt} · Attempt {event.attempt}</li>)}</ol></details>
      </> : <div className="aws-trace-empty"><span className="aws-eyebrow">EXECUTION TRACE</span><h4>Select an execution</h4><p>See its policy decision, approval events, tool steps and reported outcome here.</p></div>}
    </aside>
  </div>;
}
