"use client";
import { useState } from "react";
import { MessageSquare, ShieldCheck, Database, Mail, Check } from "lucide-react";
import { handoffRequest, reviewRequest } from "@/lib/workflows/request";

export function RequestPlanner({ onReview }: { onReview: (reviewed: boolean) => void }) {
  const [request, setRequest] = useState("");
  const [answer, setAnswer] = useState<ReturnType<typeof reviewRequest> | null>(null);
  const [reviewed, setReviewed] = useState(false);
  function change(value: string) {
    setRequest(value);
    setAnswer(null);
    setReviewed(false);
    onReview(false);
  }
  return <section className="cp-panel cp-durable-card cp-conversation" aria-label="Prepare work with agents">
    <div className="cp-conversation-heading"><MessageSquare size={24} aria-hidden="true" /><div><h2>What would you like done?</h2><p>Start with a prepared customer handoff. Request understanding is limited to this example; no AI model runs.</p></div></div>
    <button className="cp-button" onClick={() => change(handoffRequest)}>Try the customer handoff</button>
    <form onSubmit={(event) => { event.preventDefault(); setAnswer(reviewRequest(request)); setReviewed(false); onReview(false); }}>
      <label htmlFor="work-request">Your request</label>
      <textarea id="work-request" rows={3} maxLength={600} value={request} onChange={(event) => change(event.target.value)} placeholder={handoffRequest} aria-describedby="work-request-help" />
      <p id="work-request-help">Use sample details only. Your text stays in this page while it is open; it is not sent to a model or saved with the run.</p>
      <button className="cp-button cp-button-dark" type="submit">Review a plan</button>
    </form>
    {answer && <div className="cp-conversation-answer" role="status"><strong>LoopLabs</strong><p>{answer.reply}</p></div>}
    {answer?.supported && <div className="cp-conversation-plan">
      <h3>A customer handoff, with a check before each effect</h3>
      <ol>
        <li><Database size={22} aria-hidden="true" /><div><strong>Update one sample contact</strong><p>A CRM agent requests changing its lifecycle to customer. Another named member reviews the exact change before execution.</p></div></li>
        <li><Mail size={22} aria-hidden="true" /><div><strong>Send the prepared acknowledgement</strong><p>A messaging agent uses the fixed case-received message and sample recipient. Independent approval is required. Dispatch stays held until the record update is verified.</p></div></li>
        <li><ShieldCheck size={22} aria-hidden="true" /><div><strong>Check both outcomes</strong><p>Read back both effects before completing the run. A lost response remains uncertain; verification does not resend it.</p></div></li>
      </ol>
      <p><strong>Scope:</strong> private CRM and email twins. No customer email is delivered. Reviewing the plan creates no external effects and grants no permissions.</p>
      <p>Use dedicated registered agents: enrollment restricts them to these workflow steps and cannot be undone in this version.</p>
      <button className="cp-button cp-button-dark" disabled={reviewed} onClick={() => { setReviewed(true); onReview(true); }}>{reviewed ? <><Check size={18} aria-hidden="true" /> Plan reviewed</> : "Use this plan"}</button>
    </div>}
  </section>;
}
