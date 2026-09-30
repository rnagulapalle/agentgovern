import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/zendesk-ticket-reply-agent-auto";

const FAQ = [
  {
    q: "Should AI agents ever auto-reply on Zendesk?",
    a: "For narrow, low-risk macros (shipping ETA FAQ, password reset links) auto-reply can work — with a receipt and an easy escalate path. Public replies that commit refunds, legal positions, or account changes should queue for a human.",
  },
  {
    q: "Isn't the Zendesk macro library the control?",
    a: "Macros are content. Governance is which tickets may auto-send, who approved that class, and what evidence remains after send. A wrong macro that auto-sends is still a customer-facing commitment.",
  },
  {
    q: "What does a good control look like?",
    a: "Classify reply types: FAQ auto with receipt; exception and money/legal always queue; every public reply logs draft, policy version, and whether a human released it.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Zendesk AI Agent Auto-Replied — Without Approval",
  description:
    "Govern Zendesk AI ticket replies: allow narrow FAQ auto-sends with receipts, and require human approval for refunds, legal, and exception macros before they go public.",
  path: PATH,
  keywords: [
    "AI agent Zendesk reply governance",
    "Zendesk AI auto reply approval",
    "support agent ticket reply controls",
    "AI customer support governance",
    "Zendesk macro agent approval",
  ],
});

export default function ZendeskTicketReplyAgentAutoPage() {
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
              headline: "Zendesk AI Agent Auto-Replied — Without Approval",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Customer support · ticket replies"
        title="The agent replied on the ticket. Nobody approved the words."
        description="Ticket #4821 asked about a billing dispute. The support agent auto-sent a macro that promised a full refund. Finance never saw it. The customer screenshotted the reply. Your policy lived in a prompt that said 'be careful with money.'"
        stats={[
          { value: "Macro", label: "auto-sent" },
          { value: "Refund", label: "promised" },
          { value: "Approval", label: "none" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode support leads recognize">
          <p>
            Zendesk (and peers) make it easy to wire an LLM to draft or send
            public replies. Volume drops. CSAT ticks up — until the model picks
            the wrong macro, invents a policy exception, or soft-commits a
            refund that your finance team does not honor.
          </p>
          <p>
            The gap is not “AI in the helpdesk.” The gap is treating a public
            customer reply like a private draft. Once it is on the ticket, it is
            a commitment. Prompt hygiene is not an approval chain.
          </p>
        </SeoSection>

        <SeoSection title="What LoopLabs demonstrates">
          <p>
            In the{" "}
            <Link
              href="/agent-governance-demo"
              className="text-indigo-300 hover:text-indigo-200"
            >
              live control plane
            </Link>
            , ticket public replies are a governed action class: FAQ-class
            autos can run with a receipt; money and legal macros queue for a
            named owner before send.
          </p>
          <SeoCards
            items={[
              {
                title: "Classify the reply",
                body: "Shipping FAQ ≠ refund promise ≠ legal hold language. Only the first class should ever auto-send by default.",
                tone: "warn",
              },
              {
                title: "Queue the exceptions",
                body: "Billing disputes, chargebacks, and goodwill credits land in approval with the draft attached — the agent did the triage; a human releases the words.",
                tone: "ok",
              },
              {
                title: "Receipt on every send",
                body: "Auto or human: log ticket id, macro/draft hash, policy version, and releaser. That is what you open when the customer forwards the thread to counsel.",
              },
              {
                title: "Easy escalate",
                body: "Customers (and agents) need a one-click path out of the auto lane. Silent dead-ends create chargebacks.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Public ticket replies that mention refund, credit, legal, or account closure never auto-send.",
              "FAQ autos require an allowlisted macro id and write a receipt before send.",
              "Every public reply records draft/macro, policy version, and whether a human released it.",
              "Agents can always escalate to a human queue without re-prompting the model.",
              "Weekly review: autos that get overridden often mean the allowlist is wrong.",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            Ticket reply governance pairs with{" "}
            <Link
              href="/refund-ticket-agent-above-limit"
              className="text-indigo-300 hover:text-indigo-200"
            >
              refund-above-limit approval
            </Link>{" "}
            and{" "}
            <Link
              href="/external-party-actions-always-approve"
              className="text-indigo-300 hover:text-indigo-200"
            >
              external-party send rules
            </Link>
            . For tool calls with no evidence bundle, see{" "}
            <Link
              href="/mcp-tool-call-without-receipt"
              className="text-indigo-300 hover:text-indigo-200"
            >
              MCP tool call without receipt
            </Link>
            .
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
