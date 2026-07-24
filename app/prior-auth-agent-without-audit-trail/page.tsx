import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/prior-auth-agent-without-audit-trail";

const FAQ = [
  {
    q: "Can AI agents submit prior authorizations?",
    a: "Increasingly, yes — PA is high-volume, form-driven work that agents handle well. The compliance question isn't whether the agent can fill the form; it's whether you can reconstruct who drafted, who reviewed, and who released each submission after the fact.",
  },
  {
    q: "What does HIPAA actually require for audit trails?",
    a: "The Security Rule (§164.312(b)) requires mechanisms that record and examine activity in systems containing ePHI. An agent that submits a PA with no draft→review→submit record fails that test even when the submission itself was clinically correct.",
  },
  {
    q: "Doesn't the EHR log the submission already?",
    a: "The EHR logs that a submission happened. It doesn't log the agent's draft, what the reviewing human saw, whether anything changed between review and release, or which policy allowed the auto-path. Payers and auditors ask for that chain, not just the endpoint.",
  },
];

export const metadata = buildSeoMetadata({
  title: "AI Agent Submitted a Prior Auth — With No Audit Trail",
  description:
    "Govern prior authorization agents in healthcare admin: require a draft→review→submit lifecycle log for every PA, so HIPAA audits reconstruct the chain instead of finding a gap.",
  path: PATH,
  keywords: [
    "prior authorization AI agent audit",
    "AI agent prior auth compliance",
    "healthcare admin agent audit trail",
    "prior auth automation HIPAA",
    "AI agent PA submission governance",
  ],
});

export default function PriorAuthAgentWithoutAuditTrailPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd(FAQ)) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            articleJsonLd({
              headline: "AI Agent Submitted a Prior Auth — With No Audit Trail",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Healthcare admin · audit trails"
        title="The prior auth went out. Nobody can say who reviewed it."
        description="The PA agent works: it pulls the chart data, fills the payer form, submits. Six months later the payer audits a denial pattern and asks a simple question — show us the review chain for these forty submissions. The answer is a log line that says 'submitted'."
        stats={[
          { value: "Draft", label: "unlogged" },
          { value: "Review", label: "unlogged" },
          { value: "Submit", label: "the only record" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode revenue-cycle teams recognize">
          <p>
            Prior authorization is exactly the work healthcare admin wants
            agents to take: repetitive, form-shaped, high-volume. So the agent
            gets deployed, and it&apos;s good — submissions go out faster,
            denials drop, everyone moves on.
          </p>
          <p>
            The gap only surfaces under audit. A payer questions a batch of
            submissions; compliance asks for the lifecycle of each one. Who
            drafted it? What did the reviewing clinician actually see? Did the
            form change between review and release? Which policy allowed this
            PA to go straight through while that one waited for sign-off?
            When the agent&apos;s pipeline logs only the final POST, every one
            of those questions gets the same answer: we can&apos;t
            reconstruct it. Under HIPAA&apos;s audit-control requirement
            (§164.312(b)), that reconstruction gap is itself the finding —
            independent of whether any individual submission was wrong.
          </p>
        </SeoSection>

        <SeoSection title="What AgentGovernance demonstrates">
          <p>
            The{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              live control plane
            </Link>{" "}
            treats an agent action as a lifecycle, not an event: propose →
            review → decide → execute, each stage written to the record as it
            happens, with the approval log kept separate from the outcome log.
          </p>
          <SeoCards
            items={[
              {
                title: "Draft is a recorded state",
                body: "The agent's proposed submission is captured before any human sees it — what it wanted to send, built from which chart fields.",
              },
              {
                title: "Review is attributable",
                body: "The releasing human is named on the record, along with exactly what they reviewed. 'Someone probably looked at it' stops being the answer.",
                tone: "ok",
              },
              {
                title: "Approval ≠ outcome",
                body: "The decision to release and the submission result are separate log entries — so a payer rejection can't masquerade as a review failure, or vice versa.",
              },
              {
                title: "Auto-lanes are policy, not habit",
                body: "Routine renewals can flow without review — but which PA types auto-flow is a versioned policy an auditor can read, not tribal knowledge.",
                tone: "warn",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Every PA submission records its full lifecycle: agent draft, reviewer identity, release decision, payer response.",
              "New or non-routine PA types route to a named clinician before release; routine renewals may auto-flow under a versioned policy.",
              "Approval logs and outcome logs are stored separately and both retained.",
              "The agent's data sources (which chart fields fed the form) are captured with the draft.",
              "Run a quarterly self-audit: pick ten submissions, attempt full reconstruction, treat any gap as a P1.",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            This is the healthcare-admin slice of a general rule: an
            agent&apos;s work product needs a reviewable chain, not just a
            result. See{" "}
            <Link href="/healthcare-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              healthcare Copilot governance
            </Link>{" "}
            for the PHI-export side, and{" "}
            <Link href="/invoice-approval-agent-threshold" className="text-indigo-300 hover:text-indigo-200">
              invoice approval above threshold
            </Link>{" "}
            for the same approval-evidence logic applied to finance.
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
