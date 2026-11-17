import Link from "next/link";

export function ProductScope({ quoteOnly = false, scriptDemo = false }: { quoteOnly?: boolean; scriptDemo?: boolean }) {
 return (
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
 );
}

export function CodingControlsScope() { return (
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
); }
