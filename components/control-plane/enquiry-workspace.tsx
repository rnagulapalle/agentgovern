"use client";
import Link from "next/link";
import {workspaceJson} from "@/lib/workspace/response";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageTitle } from "./ui";
import { EnquiryProgress } from "./enquiry-progress";
import { ContactRound, Mail, ShieldCheck, ArrowRight } from "lucide-react";
import { enquiryRequest, type Turn } from "@/lib/enquiries/chat-contract";
type RecordAccess={available:boolean;records:{id:string;recipient:string;contact_id:string;active:boolean}[];grants:{scope_id:string;agent_id:string;active:boolean}[]};
type Plan = { id: string; plan_hash: string; source_version: string; run_id: string | null; plan: { recordEnrollment?:{id:string;version:number};enquiry: { title: string; message: string }; contact: { id: string; email: string }; crm: { lifecycle: string }; reply: { recipient: string; subject: string; text: string; reference: string } } };
async function call(payload?: object,scope="") {
  const response = await fetch("/api/workspace/enquiries"+(scope?"?scope="+encodeURIComponent(scope):""), { cache: "no-store", ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
  const data = await workspaceJson(response);
  if (!response.ok) throw new Error(data.error || "The enquiry could not be confirmed.");
  return data;
}
export function EnquiryWorkspace() {
  const requestId = useRef("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [selected,setSelected]=useState("");
  const [records,setRecords]=useState<RecordAccess|null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [connections, setConnections] = useState<{ mode: string; crmAtomicVersion: boolean; workerHealthy: boolean;recordDurableAvailable:boolean;selectedRecipient:string } | null>(null);
  const [agents, setAgents] = useState<{ id: string; name:string|null; owner:string|null;active:boolean; tools: string[] }[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [connectionResult, setConnectionResult] = useState("");
  const [reply, setReply] = useState("");
  const [crm, setCrm] = useState("");
  const [email, setEmail] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await call(undefined,selected); setPlans(data.plans); setConnections(data.connections);
    setPlan(previous=>previous?(data.plans.find((p:Plan)=>p.id===previous.id)||previous):null);
    const access=await fetch("/api/workspace/records",{cache:"no-store"});const accessData=await workspaceJson(access);if(!access.ok)throw new Error(accessData.error||"Record access unavailable.");setRecords(accessData);
    const response = await fetch("/api/workspace/agents", { cache: "no-store" });
    const directory = await workspaceJson(response);
    if (!response.ok) throw new Error(directory.error || "Agent directory unavailable.");
    setAgents(directory.agents);
  }, [selected]);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  async function task(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "The result is uncertain. Refresh before retrying.");try{await load();}catch{} } finally { setBusy(false); }
  }
  return <div className="cp-durable">
    <PageTitle eyebrow="WORK WITH AGENTS" title="Describe the work. Rehearse it first." description="Ask for a customer acknowledgement, review the exact plan, and follow it through approval and verified outcomes." />
    <section className="cp-enquiry-connections" aria-label="Workflow connections">
      <article><ContactRound aria-hidden="true" /><div><strong>Customer records</strong><p>{connections?.crmAtomicVersion ? "Private CRM twin · configured" : "Hosted CRM · version guarantee missing"}</p></div></article><ArrowRight aria-hidden="true" /><article><ShieldCheck aria-hidden="true" /><div><strong>Approval & verification</strong><p>Different named member · exact actions</p></div></article><ArrowRight aria-hidden="true" /><article><Mail aria-hidden="true" /><div><strong>Acknowledgements</strong><p>{connections?.mode === "hosted" ? "Hosted email twin" : "Private email twin"} · no real delivery</p></div></article>
    </section><p>Chat interprets your request using a model. No real email is delivered. One customer enquiry, two scoped assistants, a verified outcome. Rehearsal uses isolated FetchSandbox connections configured by your workspace administrator. Live inbox monitoring and real delivery are not enabled.</p>
    <div className="cp-enquiry-connection-check"><button className="cp-button" disabled={busy} onClick={() => task(async () => { const checked = await call({ operation: "checkConnections" },selected); setConnectionResult(checked.atomicVersion ? "Sample customer record is readable. CRM version checks are supported by the private twin. No write or email was sent." : "Sample customer record is readable. Hosted execution remains blocked until the atomic CRM version guarantee is available. No write or email was sent."); })}>Check connections</button>{connectionResult && <p role="status">{connectionResult}</p>}</div>
    {connections && !selected && !connections.workerHealthy && <p className="cp-durable-scope" role="status">Background runner is unavailable. You can prepare a plan; approved work stays saved until the runner returns.</p>}
    <section className="cp-panel cp-durable-card" aria-label="Customer record selection"><label htmlFor="workflow-record">Customer record for this conversation</label><select id="workflow-record" value={selected} disabled={busy||!!plan} onChange={e=>{setSelected(e.target.value);requestId.current="";setTurns([]);setMessages([]);setInput("");setReviewed(false);setCrm("");setEmail("");setReply("");setConnectionResult("");}}><option value="">Prepared sample · customer@example.test</option>{records?.records.map(r=><option key={r.id} value={r.id} disabled={!r.active}>{r.recipient} · record {r.contact_id}{r.active?"":" · access revoked"}</option>)}</select><p>New work uses the selected enrolled record. Saved work keeps its original record and exact message.</p><Link href="/control-plane/records" prefetch={false}>Manage records and agent access →</Link></section>
    {error && <p role="alert" className="cp-durable-error">{error}</p>}
    <div className="cp-enquiry-workbench"><main><section className="cp-panel cp-durable-card cp-conversation">
      <h2>1. What would you like to automate?</h2>
      {!plan && <p>Describe the job using sample details. Your messages are sent to the planning model; do not include private customer data or credentials. We save only the validated sample plan, not this conversation.</p>}
      <div role="log" aria-label="Workflow conversation" aria-live="polite">{messages.map((m, i) => <article className="cp-durable-scope" key={i}><strong>{m.role === "user" ? "You" : "LoopLabs"}</strong><p>{m.text}</p></article>)}</div>
      {!plan && <><label htmlFor="enquiry-message">Your request or clarification</label>
      <textarea id="enquiry-message" rows={4} maxLength={800} disabled={busy || !!plan} value={input} onChange={e => setInput(e.target.value)} placeholder="When a customer asks about our service…" />
      <button className="cp-button" disabled={busy || !!plan} onClick={() => setInput(enquiryRequest)}>Use example request</button>{" "}
      <button className="cp-button cp-button-dark" disabled={busy || !!plan || !input.trim()} onClick={() => task(async () => {
        if (!requestId.current) requestId.current = crypto.randomUUID();
        setReviewed(false);
        const next: Turn[] = [...turns, { role: "user", text: input.trim() }];
        const result = await call({ operation: "chat", id: requestId.current, turns: next },selected);
        const answer = result.clarification || result.reply;
        setTurns(next); setMessages([...messages, { role: "user", text: input.trim() }, { role: "assistant", text: answer }]); setInput("");
        setPlan(result.saved || null); setReply(answer);
      })}>{busy ? "Preparing…" : "Send request"}</button>
      </>}{reply && !messages.length && <p role="status">{reply}</p>}
      <button className="cp-button" disabled={busy} onClick={() => { requestId.current = ""; setPlan(null); setReply(""); setReviewed(false); setTurns([]); setMessages([]); setInput(""); }}>Start a new conversation</button>
    </section>
    {plan && !plan.run_id && <section className="cp-panel cp-durable-card cp-conversation-plan">
      <h2>2. Review this exact plan</h2>
      <p><strong>Enquiry:</strong> {plan.plan.enquiry.message}</p>
      <p><strong>Matched contact:</strong> {plan.plan.contact.email} · record {plan.plan.contact.id}</p>
      <p><strong>CRM change:</strong> retain the contact lifecycle as {plan.plan.crm.lifecycle}. This sample connector does not write enquiry notes or create new contacts.</p>
      <article className="cp-durable-scope"><strong>Prepared reply to {plan.plan.reply.recipient}</strong><p>{plan.plan.reply.subject}</p><p>{plan.plan.reply.text}</p><p>Approved information: {plan.plan.reply.reference}</p></article>
      <p>A separate named member approves each exact action. The acknowledgement cannot dispatch while the CRM result is uncertain. Existing agents retain their registered identity, owner and action limits.</p>
      {!plan.run_id && <>
        <p>{plan.plan.recordEnrollment?"Choose existing agents explicitly granted access to this customer record. Submission saves held actions and durable scheduling; it never approves either action.":"LoopLabs will assign a customer-record assistant and an acknowledgement assistant, each limited to one exact action in this rehearsal. You do not need to choose agent IDs or manage keys."}</p>
        <label className="cp-enquiry-review"><input type="checkbox" checked={reviewed} disabled={busy} onChange={e => setReviewed(e.target.checked)} /> I reviewed this plan. Submit its actions for independent approval; execute them in the background only after approval.</label>
        {!plan.plan.recordEnrollment && <button className="cp-button cp-button-dark" disabled={busy || !reviewed || !connections?.crmAtomicVersion} onClick={() => task(async () => {
          const result = await call({ operation: "rehearse", id: plan.id, planHash: plan.plan_hash },selected);
          setPlan({ ...plan, run_id: result.runId });
        })}>Rehearse this plan</button>}
        {!connections?.crmAtomicVersion && <p role="status">Hosted rehearsal is blocked: FetchSandbox must enforce the approved CRM contact version atomically. No CRM write or downstream acknowledgement will be sent.</p>}
        <details open={!!plan.plan.recordEnrollment}><summary>{plan.plan.recordEnrollment?"Agents with record access":"Advanced: use registered agents"}</summary><div className="cp-durable-form">{[["CRM", crm, setCrm, "twin.crm"], ["Messaging", email, setEmail, "twin.email"]].map(([label, value, setValue, tool]) => <label key={label as string}>{label as string} agent<select disabled={busy} value={value as string} onChange={(e) => { (setValue as (value: string) => void)(e.target.value); setReviewed(false); }}><option value="">Choose a dedicated agent</option>{agents.filter((a) => a.active && a.tools.includes(tool as string) && (!plan.plan.recordEnrollment || records?.grants.some(g=>g.active && g.scope_id===plan.plan.recordEnrollment?.id && g.agent_id===a.id))).map((a) => <option key={a.id} value={a.id}>{a.name||a.id}{a.owner?" · "+a.owner:""}</option>)}</select></label>)}</div>

        <button className="cp-button cp-button-dark" disabled={busy || !reviewed || !crm || !email || (!!plan.plan.recordEnrollment && !connections?.recordDurableAvailable)} onClick={() => task(async () => {
          const result = await call({ operation: plan.plan.recordEnrollment?"submit":"start", id: plan.id, planHash: plan.plan_hash, crmAgent: crm, emailAgent: email },selected);
          setPlan({ ...plan, run_id: result.runId });
        })}>{plan.plan.recordEnrollment?"Submit for independent approval":"Create this reviewed workflow"}</button>{plan.plan.recordEnrollment && !connections?.recordDurableAvailable && <p role="status">A compatible durable runner must be configured before submission. Your plan is saved; no actions were submitted.</p>}</details>
      </>}
    </section>}
    {plan?.run_id && <EnquiryProgress key={plan.run_id} id={plan.run_id} planHash={plan.plan_hash} recordScoped={Boolean(plan.plan.recordEnrollment)} />}
    </main><aside className="cp-panel cp-durable-card"><h2>Saved enquiries</h2><p>Open saved work after a refresh. Reusing an enquiry ID resumes its existing plan and run.</p>{plans.map((p) => <p key={p.id}><button className="cp-button" disabled={busy} onClick={() => { setPlan(p);setSelected(p.plan.recordEnrollment?.id||"");setTurns([]);setMessages([]);setInput(""); setReviewed(false); setReply(""); requestId.current = p.id; }}>{p.plan.enquiry.title} · {p.id.slice(0, 8)} · {p.run_id ? "Open run" : "Needs review"}</button></p>)}</aside></div>
  </div>;
}
