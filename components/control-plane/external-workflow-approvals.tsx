"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ActivityReference } from "@/lib/workspace/cloud-activity";
import type { ExternalApproval } from "@/lib/workspace/external-approvals";
import { workspaceJson } from "@/lib/workspace/response";
type Snapshot={connected:boolean;requests:ExternalApproval[];reviewer:string;canReview:boolean;selfReviewAllowed?:boolean};
export function ExternalWorkflowApprovals({reference,onDecision}:{reference:ActivityReference;onDecision:()=>void}){
 const [snapshot,setSnapshot]=useState<Snapshot|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[checked,setChecked]=useState<number|null>(null);
 const [reason,setReason]=useState(""),[selected,setSelected]=useState<ExternalApproval|null>(null);
 const generation=useRef(0),sending=useRef(false),reconcileRequired=useRef(false),prior=useRef<string|null>(null),change=useRef(onDecision);change.current=onDecision;
 const {connectionId,resourceArn,version}=reference;
 const api=useCallback(async(command:object)=>{const r=await fetch("/api/workspace/discovery/approvals",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({connectionId,resourceArn,version,...command}),cache:"no-store"});const data=await workspaceJson(r);if(!r.ok)throw Error(data.error);return data as Snapshot;},[connectionId,resourceArn,version]);
 const refresh=useCallback(async()=>{if(sending.current)return;const n=++generation.current;try{const d=await api({operation:"list"});if(n===generation.current){const states=JSON.stringify(d.requests.map(a=>[a.id,a.status,a.decidedAt,a.executionStatus]));const changed=prior.current!==null&&states!==prior.current;prior.current=states;setSnapshot(d);setChecked(Date.now());setError("");reconcileRequired.current=false;if(changed)change.current();}}catch(e){if(n===generation.current){setError(e instanceof Error?e.message:"Approval connection unavailable.");setSnapshot(null);}}},[api]);
 useEffect(()=>{const requests=generation;requests.current++;prior.current=null;setSnapshot(null);setSelected(null);setChecked(null);void refresh();const timer=setInterval(()=>{if(document.visibilityState==="visible")void refresh();},15000);const visible=()=>{if(document.visibilityState==="visible")void refresh();};document.addEventListener("visibilitychange",visible);return()=>{requests.current++;clearInterval(timer);document.removeEventListener("visibilitychange",visible);};},[refresh]);
 async function decide(a:ExternalApproval,decision:"approved"|"rejected"){
  if(sending.current||reconcileRequired.current)return;sending.current=true;setBusy(true);setError("");const n=++generation.current;
  try{const d=await api({operation:"decide",id:a.id,revision:a.revision,decision});if(n===generation.current){setSnapshot(d);setChecked(Date.now());setSelected(null);setReason(`Decision saved by the AWS workflow: ${decision}. Execution outcome is shown separately in history.`);onDecision();}}
  catch(e){if(n===generation.current){reconcileRequired.current=true;setSnapshot(null);setSelected(null);setError(e instanceof Error?e.message:"The decision could not be confirmed. Refresh before another action.");}}
  finally{sending.current=false;if(n===generation.current)setBusy(false);}
 }
 return <section className="aws-connection-panel" aria-label="Shared workflow approvals"><h3>Workflow approvals</h3>
 <p>The AWS workflow owns each decision. Slack and LoopLabs review the same request; approving authorizes the proposed change, not a completed outcome.</p>
 {error&&<p role="alert">{error}</p>}{reason&&<p role="status">{reason}</p>}
 {snapshot&&!snapshot.connected&&<p>Approval connection is not configured for this agent. History remains read-only; no decision can be sent from here.</p>}
 {snapshot?.connected&&<p>Checks for changes every 15 seconds while this page is visible.{checked?` Last checked ${new Date(checked).toLocaleTimeString()}.`:""} A connection error stops approval controls.</p>}
 <button className="cp-button secondary" disabled={busy} onClick={()=>void refresh()}>Refresh approvals</button>
 {snapshot?.connected&&snapshot.selfReviewAllowed&&<p>Demo setting: a configured reviewer may approve their own request for this connected workflow.</p>}
 {snapshot?.connected&&snapshot.requests.length===0&&<p>No approval requests were returned by the connected workflow.</p>}
 {snapshot?.connected&&snapshot.requests.map(a=><article className="aws-connection-panel" key={a.id}><h4>{a.title}</h4><p><strong>{a.status==="pending"?"Awaiting review":a.status}</strong> · Execution: {a.executionStatus}</p><p><strong>Why review is needed:</strong> {a.reason}</p><dl><dt>Proposed action</dt><dd>{a.action}</dd><dt>System</dt><dd>{a.system}</dd><dt>Current value</dt><dd>{a.before}</dd><dt>Proposed value</dt><dd>{a.after}</dd><dt>Requested by</dt><dd>{a.requestedBy}</dd><dt>Policy</dt><dd>{a.policyVersion}</dd><dt>Decision deadline</dt><dd>{new Date(a.expiresAt).toLocaleString()}</dd></dl>
 {a.decidedBy&&<p>Decision by {a.decidedBy}{a.decidedAt?` at ${new Date(a.decidedAt).toLocaleString()}`:""}. This is the workflow’s saved decision.</p>}
 {a.status==="pending"&&(Date.parse(a.expiresAt)<=Date.now()?<p>This request has expired. Refresh to check the workflow.</p>:!snapshot.canReview||!a.allowedReviewers.includes(snapshot.reviewer)?<p>Your account cannot review this request.</p>:a.requestedBy===snapshot.reviewer&&!snapshot.selfReviewAllowed?<p>A different authorized reviewer must decide your request.</p>:selected?.id===a.id&&selected.revision===a.revision?<div><p>Confirm the exact change above. The workflow will recheck the request and resume according to its existing rules.</p><button className="cp-button" disabled={busy} onClick={()=>void decide(a,"approved")}>Confirm approval</button><button className="cp-button secondary" disabled={busy} onClick={()=>void decide(a,"rejected")}>Confirm rejection</button><button className="cp-button secondary" disabled={busy} onClick={()=>setSelected(null)}>Cancel review</button></div>:<button className="cp-button" disabled={busy} onClick={()=>setSelected(a)}>Review decision</button>)}
 <details><summary>Request reference</summary><p>{a.id} · Execution {a.runId}</p></details></article>)}
 </section>;
}
