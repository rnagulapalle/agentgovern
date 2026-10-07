"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageTitle } from "./ui";
import { WorkflowWorkspace } from "./workflow-workspace";
import { enquiryRequest, type Turn } from "@/lib/enquiries/chat-contract";
type Plan = { id: string; plan_hash: string; source_version: string; run_id: string | null; plan: { enquiry: { title: string; message: string }; contact: { id: string; email: string }; crm: { lifecycle: string }; reply: { recipient: string; subject: string; text: string; reference: string } } };
async function call(payload?: object) {
  const response = await fetch("/api/workspace/enquiries", { cache: "no-store", ...(payload ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "The enquiry could not be confirmed.");
  return data;
}
export function EnquiryWorkspace() {
  const requestId = useRef("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([]);
  const [input, setInput] = useState("");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [agents, setAgents] = useState<{ id: string; tools: string[] }[]>([]);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [reply, setReply] = useState("");
  const [crm, setCrm] = useState("");
  const [email, setEmail] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    const data = await call(); setPlans(data.plans);
    const response = await fetch("/api/workspace/agents", { cache: "no-store" });
    const directory = await response.json();
    if (!response.ok) throw new Error(directory.error || "Agent directory unavailable.");
    setAgents(directory.agents);
  }, []);
  useEffect(() => { load().catch((e) => setError(e.message)); }, [load]);
  async function task(fn: () => Promise<void>) {
    setBusy(true); setError("");
    try { await fn(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "The result is uncertain. Refresh before retrying."); } finally { setBusy(false); }
  }
  return <div className="cp-durable">
    <PageTitle eyebrow="WORK WITH AGENTS" title="Describe the work. Rehearse it first." description="Ask for a customer acknowledgement, review the exact plan, and follow it through approval and verified outcomes." />
    <section className="cp-durable-scope"><strong>Customer enquiry rehearsal</strong><p>Chat interprets your request using a model. This first workflow uses one sample CRM contact and an approved acknowledgement through isolated FetchSandbox twins. No real email is delivered. Inbox monitoring, live connections and arbitrary reply generation are not enabled.</p></section>
    {error && <p role="alert" className="cp-durable-error">{error}</p>}
    <section className="cp-panel cp-durable-card cp-conversation">
      <h2>1. What would you like to automate?</h2>
      <p>Describe the job using sample details. Your messages are sent to the planning model; do not include private customer data or credentials. We save only the validated sample plan, not this conversation.</p>
      <div role="log" aria-label="Workflow conversation" aria-live="polite">{messages.map((m, i) => <article className="cp-durable-scope" key={i}><strong>{m.role === "user" ? "You" : "LoopLabs"}</strong><p>{m.text}</p></article>)}</div>
      <label htmlFor="enquiry-message">Your request or clarification</label>
      <textarea id="enquiry-message" rows={4} maxLength={800} disabled={busy || !!plan} value={input} onChange={e => setInput(e.target.value)} placeholder="When a customer asks about our service…" />
      <button className="cp-button" disabled={busy || !!plan} onClick={() => setInput(enquiryRequest)}>Use example request</button>{" "}
      <button className="cp-button cp-button-dark" disabled={busy || !!plan || !input.trim()} onClick={() => task(async () => {
        if (!requestId.current) requestId.current = crypto.randomUUID();
        setReviewed(false);
        const next: Turn[] = [...turns, { role: "user", text: input.trim() }];
        const result = await call({ operation: "chat", id: requestId.current, turns: next });
        const answer = result.clarification || result.reply;
        setTurns(next); setMessages([...messages, { role: "user", text: input.trim() }, { role: "assistant", text: answer }]); setInput("");
        setPlan(result.saved || null); setReply(answer);
      })}>{busy ? "Preparing…" : "Send request"}</button>
      {reply && <p role="status">{reply}</p>}
      <button className="cp-button" disabled={busy} onClick={() => { requestId.current = ""; setPlan(null); setReply(""); setReviewed(false); setTurns([]); setMessages([]); setInput(""); }}>Start a new conversation</button>
    </section>
    {plan && <section className="cp-panel cp-durable-card cp-conversation-plan">
      <h2>2. Review this exact plan</h2>
      <p><strong>Enquiry:</strong> {plan.plan.enquiry.message}</p>
      <p><strong>Matched contact:</strong> {plan.plan.contact.email} · record {plan.plan.contact.id}</p>
      <p><strong>CRM change:</strong> retain the contact lifecycle as {plan.plan.crm.lifecycle}. This sample connector does not write enquiry notes or create new contacts.</p>
      <article className="cp-durable-scope"><strong>Prepared reply to {plan.plan.reply.recipient}</strong><p>{plan.plan.reply.subject}</p><p>{plan.plan.reply.text}</p><p>Approved information: {plan.plan.reply.reference}</p></article>
      <p>A separate named member approves each exact action. The acknowledgement cannot dispatch while the CRM result is uncertain. Agent enrollment restricts standalone work and cannot be undone in this version.</p>
      {!plan.run_id && <>
        <div className="cp-durable-form">{[["CRM", crm, setCrm, "twin.crm"], ["Messaging", email, setEmail, "twin.email"]].map(([label, value, setValue, tool]) => <label key={label as string}>{label as string} agent<select disabled={busy} value={value as string} onChange={(e) => { (setValue as (value: string) => void)(e.target.value); setReviewed(false); }}><option value="">Choose a dedicated agent</option>{agents.filter((a) => a.tools.includes(tool as string)).map((a) => <option key={a.id}>{a.id}</option>)}</select></label>)}</div>
        <label className="cp-enquiry-review"><input type="checkbox" checked={reviewed} disabled={busy} onChange={(e) => setReviewed(e.target.checked)} /> I reviewed the recipient, reply, CRM change and agent boundaries. This does not approve execution.</label>
        <button className="cp-button cp-button-dark" disabled={busy || !reviewed || !crm || !email} onClick={() => task(async () => {
          const result = await call({ operation: "start", id: plan.id, planHash: plan.plan_hash, crmAgent: crm, emailAgent: email });
          setPlan({ ...plan, run_id: result.runId });
        })}>Create this reviewed workflow</button>
      </>}
    </section>}
    {plan?.run_id && <WorkflowWorkspace embeddedRunId={plan.run_id} />}
    <section className="cp-panel cp-durable-card"><h2>Saved enquiries</h2><p>Open saved work after a refresh. Reusing an enquiry ID resumes its existing plan and run.</p>{plans.map((p) => <p key={p.id}><button className="cp-button" disabled={busy} onClick={() => { setPlan(p); setReviewed(false); setReply(""); requestId.current = p.id; }}>{p.plan.enquiry.title} · {p.id.slice(0, 8)} · {p.run_id ? "Open run" : "Needs review"}</button></p>)}</section>
  </div>;
}
