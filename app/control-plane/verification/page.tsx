import Link from "next/link";
import evidence from "@/docs/evidence/connector-proof.json";
import { PageTitle } from "@/components/control-plane/ui";
const descriptions: Record<string, [string, string]> = {
  "workflow: external agents submit scoped steps through actual HTTP handlers":
    [
      "External agents submit only their own steps",
      "Separate agent processes call LoopLabs over HTTP without provider credentials.",
    ],
  "workflow: fresh action IDs cannot escape enrolled agent boundaries": [
    "An enrolled agent cannot escape its workflow",
    "Fresh action IDs outside the immutable plan are refused.",
  ],
  "workflow: downstream API cannot bypass a missing predecessor": [
    "The next action waits for the previous result",
    "Calling the action API directly cannot bypass the workflow dependency.",
  ],
  "workflow: lost upstream response holds downstream execution": [
    "An uncertain update holds the message",
    "A lost response after the twin write prevents downstream dispatch.",
  ],
  "workflow: API process termination preserves run and proposals": [
    "Workflow decisions survive interruption",
    "The HTTP process is killed and restarted, then the agent replays its existing request.",
  ],
  "workflow: reconciliation unlocks the downstream step without resending upstream":
    [
      "Verification lets the workflow continue",
      "The existing CRM effect is found, then the message executes and both results are checked.",
    ],
  "workflow: stale CRM approval cannot release the downstream message": [
    "A stale approval cannot move the workflow forward",
    "The fixture refuses an outdated record version and the message stays held.",
  ],
  "workflow: provider bypass without its private credential is rejected": [
    "Agent credentials cannot bypass the connector",
    "The private twin refuses a direct request using a LoopLabs agent key.",
  ],
  "crm: exact approval, execute and authoritative read-back": [
    "The CRM change matches the approval",
    "Read the simulated contact back and compare its saved value with the approved request.",
  ],
  "crm: replay sends no second effect": [
    "A repeated CRM request changes the record once",
    "Replaying the same action ID adds no second provider effect.",
  ],
  "crm: response lost after effect, reconcile without resend": [
    "An interrupted CRM response can be verified",
    "The change is saved before the response disappears. Verification finds it without writing again.",
  ],
  "crm: restart preserves effect and prevents duplicate replay": [
    "A CRM restart preserves the outcome",
    "The private provider twin restarts with the saved effect and its replay evidence.",
  ],
  "crm: later write produces conflict": [
    "A newer CRM change is protected",
    "An intervening update produces a conflict rather than allowing a blind retry.",
  ],
  "email: exact approval, execute and authoritative read-back": [
    "The message matches the approval",
    "Verify the sample recipient and exact template against the simulated provider record.",
  ],
  "email: replay sends no second effect": [
    "A repeated message request creates one effect",
    "Replaying the same action ID does not create a second message record.",
  ],
  "email: response lost after effect, reconcile without resend": [
    "An interrupted message response is checked first",
    "Verify the existing provider record before considering another action.",
  ],
  "email: restart preserves effect and prevents duplicate replay": [
    "A messaging restart preserves the outcome",
    "The private provider twin retains the message and its replay evidence after restarting.",
  ],
  "provider rejects unauthorized requests": [
    "Provider access needs a credential",
    "An unauthenticated call is refused. Agents are not given provider credentials.",
  ],
  "provider rejects recipient and template escape": [
    "Messages stay within their boundary",
    "A request to a different recipient is refused by the sample connector.",
  ],
  "provider 401: retain uncertainty, never blind retry": [
    "An access failure does not trigger a resend",
    "The simulated provider refuses the request. LoopLabs retains uncertainty and does not assume a safe retry.",
  ],
  "provider 429: retain uncertainty, never blind retry": [
    "A rate limit does not trigger a blind retry",
    "The simulated provider rate-limits the request. LoopLabs requires outcome evidence before further action.",
  ],
  "provider 500: retain uncertainty, never blind retry": [
    "A provider error does not trigger a blind retry",
    "An unavailable response is not treated as proof that nothing happened.",
  ],
  "crm: stale approved source cannot overwrite a later update": [
    "An outdated approval cannot overwrite a newer CRM value",
    "The fixture rejects a write when the approved source version has changed. This mechanism still needs a real-provider equivalent.",
  ],
  "worker SIGKILL before effect": [
    "Interruption before the effect stays contained",
    "The execution process is terminated before dispatch. Missing effect evidence does not cause an automatic retry.",
  ],
  "worker SIGKILL after effect": [
    "Interruption after the effect can be resolved",
    "The execution process is terminated after the provider saves the effect. Verification finds the existing result.",
  ],
  "isolated database backup and restore preserves actions and evidence": [
    "Saved decisions survive a test restore",
    "An isolated database backup is restored and compared with its original actions. Production recovery has not been established.",
  ],
};
export default function VerificationPage() {
  return (
    <div className="cp-durable">
      <PageTitle
        eyebrow="CONTROL EVIDENCE"
        title="What we can prove"
        description="See the behavior verified in controlled tests, the systems you can explore, and the limits that still apply."
      />
      <section className="cp-durable-scope">
        <strong>Saved controls over simulated business systems.</strong>
        <p>
          Approvals, action history and execution state are saved on the server.
          FetchSandbox simulates the provider. These checks do not prove live
          compatibility, real email delivery, production availability or
          enterprise certification.
        </p>
      </section>
      <div className="cp-durable-grid">
        {[
          [
            "Refunds",
            "Amount and budget boundaries, exact approval, provider lookup after a lost response. No real money moves.",
            "refunds",
          ],
          [
            "CRM contact updates",
            "One sample contact, named approval and a fixture version check. A later write prevents blind retry.",
            "crm",
          ],
          [
            "Customer messages",
            "One fixed template and sample recipient. Verify simulated provider acceptance; it is not real delivery.",
            "email",
          ],
        ].map(([title, body, key]) => (
          <section className="cp-panel cp-durable-card" key={key}>
            <h2>{title}</h2>
            <p>{body}</p>
            <Link
              className="cp-button"
              href={`/control-plane/actions?workflow=${key}`}
            >
              Explore {title.toLowerCase()} →
            </Link>
          </section>
        ))}
      </div>
      <section className="cp-panel cp-durable-card">
        <h2>
          {evidence.checks.length} recorded connector and workflow checks passed
        </h2>
        <p>
          Recorded {new Date(evidence.at).toISOString().slice(0, 10)} against an
          isolated database and private provider twins. This is a recorded test
          result, not live workspace telemetry. Refund scenarios have their own
          regression suite.
        </p>
        <div className="workspace-start-steps">
          {evidence.checks.map((c) => (
            <article key={c.name}>
              <strong>Passed</strong>
              <h3>{descriptions[c.name]?.[0] || "Recorded control check"}</h3>
              <p>
                {descriptions[c.name]?.[1] ||
                  "Verified against isolated sample systems."}
              </p>
            </article>
          ))}
        </div>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>How to try the controls</h2>
        <p>
          Register a CRM or messaging agent with an owner. Submit a prepared
          action, then have another workspace member approve it. Execute
          normally or simulate a lost response. Verify with the provider and
          inspect the saved history. Agent keys cannot approve or execute.
        </p>
        <Link className="cp-button" href="/control-plane/agents">
          Register an agent →
        </Link>
      </section>
      <section className="cp-panel cp-durable-card">
        <h2>Before a customer system is connected</h2>
        <p>
          Each connector needs its own real-provider test account, scope review,
          credential isolation and verified outcome lookup. The CRM version and
          action journal here are controlled fixture extensions, not a claim
          that every CRM supports those mechanisms.
        </p>
        <p>
          Enterprise sign-in, credential rotation, production backup recovery,
          supervised workers, measured capacity, alerts and an independent
          security review remain required. A local database restore drill proves
          that test snapshot can be restored; it does not establish production
          disaster recovery.
        </p>
        <Link className="cp-button" href="/contact-sales">
          Discuss one bounded pilot →
        </Link>
      </section>
    </div>
  );
}
