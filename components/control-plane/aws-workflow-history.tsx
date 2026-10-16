"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ExternalWorkflowApprovals } from "./external-workflow-approvals";
import { workspaceJson } from "@/lib/workspace/response";
import type { ActivityReference } from "@/lib/workspace/cloud-activity";
import type { WorkflowTelemetryWindow } from "@/lib/workspace/workflow-telemetry";
import type { AwsConnectionCoverage } from "@/lib/workspace/aws-journey";
import { telemetryRuns } from "@/lib/workspace/workflow-telemetry-view";
import { AwsExecutionBrowser } from "./aws-execution-browser";
async function operation(value:object){const r=await fetch("/api/workspace/discovery/onboarding",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(value),cache:"no-store"});const data=await workspaceJson(r);if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});return data;}
type History=WorkflowTelemetryWindow&{checkedAt:string;enrollment:{displayName:string;owner:string;logGroup:string;enrolledAt:string}};
export function AwsWorkflowHistory({reference,name,onCoverage}:{reference:ActivityReference;name:string;onCoverage?:(value:Partial<AwsConnectionCoverage>)=>void}){
 const viewId=useId();
 const [view,setView]=useState("activity");
 const [owners,setOwners]=useState<{email:string;name:string}[]>([]),[sources,setSources]=useState<string[]>([]),[truncated,setTruncated]=useState(false);
 const [displayName,setDisplayName]=useState(name),[owner,setOwner]=useState(""),[logGroup,setLogGroup]=useState("");
 const [history,setHistory]=useState<History|null>(null),[hours,setHours]=useState(24),[busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
 const [channel,setChannel]=useState("all"),[recordReference,setRecordReference]=useState("all"),[shown,setShown]=useState(10);
 const generation=useRef(0),request=useRef<{signature:string;id:string}|null>(null);
 const coverage=useRef(onCoverage);coverage.current=onCoverage;
 const [enrollment,setEnrollment]=useState<History["enrollment"]|null>(null),[enrollmentChecked,setEnrollmentChecked]=useState(false),[setupAllowed,setSetupAllowed]=useState(false),[lookupAttempt,setLookupAttempt]=useState(0);
 const key=JSON.stringify(reference);
 const allRuns=history?telemetryRuns(history):[],runs=allRuns.filter(r=>(channel==="all"||r.trigger===channel)&&(recordReference==="all"||r.quoteIds.includes(recordReference)));
 useEffect(()=>{const requests=generation;const n=++requests.current;let active=true;setView("activity");setOwners([]);setHistory(null);setError("");setNotice("");setBusy(true);setDisplayName(name);setLogGroup("");setOwner("");setSources([]);setTruncated(false);setChannel("all");setRecordReference("all");setShown(10);request.current=null;setEnrollment(null);setEnrollmentChecked(false);setSetupAllowed(false);coverage.current?.({history:"not-checked",approvals:"not-checked"});
  fetch("/api/workspace/discovery/owners",{cache:"no-store"}).then(async r=>{const data=await workspaceJson(r);if(!r.ok)throw Object.assign(Error(data.error),{status:r.status});if(active)setOwners(data.owners);}).catch(e=>{if(active)setError(e.message);});
  const ref={connectionId:reference.connectionId,scanId:reference.scanId,resourceArn:reference.resourceArn,version:reference.version};
  async function restore(){try{
   const saved=await operation({operation:"enrollment",...ref});if(!active||n!==generation.current)return;setEnrollment(saved.enrollment);setEnrollmentChecked(true);setSetupAllowed(!saved.enrollment);
   if(!saved.enrollment){coverage.current?.({history:"setup-required"});return;}
   setDisplayName(saved.enrollment.displayName);setOwner(saved.enrollment.owner);setLogGroup(saved.enrollment.logGroup);
   const d:History=await operation({operation:"history",connectionId:ref.connectionId,resourceArn:ref.resourceArn,version:ref.version,hours:24});if(active&&n===generation.current){setHistory(d);setEnrollment(d.enrollment);coverage.current?.({history:"connected"});setNotice("Agent setup saved. Showing history from the connected AWS source. Mandatory execution enforcement remains off.");}
  }catch(e){if(active&&n===generation.current){setEnrollmentChecked(true);setError(e instanceof Error?e.message:"Saved agent setup could not be checked.");coverage.current?.({history:"unavailable"});}}finally{if(active&&n===generation.current)setBusy(false);}}
  void restore();return()=>{active=false;requests.current++;};
 },[key,name,reference.connectionId,reference.scanId,reference.resourceArn,reference.version,lookupAttempt]);
 async function loadSources(){const n=++generation.current;setBusy(true);setError("");try{const d=await operation({operation:"sources",connectionId:reference.connectionId});if(n===generation.current){setSources(d.groups.map((g:{name:string})=>g.name));setTruncated(d.truncated);}}catch(e){if(n===generation.current)setError(e instanceof Error?e.message:"AWS sources unavailable.");}finally{if(n===generation.current)setBusy(false);}}
 async function loadHistory(){const n=++generation.current;setBusy(true);setError("");try{const d=await operation({operation:"history",connectionId:reference.connectionId,resourceArn:reference.resourceArn,version:reference.version,hours});if(n===generation.current){setHistory(d);setEnrollment(d.enrollment);coverage.current?.({history:"connected"});}}catch(e){if(n===generation.current){setError(e instanceof Error?e.message:"History could not be read.");coverage.current?.({history:"unavailable"});}}finally{if(n===generation.current)setBusy(false);}}
 async function onboard(){const n=++generation.current;setBusy(true);setError("");setNotice("");setHistory(null);
  const signature=JSON.stringify([reference,displayName.trim(),owner,logGroup]);if(request.current?.signature!==signature)request.current={signature,id:crypto.randomUUID()};
  try{const d=await operation({...reference,operation:"onboard",id:request.current.id,owner,displayName:displayName.trim(),logGroup});if(n===generation.current){setNotice(`Agent onboarded for observation. ${d.supportedEventsObserved} supported events found in the source check. Execution controls remain off.`);await loadHistory();}}catch(e){if(n===generation.current)setError(e instanceof Error?e.message:"Onboarding could not be saved.");}finally{if(n===generation.current)setBusy(false);}
 }
 const historySetup=<details open={setupAllowed&&!enrollment&&!history}><summary>{enrollment||history?"Review saved history setup":"Set up workflow history"}</summary><form className="cp-durable-form" onSubmit={e=>{e.preventDefault();void onboard();}}>
   <label>Agent name<input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={100} required disabled={busy}/></label>
   <label>Accountable owner<select aria-label="Accountable owner" value={owner} onChange={e=>setOwner(e.target.value)} required disabled={busy}><option value="">Choose an invited owner</option>{owners.map(o=><option key={o.email} value={o.email}>{o.name} · {o.email}</option>)}</select></label>
   <label>CloudWatch workflow log group<input value={logGroup} onChange={e=>setLogGroup(e.target.value)} list="aws-workflow-log-groups" maxLength={251} required disabled={busy} placeholder="/company/agent-events"/></label>
   <datalist id="aws-workflow-log-groups">{sources.map(s=><option key={s} value={s}/>)}</datalist><button className="cp-button secondary" type="button" disabled={busy} onClick={()=>void loadSources()}>Find AWS log sources</button>
   {truncated&&<p>Showing the first 50 log groups. Enter an exact source name from your workflow builder if it is outside this list.</p>}
   <p>Use the exact custom log group included in the AWS access grant. LoopLabs currently maps business-events schema 1.0; unsupported records remain visible as coverage gaps.</p>
   <label><input type="checkbox" required disabled={busy}/> I have reviewed that this telemetry source belongs to the selected agent.</label>
   <button className="cp-button" disabled={busy||!enrollmentChecked||!owner||!logGroup}>{busy?"Checking…":"Onboard for observation"}</button>
  </form></details>;
 return <section className="cp-panel cp-durable-card" aria-label="AWS workflow observation"><h2>{history||enrollment ? "Agent workspace" : enrollmentChecked?setupAllowed?"Connect this agent’s history":"Agent connection needs attention":"Checking saved agent…"}</h2><p>Your workflow stays in AWS. History, shared approvals and mandatory execution enforcement are separate connections.</p>
  {error&&<p role="alert" className="cp-durable-message is-error">{error}</p>}{notice&&<p role="status" className="cp-durable-message">{notice}</p>}
  {!enrollmentChecked&&!history&&<p role="status">Checking saved onboarding before offering setup.</p>}
  {enrollment&&<div className="aws-agent-facts"><strong>{enrollment.displayName}</strong><span>Owner: {enrollment.owner}</span><span>Agent version {reference.version} · onboarding saved</span></div>}
  {enrollmentChecked&&!setupAllowed&&!enrollment&&<button className="cp-button secondary" disabled={busy} onClick={()=>setLookupAttempt(n=>n+1)}>Retry saved agent check</button>}
  {setupAllowed&&!enrollment&&historySetup}
  {enrollment&&<nav className="aws-workspace-views" aria-label="Agent workspace views">{["activity","approvals"].map(value=><button type="button" key={value} aria-pressed={view===value} aria-controls={`${viewId}-${value}`} onClick={()=>setView(value)}>{value==="activity"?"Activity":"Approvals"}</button>)}</nav>}
  <div id={`${viewId}-approvals`} hidden={view!=="approvals"}>
  {enrollment&&<ExternalWorkflowApprovals reference={reference} onConnection={connected=>coverage.current?.({approvals:connected===null?"unavailable":connected?"connected":"setup-required"})} onDecision={()=>void loadHistory()}/> }
  </div>
  <div id={`${viewId}-activity`} hidden={view!=="activity"}>
  <div className="aws-section-heading"><div><h3>Workflow history</h3><p>Source-reported events from CloudWatch. The AWS workflow records decisions from its connected approval surfaces.</p></div></div>
  <label>History window<select aria-label="History window" value={hours} disabled={busy} onChange={e=>{setHours(Number(e.target.value));setHistory(null);}}><option value={1}>Last hour</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option></select></label>
  <button className="cp-button secondary" disabled={busy} onClick={()=>void loadHistory()}>{busy?"Reading AWS…":"Refresh workflow history"}</button>
  {history&&<div className="aws-activity-results"><p>Checked {new Date(history.checkedAt).toLocaleString()} · {history.completeness==="partial"?"Partial read · history may be incomplete":"API traversal finished for this window"}</p>
   <details className="aws-evidence-note"><summary>About this history · source-reported</summary><p>Retention follows the AWS log source. This is an on-demand read, not a live subscription or a complete audit record. Effects and approver identities have not been independently verified.</p></details>
   {history.unsupportedRecords>0&&<p role="status">{history.unsupportedRecords} source records use an unsupported format. Their contents are not displayed.</p>}
   {history.failures.length>0&&<p role="status">Some evidence could not be read or validated. Missing events do not prove that work did not happen.</p>}
   {history.duplicateDeliveries>0&&<p>{history.duplicateDeliveries} repeated event deliveries were deduplicated.</p>}
   {!history.events.length&&<p>No supported workflow events were found in this read. This does not establish that the agent was idle.</p>}
   {error&&<p role="status">Showing the last successful history read from {new Date(history.checkedAt).toLocaleString()}. Refresh to check newer activity.</p>}
   <p>All executions in this history window</p><div className="aws-run-scorecard">{[["Executions",allRuns.length],["Awaiting approval",allRuns.filter(r=>r.status==="Awaiting manager approval").length],["Denied by policy",allRuns.filter(r=>r.status==="Blocked by workflow policy").length],["Completed · reported",allRuns.filter(r=>r.status==="Completed · agent reported").length]].map(([label,value])=><div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
   {allRuns.some(r=>r.quoteIds.length)&&allRuns.some(r=>!r.quoteIds.length)&&<p role="status">{allRuns.filter(r=>!r.quoteIds.length).length} executions have no reported quote reference. Select all reported quotes to keep those executions visible.</p>}
   <div className="aws-history-toolbar"><label>Channel<select aria-label="Workflow history channel" value={channel} onChange={e=>{setChannel(e.target.value);setShown(10);}}><option value="all">All channels</option><option value="slack">Slack</option><option value="email">Email</option><option value="internal">Internal</option></select></label><label>Reported quote<select aria-label="Reported quote" value={recordReference} onChange={e=>{setRecordReference(e.target.value);setShown(10);}}><option value="all">All reported quotes</option>{[...new Set(allRuns.flatMap(r=>r.quoteIds))].map(id=><option key={id} value={id}>{id}</option>)}</select></label><p>{runs.length} observed executions · newest start first{channel!=="all"?` · ${channel}`:""}</p></div>
   <AwsExecutionBrowser key={`${key}:${channel}:${recordReference}:${hours}`} runs={runs.slice(0,shown)} runtimeVersion={history.source.enrolledRuntimeVersion} onQuote={id=>{setRecordReference(id);setShown(10);}}/>
   {runs.length===0&&history.events.length>0&&<p>No executions from this channel were found in the loaded window.</p>}
   {runs.length>shown&&<button className="cp-button secondary" onClick={()=>setShown(n=>n+10)}>Show 10 more executions</button>}

  </div>}
  </div>
  {enrollment&&historySetup}
 </section>;
}
