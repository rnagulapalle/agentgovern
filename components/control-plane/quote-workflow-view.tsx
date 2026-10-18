import type { QuoteWorkflowView } from "@/lib/quotes/workflow-view";
const percent=(bps:number)=>new Intl.NumberFormat("en-US",{maximumFractionDigits:2}).format(bps/100)+"%";
const money=(minor:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(minor/100);
/** Read-only saved snapshot. No approval or execution controls belong here. */
export function QuoteWorkflowArtifact({view,currentlyVerified=false,historicallyVerified=false}:{view:QuoteWorkflowView;currentlyVerified?:boolean;historicallyVerified?:boolean}) {
  return <section className="cp-panel cp-durable-card quote-overview" aria-label="Distributor quote workflow">
    <p className="cp-kicker">{view.quoteId} · {view.distributorId}</p><h2>Review the quote and customer confirmation</h2>
    <dl className="quote-totals"><div><dt>List subtotal</dt><dd>{money(view.subtotalMinor)}</dd></div><div><dt>Proposed total</dt><dd><strong>{money(view.totalMinor)}</strong></dd></div></dl>
    <p className="quote-policy">Requested discount <strong>{percent(view.discountBps)}</strong> {view.discountBps>view.delegatedBps?"exceeds":"is within"} the agent’s <strong>{percent(view.delegatedBps)}</strong> delegated authority. Policy hard cap: <strong>{percent(view.hardCapBps)}</strong>. {currentlyVerified||historicallyVerified?'Each exact action was independently approved.':'Exact independent approval is required.'}</p>
    <p className="quote-manager"><span>Designated manager</span><strong>{view.manager}</strong></p>
    <ol className="quote-steps" aria-label="Quote actions">{view.steps.map(step=><li key={step.actionId}><h3>{step.title}</h3><p>{step.status}</p></li>)}</ol>
    <section className="quote-message" aria-label="Exact customer message"><h3>Customer confirmation</h3><p>To: {view.customer}</p><p><strong>{view.subject}</strong></p><p style={{whiteSpace:"pre-wrap"}}>{view.message}</p></section>
    <p className="quote-snapshot-note">Saved proposal. Viewing it does not approve or execute either action.</p>
    <details><summary>Technical references</summary><dl><dt>Saved plan</dt><dd>{view.planId}</dd><dt>Exact plan hash</dt><dd>{view.planHash}</dd><dt>Reviewed source version</dt><dd>{view.sourceVersion}</dd></dl>
      {view.steps.map(step=><p key={step.actionId}>{step.title}: {step.actionId}{step.evidenceReference?` · Recorded evidence: ${step.evidenceReference}`:" · No recorded reference"}</p>)}</details>
  </section>;
}
