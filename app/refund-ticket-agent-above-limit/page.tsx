import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/refund-ticket-agent-above-limit";

const FAQ = [
  {
    q: "Can AI support agents issue refunds automatically?",
    a: "Only inside limits you define. Many teams allow small refunds automatically but require human approval for higher-value refunds, disputed transactions, repeat refunds, or accounts with fraud signals.",
  },
  {
    q: "What should a refund approval request show?",
    a: "The reviewer should see the ticket, customer, amount, policy, source evidence, agent reasoning, approver identity, and final Stripe result in one audit trail.",
  },
  {
    q: "Where should a mid-size support team start?",
    a: "Start with one rule: refunds above your threshold pause before Stripe. Keep the first rollout narrow, then add cancellation, credit, and return actions after the approval trail is boring.",
  },
];

export const metadata = buildSeoMetadata({
  title: "AI Support Refund Approval — Stop Agents Above Limit",
  description:
    "Govern AI support agents that issue Stripe refunds: route high-value refund requests for human approval and keep a full audit trail.",
  path: PATH,
  keywords: [
    "AI support agent refund approval",
    "AI agent Stripe refund limit",
    "customer support AI refund governance",
    "AI refund audit trail",
    "human approval AI refunds",
  ],
});

export default function RefundTicketAgentAboveLimitPage() {
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
              headline: "AI Support Refund Approval",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Support · refund approvals"
        title="The support agent tried to refund $640. Your policy says approvals start at $500."
        description="AI support agents can close tickets faster when they can act in Stripe, Shopify, Zendesk, and billing systems. The risk starts when a helpful agent can issue money without a human approval trail."
        stats={[
          { value: "$640", label: "refund request" },
          { value: "$500", label: "approval limit" },
          { value: "Stripe", label: "governed action" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode support leaders will see">
          <p>
            A customer writes in after a billing issue. The AI support agent reads the
            ticket, finds the account, decides a refund is warranted, and prepares a
            Stripe refund. The answer may be correct. The control problem is that the
            amount is above policy.
          </p>
          <p>
            Without an approval gate, support velocity turns into a finance incident:
            the refund executes, the ticket closes, and later finance has to reconstruct
            why the AI sent money.
          </p>
        </SeoSection>

        <SeoSection title="What LoopLabs demonstrates">
          <p>
            In the{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              live control plane
            </Link>
            , `Billing-Agent-03` attempts a Stripe refund for `$640` to Acme Corp.
            The policy `POL-SPEND-LIMIT-004` requires human approval for charges or
            refunds over `$500`, so the action is routed through the approval queue
            and recorded as an approved high-risk action.
          </p>
          <SeoCards
            items={[
              {
                title: "Threshold before Stripe",
                body: "The policy evaluates the refund amount before the payment action runs, not after money moves.",
                tone: "ok",
              },
              {
                title: "Human approval",
                body: "The reviewer sees the amount, customer, ticket context, policy, and reason before approving.",
                tone: "warn",
              },
              {
                title: "AI audit trail",
                body: "Approval and final Stripe result are separate facts, so finance can see both the decision and the outcome.",
              },
              {
                title: "Narrow rollout",
                body: "Start with refunds over limit before expanding to credits, cancellations, chargebacks, or retention offers.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Refunds under threshold can be auto-approved when customer identity and order state are verified",
              "Refunds above threshold require a named support or finance approver",
              "Disputed transactions, repeat refunds, and fraud-flagged accounts always route to review",
              "Every approval stores ticket ID, customer, amount, policy, approver, timestamp, and Stripe result",
              "Timeouts default to no refund, not silent execution",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/ai-governance-for-mid-size-companies" className="text-indigo-300 hover:text-indigo-200">
              AI governance for mid-size companies
            </Link>{" "}
            ·{" "}
            <Link href="/retail-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Retail discount approval
            </Link>
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
