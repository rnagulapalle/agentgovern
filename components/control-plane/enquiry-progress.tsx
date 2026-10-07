"use client";
import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CirclePause, Mail, ContactRound, ShieldCheck } from "lucide-react";
import { approvedReply } from "@/lib/enquiries/contracts";
import { WorkflowWorkspace } from "./workflow-workspace";
type Step = { ordinal: number; action_id: string; agent_id: string; connector: string; payload: { lifecycle?: string }; state: string | null; payload_hash: string; reason: string; proposed_by?: string; approved_by: string | null; evidence?: { outcome: string; detail: string; reference?: string }; proposedRequest?: { method: string; resource: string; body: object } };
type Run = { id: string; created_by: string; state: string; steps: Step[] };
async function api(url: string, payload?: object) {
  const response = await fetch(url, { cache: "no-store", ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
  const data = await response.json(); if (!response.ok) throw Error(data.error || "The saved outcome is unavailable."); return data;
}
const names: Record<string, string> = { held: "Waiting for approval", ready: "Approved · queued", executing: "Checking the outcome", succeeded: "Effect verified", uncertain: "Outcome uncertain · sending is held", conflict: "Customer record changed · review needed", rejected: "Declined", cancelled: "Stopped" };
export function EnquiryProgress({ id }: { id: string }) {
  const [run, setRun] = useState<Run | null>(null), [member, setMember] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setRun(await api("/api/durable/workflows?run=" + id)); }, [id]);
  useEffect(() => { load().catch(e => setError(e.message)); api("/api/workspace/session").then(m => setMember(m.email)).catch(() => {}); const timer = setInterval(() => load().catch(e => setError(e.message)), 7000); return () => clearInterval(timer); }, [load]);
  async function decide(step: Step, approve: boolean) {
    setBusy(true); setError("");
    try { await api("/api/durable/connectors", { operation: approve ? "approve" : "reject", actionId: step.action_id, payloadHash: step.payload_hash }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Decision could not be confirmed."); } finally { setBusy(false); }
  }
  if (!run) return <p role="status">Opening saved progress…</p>;
  if (!run.steps.every(s => s.agent_id.startsWith("ack-"))) return <WorkflowWorkspace embeddedRunId={id} />;
  return <section className="cp-panel cp-durable-card cp-enquiry-progress" aria-label="Rehearsal progress">
    <div className="cp-enquiry-heading"><div><span className="cp-eyebrow">SAVED REHEARSAL</span><h2>{run.state === "completed" ? "Acknowledgement verified" : run.state === "paused" ? "Work paused" : "Customer acknowledgement"}</h2></div><ShieldCheck aria-hidden="true" /></div>
    <p>{run.state === "completed" ? "The CRM update and acknowledgement were read back from the provider twins." : "Approve the exact actions here. The background runner handles execution and verification; you can close this tab."}</p>
    {error && <p className="cp-durable-error" role="alert">{error}</p>}
    <ol className="cp-enquiry-timeline">{run.steps.map(s => <li key={s.action_id}>
      <div className="cp-enquiry-step-icon">{s.state === "succeeded" ? <CheckCircle2 /> : s.ordinal === 1 ? <ContactRound /> : <Mail />}</div>
      <div><h3>{s.ordinal === 1 ? "Check and update the customer record" : "Send the approved acknowledgement"}</h3><p role="status"><strong>{names[s.state || ""] || "Submission incomplete · reopen and retry rehearsal"}</strong></p><p>{s.ordinal === 2 && run.steps[0].state !== "succeeded" ? "Sending waits until the customer record effect is verified." : s.reason}</p>
      {s.ordinal === 2 && s.state === "held" && <article className="cp-durable-scope"><strong>To: {approvedReply.recipient}</strong><p>{approvedReply.subject}</p><p>{approvedReply.text}</p><p>Approved information: {approvedReply.reference}</p></article>}
      {s.ordinal === 1 && s.state === "held" && <p>Retain the reviewed lifecycle: <strong>{s.payload.lifecycle}</strong>. No new contact, notes or additional fields are written. Inspect the exact payload below before approving.</p>}
      {s.approved_by && <p>Approved by {s.approved_by}</p>}
      {s.evidence && <p>Observed: {s.evidence.detail}</p>}
      {s.state === "held" && run.state === "active" && <div className="cp-enquiry-decisions">{member === run.created_by ? <p>A different workspace member must approve. Ask them to open this saved enquiry; you cannot approve your own actions.</p> : <><button className="cp-button cp-button-dark" disabled={busy || !member} onClick={() => decide(s, true)}>Approve {s.connector === "crm" ? "CRM update" : "acknowledgement"}</button><button className="cp-button" disabled={busy || !member} onClick={() => decide(s, false)}>Decline action</button></>}</div>}
      <details><summary>Action and verification details</summary><p>Agent: {s.agent_id}</p><p>Stable action: {s.action_id}</p>{s.proposedRequest && <><p>{s.proposedRequest.method} · {s.proposedRequest.resource}</p><pre>{JSON.stringify(s.proposedRequest.body, null, 2)}</pre></>}{s.evidence?.reference && <p>Provider reference: {s.evidence.reference}</p>}</details></div>
    </li>)}</ol>
    {run.state === "completed" && <section className="cp-durable-scope" aria-label="Verification receipt"><strong>Rehearsal verification receipt</strong><p>Both exact actions have saved provider-twin effect evidence. No real customer email was delivered.</p><p>Run {run.id}</p>{run.steps.map(s => <p key={s.action_id}>{s.connector}: {s.evidence?.outcome} · {s.evidence?.reference || "Read-back confirmed"}</p>)}</section>}
    {run.state === "active" && <button className="cp-button" disabled={busy} onClick={async () => { setBusy(true); try { await api("/api/durable/workflows", { operation: "pause", runId: id }); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Pause could not be confirmed."); } finally { setBusy(false); } }}><CirclePause size={18} aria-hidden="true" /> Pause work</button>}
    <p>Pause stops new dispatches. An action already sent may still take effect. A paused or changed plan requires new reviewed work.</p>
  </section>;
}
