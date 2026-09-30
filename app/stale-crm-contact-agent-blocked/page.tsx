import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/stale-crm-contact-agent-blocked";

const FAQ = [
  {
    q: "Should AI sales agents send vendor or customer emails from stale CRM records?",
    a: "No. If the source-of-truth record is stale, the send should be held until the record is refreshed or a human signs a specific exception.",
  },
  {
    q: "Is a CRM approval toggle enough?",
    a: "It helps, but the reviewer needs evidence: source record, last sync time, intended recipient, message diff, policy outcome, and final send receipt.",
  },
  {
    q: "Where should mid-size teams start?",
    a: "Start with one boring rule: no external email from a CRM contact older than your freshness limit. Route stale records to RevOps or the account owner for review.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Stale CRM Contact Blocked — AI Sales Agent Governance",
  description:
    "AI sales agent governance for stale CRM records: block vendor-facing emails when HubSpot or Salesforce contact data is too old, with approval and audit trails.",
  path: PATH,
  keywords: [
    "AI agent wrong email CRM stale",
    "AI sales agent governance",
    "HubSpot AI agent approval",
    "CRM stale contact approval",
    "AI agent audit trail sales",
  ],
});

export default function StaleCrmContactAgentBlockedPage() {
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
              headline: "Stale CRM Contact Blocked",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Sales · stale CRM records"
        title="The AI sales agent found a contact. HubSpot had not synced it in 41 days."
        description="When AI agents can draft vendor emails, update CRM stages, and schedule follow-ups, stale source-of-truth data becomes an action risk. The fix is not a better prompt. It is a freshness gate before the external send."
        stats={[
          { value: "41d", label: "stale record" },
          { value: "14d", label: "freshness limit" },
          { value: "Gmail", label: "blocked action" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode RevOps recognizes">
          <p>
            A sales agent gets a simple task: email the renewal quote to Northwind
            Logistics and move the deal forward in HubSpot. The agent finds a contact,
            drafts the message, and prepares the CRM update.
          </p>
          <p>
            The problem is not the draft. The HubSpot contact was last synced 41 days
            ago. If that contact changed roles or the renewal owner moved, the agent is
            about to send a quote to the wrong person with a perfect-looking explanation.
          </p>
        </SeoSection>

        <SeoSection title="What the live demo blocks">
          <p>
            LoopLabs includes this exact stale-CRM scenario in the{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              live demo
            </Link>
            : an SDR agent attempts a Gmail send using a HubSpot contact that is
            41 days old. The policy says external sends require records fresher
            than 14 days, so the email is blocked before it leaves.
          </p>
          <SeoCards
            items={[
              {
                title: "Source-of-truth freshness",
                body: "The receipt shows HubSpot as the source and the exact last-sync age, not just the agent's confidence.",
                tone: "ok",
              },
              {
                title: "External send held",
                body: "Gmail send is the governed action. CRM and calendar tasks can be lower risk, but the external email waits.",
                tone: "warn",
              },
              {
                title: "Refresh or signed override",
                body: "The reviewer can send it back to refresh the record or approve an explicit exception that stays in the audit trail.",
              },
              {
                title: "Receipt after decision",
                body: "The audit record separates the blocked request, any approval, and the final external result.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The policy to start with">
          <SeoList
            items={[
              "No external email may use a CRM contact older than 14 or 30 days",
              "Reviewer sees contact source, last sync time, intended recipient, and message diff",
              "Stale records route to RevOps or the account owner before send",
              "Approved exceptions are attached to the action receipt; production deployments require cryptographic signing",
              "CRM stage updates and calendar holds can have separate lower-risk policies",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/retail-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Retail Copilot discount governance
            </Link>{" "}
            ·{" "}
            <Link href="/ai-governance-for-mid-size-companies" className="text-indigo-300 hover:text-indigo-200">
              AI governance for mid-size companies
            </Link>
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
