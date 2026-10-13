"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CirclePause, Mail, ContactRound, ShieldCheck } from "lucide-react";
import {workspaceJson} from "@/lib/workspace/response";
import { savedMessage,runProgress } from "@/lib/enquiries/presentation";
import { WorkflowWorkspace } from "./workflow-workspace";
import { EnquiryExecution } from "./enquiry-execution";
type Step = { ordinal: number; action_id: string; agent_id: string; connector: string; payload: { lifecycle?: string }; state: string | null; payload_hash: string; reason: string; proposed_by?: string; approved_by: string | null; evidence?: { outcome: string; detail: string; reference?: string }; proposedRequest?: { method: string; resource: string; body: object;requestVersion?:string } };
type Run = { id: string; created_by: string; state: string; steps: Step[] };
async function api(url: string, payload?: object) {
  const response = await fetch(url, { cache: "no-store", ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
  const data = await workspaceJson(response); if (!response.ok) throw Error(data.error || "The saved outcome is unavailable."); return data;
}
const names: Record<string, string> = { held: "Waiting for approval", ready: "Approved · queued", executing: "Checking the outcome", succeeded: "Effect verified", uncertain: "Outcome uncertain · sending is held", conflict: "Customer record changed · review needed", rejected: "Declined", cancelled: "Stopped" };
export function EnquiryProgress({ id,planHash,recordScoped=false }: { id: string;planHash?:string;recordScoped?:boolean }) {
  const [run, setRun] = useState<Run | null>(null), [member, setMember] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setRun(await api("/api/durable/workflows?run=" + id)); }, [id]);
  useEffect(() => { load().catch(e => setError(e.message)); api("/api/workspace/session").then(m => setMember(m.email)).catch(() => {}); const timer = setInterval(() => load().catch(e => setError(e.message)), 7000); return () => clearInterval(timer); }, [load]);
  async function decide(step: Step, approve: boolean) {
    setBusy(true); setError("");
    try { await api("/api/durable/connectors", { operation: approve ? "approve" : "reject", actionId: step.action_id, payloadHash: step.payload_hash }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Decision could not be confirmed."); } finally { setBusy(false); }
  }
  if (!run) return <RunLoadingState error={error} busy={busy} retry={async()=>{
    setBusy(true);setError("");
    try { await load(); } catch(e) { setError(e instanceof Error ? e.message : "Saved progress could not be loaded."); }
    finally { setBusy(false); }
  }} />;
  const scoped=recordScoped||run.steps.some(s=>s.proposedRequest?.requestVersion==="prepared-request-2"),presentation=runProgress(run.state,run.steps);
  if (!scoped && !run.steps.every(s => s.agent_id.startsWith("ack-"))) return <WorkflowWorkspace embeddedRunId={id} />;
  return <section className="cp-panel cp-durable-card cp-enquiry-progress" aria-label="Run progress">
    <div className="cp-enquiry-heading"><div><span className="cp-eyebrow">WORKFLOW RUN</span><h2>{presentation.title}</h2></div><ShieldCheck aria-hidden="true" /></div>
    <p>{presentation.text}</p>
    {error && <p className="cp-durable-error" role="alert">{error}</p>}
    <RunExecutionGuidance id={id} run={run} />
    <ol className="cp-enquiry-timeline">{run.steps.map(s => {const message=savedMessage(s.proposedRequest?.body);return <li key={s.action_id}>
      <div className="cp-enquiry-step-icon">{s.state === "succeeded" ? <CheckCircle2 /> : s.ordinal === 1 ? <ContactRound /> : <Mail />}</div>
      <div><h3>{s.ordinal === 1 ? "Check and update the customer record" : "Send the approved acknowledgement"}</h3><p role="status"><strong>{s.state===null ? "Action not submitted" : names[s.state] || "Saved state needs review"}</strong></p><p>{s.ordinal === 2 && run.steps[0].state !== "succeeded" ? "Sending waits until the customer record effect is verified." : verifiedStepNote(s,presentation.receipt)}</p>
      {s.ordinal === 2 && <article className="cp-durable-scope">{message?<><strong>To: {message.recipient}</strong><p>{message.subject}</p><p>{message.text}</p><p>Exact message saved with this action.</p></>:<p>Saved message unavailable. Do not approve or resend without its original request.</p>}</article>}
      {s.ordinal === 1 && s.state === "held" && <p>Retain the reviewed lifecycle: <strong>{s.payload.lifecycle}</strong>. No new contact, notes or additional fields are written. Inspect the exact payload below before approving.</p>}
      {s.approved_by && <p>Approved by {s.approved_by}</p>}
      {!presentation.receipt && s.evidence && s.evidence.detail !== s.reason && <p>Observed: {s.evidence.detail}</p>}
      {s.state === "held" && run.state === "active" && <div className="cp-enquiry-decisions">{member === run.created_by ? <p>A different workspace member must approve. Ask them to open this saved run; you cannot approve your own actions.</p> : <><button className="cp-button cp-button-dark" disabled={busy || !member || (s.ordinal===2 && !message)} onClick={() => decide(s, true)}>Approve {s.connector === "crm" ? "CRM update" : "acknowledgement"}</button><button className="cp-button" disabled={busy || !member} onClick={() => decide(s, false)}>Decline action</button></>}</div>}
      <details><summary>Action and verification details</summary><p>{s.reason}</p>{s.evidence && <p>Observed: {s.evidence.detail}</p>}<p>Agent: {s.agent_id}</p><p>Stable action: {s.action_id}</p>{s.proposedRequest && <><p>{s.proposedRequest.method} · {s.proposedRequest.resource}</p><pre>{JSON.stringify(s.proposedRequest.body, null, 2)}</pre></>}{s.evidence?.reference && <p>Provider reference: {s.evidence.reference}</p>}</details></div>
    </li>;})}</ol>
    <VerificationEvidence run={run} />
    {scoped && planHash && presentation.incomplete && member===run.created_by && run.state==="active" && <button className="cp-button" disabled={busy} onClick={async()=>{setBusy(true);setError("");try{await api("/api/workspace/enquiries",{operation:"resume",id,planHash});await load();}catch(e){setError(e instanceof Error?e.message:"Submission could not be confirmed. Reopen saved work before retrying.");}finally{setBusy(false);}}}>Confirm saved submission</button>}
    {run.state === "active" && <button className="cp-button" disabled={busy} onClick={async () => { setBusy(true); try { await api("/api/durable/workflows", { operation: "pause", runId: id }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Pause could not be confirmed."); } finally { setBusy(false); } }}><CirclePause size={18} aria-hidden="true" /> Pause work</button>}
    {run.state === "active" && <p>Pause stops new dispatches. An action already sent may still take effect. A paused or changed plan requires new reviewed work.</p>}
  </section>;
}

export function RunLoadingState({error,busy,retry}:{error:string;busy:boolean;retry:()=>void}) {
  if(!error)return <p role="status">Opening saved progress…</p>;
  return <section className="cp-panel cp-durable-card" aria-label="Saved progress unavailable">
    <h2>Saved progress is unavailable</h2>
    <p className="cp-durable-error" role="alert">{error}</p>
    <p>Your saved work has not been resubmitted. Loading again only checks its current status.</p>
    <button className="cp-button" disabled={busy} onClick={retry}>Load saved progress again</button>
  </section>;
}

export function verifiedStepNote(step:Pick<Step,"state"|"ordinal"|"reason">,verifiedRun:boolean) {
 if(!verifiedRun || step.state!=="succeeded")return step.reason;
 return step.ordinal===1?"Customer record update verified.":"Approved acknowledgement accepted by the simulated email provider.";
}
export function VerificationEvidence({run}:{run:Run}) {
 if(!runProgress(run.state,run.steps).receipt)return null;
 return <section className="cp-durable-scope" aria-label="Verification evidence"><strong>Verification evidence</strong><p>Customer record updated and acknowledgement accepted. Both effects were read back from the provider twins. No real customer email was delivered.</p><details><summary>Verification references</summary><p>Run {run.id}</p>{run.steps.map(s=><p key={s.action_id}>{s.connector}: {s.evidence?.outcome} · {s.evidence?.reference || "Read-back confirmed"}</p>)}</details></section>;
}

// Presentation only: a full verified receipt makes scheduling guidance obsolete.
// Every partial, queued or uncertain result retains the existing controller.
export function RunExecutionGuidance({id,run}:{id:string;run:Run}) {
 if(runProgress(run.state,run.steps).receipt)return null;
 return <EnquiryExecution key={id} id={id} />;
}
