"use client";
import { useEffect, useRef, useState } from "react";
import { workspaceJson } from "@/lib/workspace/response";
import type { ActivityReference } from "@/lib/workspace/cloud-activity";
import type { WorkflowTelemetryWindow } from "@/lib/workspace/workflow-telemetry";
import { eventLabels, telemetryRuns } from "@/lib/workspace/workflow-telemetry-view";
async function operation(value:object){const r=await fetch("/api/workspace/discovery/onboarding",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value),cache:"no-store"});const data=await workspaceJson(r);if(!r.ok)throw Error(data.error);return data;}
type History=WorkflowTelemetryWindow&{checkedAt:string;enrollment:{displayName:string;owner:string;logGroup:string;enrolledAt:string}};
export function AwsWorkflowHistory({reference,name}:{reference:ActivityReference;name:string}){
 const [owners,setOwners]=useState<{email:string;name:string}[]>([]),[sources,setSources]=useState<string[]>([]),[truncated,setTruncated]=useState(false);
 const [displayName,setDisplayName]=useState(name),[owner,setOwner]=useState(""),[logGroup,setLogGroup]=useState("");
 const [history,setHistory]=useState<History|null>(null),[hours,setHours]=useState(24),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const generation=useRef(0),request=useRef<{signature:string;id:string}|null>(null);
 const key=JSON.stringify(reference);
 useEffect(()=>{const requests=generation;++requests.current;let active=true;setOwners([]);setHistory(null);setError("");setNotice("");setBusy(false);setDisplayName(name);setLogGroup("");setOwner("");setSources([]);setTruncated(false);request.current=null;
  fetch("/api/workspace/discovery/owners",{cache:"no-store"}).then(async r=>{const data=await workspaceJson(r);if(!r.ok)throw Error(data.error);if(active)setOwners(data.owners);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;requests.current++;};
 },[key,name]);
 async function loadSources(){const n=++generation.current;setBusy(true);setError("");try{const d=await operation({operation:"sources",connectionId:reference.connectionId});if(n===generation.current){setSources(d.groups.map((g:{name:string})=>g.name));setTruncated(d.truncated);}}catch(e){if(n===generation.current)setError(e instanceof Error?e.message:"AWS sources unavailable.");}finally{if(n===generation.current)setBusy(false);}}
 async function loadHistory(){const n=++generation.current;setBusy(true);setError("");setHistory(null);try{const d=await operation({operation:"history",connectionId:reference.connectionId,resourceArn:reference.resourceArn,version:reference.version,hours});if(n===generation.current)setHistory(d);}catch(e){if(n===generation.current)setError(e instanceof Error?e.message:"History could not be read.");}finally{if(n===generation.current)setBusy(false);}}
 async function onboard(){const n=++generation.current;setBusy(true);setError("");setNotice("");setHistory(null);
  const signature=JSON.stringify([reference,displayName.trim(),owner,logGroup]);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  try{const d=await operation({...reference,operation:"onboard",id:request.current.id,owner,displayName:displayName.trim(),logGroup});if(n===generation.current){setNotice(`Agent onboarded for observation. ${d.supportedEventsObserved} supported events found in the source check. Execution controls remain off.`);await loadHistory();}}catch(e){if(n===generation.current)setError(e instanceof Error?e.message:"Onboarding could not be saved.");}finally{if(n===generation.current)setBusy(false);}
 }
 return <section className="cp-panel cp-durable-card" aria-label="AWS workflow observation"><h2>Onboard and observe this agent</h2><p>Keep the workflow and approvals in AWS. Save its owner and reviewed telemetry source, then follow its reported history here.</p>
  {error&&<p role="alert" className="cp-durable-message is-error">{error}</p>}{notice&&<p role="status" className="cp-durable-message">{notice}</p>}
  <details open={!history}><summary>Observation onboarding</summary><form className="cp-durable-form" onSubmit={e=>{e.preventDefault();void onboard();}}>
   <label>Agent name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={100} required disabled={busy}/></label>
   <label>Accountable owner<select aria-label="Accountable owner" value={owner} onChange={e=>setOwner(e.target.value)} required disabled={busy}><option value="">Choose an invited owner</option>{owners.map(o=><option key={o.email} value={o.email}>{o.name} · {o.email}</option>)}</select></label>
   <label>CloudWatch workflow log group<input value={logGroup} onChange={e=>setLogGroup(e.target.value)} list="aws-workflow-log-groups" maxLength={251} required disabled={busy} placeholder="/company/agent-events"/></label>
   <datalist id="aws-workflow-log-groups">{sources.map(s=><option key={s} value={s}/>)}</datalist><button className="cp-button secondary" type="button" disabled={busy} onClick={()=>void loadSources()}>Find AWS log sources</button>
   {truncated&&<p>Showing the first 50 log groups. Enter an exact source name from your workflow builder if it is outside this list.</p>}
   <p>Use the exact custom log group included in the AWS access grant. LoopLabs currently maps business-events schema 1.0; unsupported records remain visible as coverage gaps.</p>
   <label><input type="checkbox" required disabled={busy}/> I have reviewed that this telemetry source belongs to the selected agent.</label>
   <button className="cp-button" disabled={busy||!owner||!logGroup}>{busy?"Checking…":"Onboard for observation"}</button>
  </form></details>
  <div className="aws-section-heading"><div><h3>Workflow history</h3><p>Source-reported events from CloudWatch. Slack approvals remain in the existing workflow.</p></div></div>
  <label>History window<select aria-label="History window" value={hours} disabled={busy} onChange={e=>{setHours(Number(e.target.value));setHistory(null);}}><option value={1}>Last hour</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option></select></label>
  <button className="cp-button secondary" disabled={busy} onClick={()=>void loadHistory()}>{busy?"Reading AWS…":"Refresh workflow history"}</button>
  {history&&<div className="aws-activity-results"><h3>{history.enrollment.displayName}</h3><p>Checked {new Date(history.checkedAt).toLocaleString()} · {history.completeness==="partial"?"Partial read · history may be incomplete":"API traversal finished for this window"}</p>
   <p>Retention follows the AWS log source. This is an on-demand read, not a live subscription or a complete audit record. Effects and approver identities have not been independently verified.</p>
   {history.unsupportedRecords>0&&<p role="status">{history.unsupportedRecords} source records use an unsupported format. Their contents are not displayed.</p>}
   {history.failures.length>0&&<p role="status">Some evidence could not be read or validated. Missing events do not prove that work did not happen.</p>}
   {history.duplicateDeliveries>0&&<p>{history.duplicateDeliveries} repeated event deliveries were deduplicated.</p>}
   {!history.events.length&&<p>No supported workflow events were found in this read. This does not establish that the agent was idle.</p>}
   {telemetryRuns(history).map((run,index)=><article className="cp-panel cp-durable-card" key={run.id}><h3>Workflow run · {run.trigger}{run.policy?.requestedPercent!==null&&run.policy?.requestedPercent!==undefined?` · ${run.policy.requestedPercent}% discount`:""}</h3><span className="aws-status">{run.status}</span>
    {!run.startObserved&&<p>The start of this run was not observed in this window.</p>}
    {run.policy&&<p>Existing workflow policy: {run.policy.decision??"Decision not reported"}.{run.policy.approvalThreshold!==null?` Approval threshold: ${run.policy.approvalThreshold}%.`:""}{run.policy.maximumDiscount!==null?` Maximum discount: ${run.policy.maximumDiscount}%.`:""}</p>}
    <details open={index===0}><summary>View execution timeline · {run.events.length} events</summary><ol aria-label={`Run ${index+1} event timeline`}>{run.events.map(e=><li className="aws-event-row" key={e.eventId}><div><strong>{eventLabels[e.eventName]}</strong>{e.actionName&&<p>{e.actionName.replaceAll("_"," ")}{e.provider?` · ${e.provider}`:""}</p>}{e.reasonCode&&<p>{e.reasonCode.replaceAll("_"," ")}</p>}<p>{new Date(e.occurredAt).toLocaleString()} · Attempt {e.attempt} · Reported deployment {e.reportedDeploymentVersion}</p></div></li>)}</ol></details>
    <details><summary>Run and trace references</summary><p>Run: {run.id}</p><p>Trace: {run.events[0].traceId}</p><p>Enrolled runtime version: {history.source.enrolledRuntimeVersion}. Event deployment versions are reported by the source.</p></details>
   </article>)}
  </div>}
 </section>;
}
