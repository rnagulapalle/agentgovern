import Link from "next/link";
export function ProductOverview({ gated = false }: { gated?: boolean }) {
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
          <Link className="sales-link" href="/control-plane">
            Team workspace ↗
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
        <article>
          <span className="sales-eyebrow">01 · DEFINE</span>
          <h2>Give the agent a boundary</h2>
          <p>
            Assign an identity, owner and role. Choose a supported connector,
            allowed action and usage limit.
          </p>
        </article>
        <article>
          <span className="sales-eyebrow">02 · CONTROL</span>
          <h2>Review consequential actions</h2>
          <p>
            Allow requests within policy, hold exceptions for a named approver,
            and block requests outside the boundary.
          </p>
        </article>
        <article>
          <span className="sales-eyebrow">03 · VERIFY</span>
          <h2>Resolve an uncertain outcome</h2>
          <p>
            Check whether a change happened before permitting another attempt.
            Keep the action, decision and outcome together.
          </p>
        </article>
      </div>
      <h2>Start with the work your team already owns.</h2>
      <p>
        Bring one CRM change, customer credit or approval-heavy process. We map
        its owner, permissions, failure cases and the evidence needed for a
        pilot.
      </p>
      <div className="sales-scope">
        <h2>What you can evaluate today</h2>
        <p>
          Invited users can register a discount agent, set its boundaries, and
          use saved approval and recovery controls on a sample record. The
          prepared refund workflow uses a simulated payment provider. No real
          money moves. Live customer connectors, model execution and a general
          workflow builder are not available yet.
        </p>
      </div>
    </main>
  );
}
