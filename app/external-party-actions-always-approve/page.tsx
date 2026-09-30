import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/external-party-actions-always-approve";

const FAQ = [
  {
    q: "Should AI sales agents auto-send external emails?",
    a: "Most mid-size teams start with a category rule: any action that touches an external party or moves money requires human approval, even when the draft looks correct.",
  },
  {
    q: "Is a CRM write-approval toggle enough?",
    a: "It helps for CRM updates, but external sends need a separate gate with recipient evidence, policy outcome, approver identity, and final delivery receipt.",
  },
  {
    q: "Where should RevOps start?",
    a: "Start with one category: external email never auto-sends. Route vendor, customer, and partner messages through approval before Gmail or Outlook sends.",
  },
];

export const metadata = buildSeoMetadata({
  title: "External Party Actions Always Need Approval — AI Agent Governance",
  description:
    "Govern AI agents that email customers, vendors, and partners: require human approval for external-party actions and keep a full audit trail.",
  path: PATH,
  keywords: [
    "human in the loop sales agent external email",
    "AI agent external party approval",
    "AI sales agent governance",
    "Copilot external email approval",
    "AI agent category approval",
  ],
});

export default function ExternalPartyActionsAlwaysApprovePage() {
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
              headline: "External Party Actions Always Need Approval",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Sales · external-party actions"
        title="The AI sales agent drafted a vendor email. Your policy says external sends never auto-run."
        description="When agents can draft CRM updates, schedule follow-ups, and send Gmail messages, the risky category is not formatting. It is any action that reaches someone outside your company without a human approval trail."
        stats={[
          { value: "External", label: "party action" },
          { value: "Gmail", label: "governed channel" },
          { value: "Always", label: "approval required" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode RevOps recognizes">
          <p>
            A sales agent gets a simple task: email the renewal amendment to a
            vendor contact and update the deal stage. The draft looks fine. The CRM
            note is coherent. The agent prepares the Gmail send.
          </p>
          <p>
            The control problem is category, not copy quality. External-party actions
            can reach the wrong recipient, leak negotiation details, or send before
            legal review — even when the agent followed the prompt perfectly.
          </p>
        </SeoSection>

        <SeoSection title="What LoopLabs demonstrates">
          <p>
            In the{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              live control plane
            </Link>
            , actions that touch external parties route through approval instead of
            auto-executing. The reviewer sees the intended recipient, message diff,
            source record freshness, policy outcome, and final send receipt as
            separate facts.
          </p>
          <SeoCards
            items={[
              {
                title: "Category gate first",
                body: "External email, money movement, and vendor-facing sends require approval before the tool call runs.",
                tone: "warn",
              },
              {
                title: "Recipient evidence",
                body: "The queue shows who will receive the message and which CRM or ticket record sourced that target.",
                tone: "ok",
              },
              {
                title: "Separate approval vs outcome",
                body: "Approval and final delivery are logged separately so audit can see both the decision and what actually sent.",
              },
              {
                title: "Narrow rollout",
                body: "Start with external email only. Add CRM bulk writes and calendar invites after the approval trail is boring.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Define one category: touchesExternalParty = always approve.",
              "Block auto-send in Gmail, Outlook, and CRM-embedded mail tools.",
              "Require recipient + source record on every approval card.",
              "Log approver identity, policy version, and final send receipt.",
              "Review one near-miss per week before expanding to payments or deletes.",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            Pair this with{" "}
            <Link href="/stale-crm-contact-agent-blocked" className="text-indigo-300 hover:text-indigo-200">
              stale CRM contact blocking
            </Link>{" "}
            when the external send would use old source-of-truth data, and{" "}
            <Link href="/retail-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              retail Copilot discount governance
            </Link>{" "}
            when the external action includes pricing authority.
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
