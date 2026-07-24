import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/invoice-approval-agent-threshold";

const FAQ = [
  {
    q: "Can an AI agent approve invoices at all?",
    a: "Below a defined threshold with a clean three-way match, yes — that is exactly the tedious volume AP teams want off their desk. The governance question is the threshold itself: who set it, where it is enforced, and what happens to the invoice that exceeds it.",
  },
  {
    q: "Isn't the ERP's approval matrix enough?",
    a: "The ERP matrix governs human approvers. An agent with an API credential typically enters as one integration user — often provisioned with generous limits so workflows don't break. The policy has to bind to the action the agent attempts, not to the credential it holds.",
  },
  {
    q: "What does SOX require for automated approvals?",
    a: "SOX section 404 requires demonstrable controls over financial reporting — segregation of duties and evidence that high-value disbursements got independent review. An agent that self-approves above the delegated limit is a control deficiency your auditor will write up, however accurate its matching was.",
  },
];

export const metadata = buildSeoMetadata({
  title: "AI Agent Approved an Invoice Above the Threshold — AP Governance",
  description:
    "Govern AP automation agents: enforce invoice approval thresholds outside the agent, route above-limit invoices to a named approver, and keep a SOX-ready audit trail.",
  path: PATH,
  keywords: [
    "AI agent invoice approval workflow",
    "AP automation agent approval threshold",
    "invoice approval AI agent SOX",
    "accounts payable agent governance",
    "AI agent segregation of duties",
  ],
});

export default function InvoiceApprovalAgentThresholdPage() {
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
              headline: "AI Agent Approved an Invoice Above the Threshold",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Finance · approval thresholds"
        title="The agent matched the PO, matched the receipt — and approved a $48,000 invoice on its own."
        description="AP automation agents are good at three-way matching. That is the trap: a clean match feels like permission. Your delegation-of-authority matrix says invoices above $10,000 need a controller's sign-off — and the agent's API token has never read that matrix."
        stats={[
          { value: "$48,000", label: "invoice approved" },
          { value: "$10,000", label: "delegated limit" },
          { value: "0", label: "humans in the loop" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode controllers recognize">
          <p>
            An AP agent gets a reasonable mandate: match invoices to purchase
            orders and receipts, approve the clean ones, flag the exceptions.
            It does this well — that is why it was deployed. But
            &quot;clean match&quot; and &quot;within authority&quot; are
            different tests, and only one of them lives in the agent&apos;s
            prompt.
          </p>
          <p>
            The $48,000 invoice matches perfectly. The vendor is real, the PO
            is real, the goods were received. The agent approves it because
            nothing in its instructions distinguishes this invoice from the
            two hundred small ones it approved the same week. Quarter-end
            close arrives, the auditor samples disbursements, and the firm now
            has a documented instance of an automated approval above the
            delegated limit — a segregation-of-duties finding, regardless of
            whether the payment itself was correct.
          </p>
        </SeoSection>

        <SeoSection title="What AgentGovernance demonstrates">
          <p>
            In the{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              live control plane
            </Link>
            , money movement is a gated category with an amount threshold the
            agent cannot see, negotiate, or reinterpret. Below the limit, the
            approval runs and a receipt is written. Above it, the action lands
            in the approval queue for a named owner — before anything posts to
            the ERP.
          </p>
          <SeoCards
            items={[
              {
                title: "Threshold outside the prompt",
                body: "The $10,000 limit lives in policy, not in instructions the agent can rationalize around. A perfect three-way match does not raise the ceiling.",
                tone: "warn",
              },
              {
                title: "Queue, not silence",
                body: "Above-limit invoices route to the controller with the match evidence attached. The agent did the tedious work; the human makes the call it was never delegated.",
                tone: "ok",
              },
              {
                title: "Receipts for both outcomes",
                body: "Approved and held invoices each get a logged verdict — agent, amount, policy version, timestamp. That is the evidence trail a SOX walkthrough asks for.",
              },
              {
                title: "Small invoices stay fast",
                body: "The two hundred sub-threshold invoices still clear without a human touch. Governance costs the exception, not the volume.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "AP agent approvals above the delegated-authority limit never auto-run — they queue for a named approver.",
              "The threshold is enforced in an external policy engine, not in the agent's prompt or the ERP integration user's permissions.",
              "Every approval — human or agent — records amount, matching evidence, policy version, and approver identity.",
              "New-vendor and changed-bank-detail invoices route to a human at any amount.",
              "Review the approval queue weekly: repeated above-limit attempts from one workflow mean the mandate, not the agent, needs fixing.",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            Amount thresholds are one slice of the same category rule that
            governs{" "}
            <Link href="/refund-ticket-agent-above-limit" className="text-indigo-300 hover:text-indigo-200">
              support refunds above the limit
            </Link>{" "}
            and{" "}
            <Link href="/external-party-actions-always-approve" className="text-indigo-300 hover:text-indigo-200">
              external-party actions
            </Link>
            . For the accounting-firm view of client-facing agent risk, see{" "}
            <Link href="/accounting-firm-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              accounting firm AI governance
            </Link>
            .
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
