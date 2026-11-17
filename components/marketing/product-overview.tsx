import Link from "next/link";
export function ProductOverview({ gated = false, quoteOnly = false, scriptDemo = false }: { gated?: boolean; quoteOnly?: boolean; scriptDemo?: boolean }) {
  return (
    <main className="sales-main">
      <div className="sales-eyebrow">
        {gated ? "PRIVATE TEAM WORKSPACE" : "THE AGENT CONTROL PLANE"}
      </div>
      <h1>
        Give agents a job.
        <br />
        Set the boundaries.
        <br />
        Know what happened.
      </h1>
      <p>
        LoopLabs helps teams define one workflow, decide what an agent may
        change, and review the outcome before an uncertain action is retried.
      </p>
      <div className="sales-actions">
        <Link className="sales-cta" href="/contact-sales">
          Talk through your workflow ↗
        </Link>
        {gated ? (
          <Link className="sales-link" href="/sign-in">
            Already invited? Sign in
          </Link>
        ) : (
          <Link className="sales-link" href={quoteOnly ? "/control-plane/quotes" : "/control-plane"}>
            {quoteOnly ? "Quote workspace ↗" : "Team workspace ↗"}
          </Link>
        )}
      </div>
      {gated && (
        <p>
          The control plane is available to invited teams. Contact us for a
          guided walkthrough and a bounded pilot.
        </p>
      )}
      <div className="sales-steps">
        <article id="workflow-boundaries">
          <span className="sales-eyebrow">01 · DEFINE</span>
          <h2>Give the agent a boundary</h2>
          <p>
            Assign an identity, owner and role. Choose a supported connector,
            allowed action and usage limit.
          </p>
        </article>
        <article id="approved-execution">
          <span className="sales-eyebrow">02 · CONTROL</span>
          <h2>Review consequential actions</h2>
          <p>
            Allow requests within policy, hold exceptions for a named approver,
            and block requests outside the boundary.
          </p>
        </article>
        <article id="verified-outcomes">
          <span className="sales-eyebrow">03 · VERIFY</span>
          <h2>Resolve an uncertain outcome</h2>
          <p>
            Check whether a change happened before permitting another attempt.
            Keep the action, decision and outcome together.
          </p>
        </article>
      </div>
      <section id="coding-agent-controls" className="sales-scope" aria-labelledby="coding-controls-title">
        <span className="sales-eyebrow">CODING AGENT CONTROLS · DEMO</span>
        <h2 id="coding-controls-title">Team budgets. Clear model access.</h2>
        <p>
          Explore engineers, teams and organization-level controls in a guided demo.
          Review allowed models, token and spend budgets, skills and versioned prompts.
        </p>
        <p>
          These are sample controls. Demo changes affect the page only; they do not
          connect coding clients, meter real usage or enforce model access or budgets.
        </p>
        <Link className="sales-link" href="/contact-sales">See the coding agent demo ↗</Link>
      </section>
      <h2>Start with the work your team already owns.</h2>
      <p>
        Bring one CRM change, customer credit or approval-heavy process. We map
        its owner, permissions, failure cases and the evidence needed for a
        pilot.
      </p>
      <div className="sales-scope">
        <h2>What you can evaluate today</h2>
        {quoteOnly ? <p>
          This deployment provides one invited quote workflow: prepare a proposed discount,
          request independent manager approval, apply the approved change, and verify the
          outcome before a simulated confirmation email. Quote and email effects use isolated
          sample systems. No real money moves and no customer email is delivered.
          Reviewing a plan does not authorize execution. Agent registration, the model gateway,
          and the other platform workspaces are not available in this deployment.
        </p> : scriptDemo ? <p>
          Invited users can register sample discount, CRM and messaging agents with named
          owners and action limits. Review exact requests, approve exceptions independently,
          verify uncertain results, and inspect saved decision history. A fixed CRM-to-message
          workflow holds the message until the CRM change is verified. The separate quote
          workspace remains available. All effects use sample records or simulated systems;
          no customer email is delivered. Reviewing a plan does not authorize execution.
          Live customer connectors, refunds and a general workflow builder are not available
          in this deployment.
        </p> : <p>
          Invited users can register discount, CRM and messaging agents with
          named owners and supported boundaries. Saved controls govern a sample
          discount record, a simulated CRM contact and a prepared customer
          message. The refund workflow uses a simulated payment provider. No
          real money moves and no customer email is delivered. Where enabled,
          the separate invited enquiry workspace uses a bounded planner to
          prepare one supported CRM-to-message plan for independent review.
          Reviewing a plan does not authorize execution. Live customer
          connectors and a general workflow builder are not available yet.
        </p>}
      </div>
    </main>
  );
}
