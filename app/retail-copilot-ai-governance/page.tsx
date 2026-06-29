import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/retail-copilot-ai-governance";

const FAQ = [
  {
    q: "Can Copilot email customers promotional offers automatically?",
    a: "Only within policies you define. Most retailers require manager approval when discounts exceed store policy, when messaging goes to loyalty segments above a size threshold, or when content mentions pricing.",
  },
  {
    q: "How is this different from our marketing automation rules?",
    a: "Marketing automation runs predefined campaigns. Copilot generates one-off messages from chat — often bypassing your promo calendar. Governance catches ad-hoc AI sends before they reach customers.",
  },
  {
    q: "We have 40 stores and 300 corporate staff. Where do we start?",
    a: "Start at corporate: e-commerce, loyalty, and B2B account teams using Copilot on CRM and email. Set discount approval thresholds and external-send rules first — that's where brand and margin risk concentrates.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Retail Copilot AI Governance — Discounts, CRM & Customer Email",
  description:
    "AI governance for regional retailers (50–1,000 employees): control Copilot and AI on customer emails, discount offers, and CRM updates — with approval workflows and audit trails.",
  path: PATH,
  keywords: [
    "retail Copilot governance",
    "AI discount approval retail",
    "retail CRM AI governance",
    "customer email AI approval",
    "retail AI compliance",
  ],
});

export default function RetailCopilotGovernancePage() {
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
              headline: "Retail Copilot AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Retail · regional & multi-location"
        title="The account rep asked Copilot for a 25% discount email. Policy allows ten."
        description="Regional retailers rolled out Copilot and ChatGPT for merchandising, account management, and loyalty teams. AI can draft customer emails, update CRM fields, and promise promotions — faster than your promo calendar and margin guardrails were built to handle."
        stats={[
          { value: "10%", label: "discount example cap" },
          { value: "Manager", label: "approval route" },
          { value: "CRM", label: "change logging" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode store ops knows">
          <p>
            A key account manager tells Copilot: &ldquo;Follow up with John at Acme Corp —
            offer 25% off next quarter&apos;s order.&rdquo; Copilot drafts a polished
            email, updates the opportunity in Salesforce, and is one click from send.
            Your written policy caps discretionary discounts at 10% without director
            approval. CRM still shows stale contact data from a trade show lead imported
            months ago.
          </p>
          <p>
            This is not hypothetical — it is the exact workflow our{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              live demo
            </Link>{" "}
            models: discount above authority, held for approval, full audit entry.
          </p>
        </SeoSection>

        <SeoSection title="Why marketing compliance decks don't stop it">
          <SeoList
            items={[
              "Copilot creates one-off messages outside your ESP templates",
              "Associates treat chat output as 'already checked' because it sounds professional",
              "CRM updates from AI don't trigger the same workflows as manual edits",
              "Promo violations show up in margin post-mortems, not before send",
            ]}
          />
        </SeoSection>

        <SeoSection title="Retail policies you can enforce this quarter">
          <SeoCards
            items={[
              {
                title: "Discount authority thresholds",
                body: "Above store or rep limit → route to district manager or pricing team before email or CRM commit.",
                tone: "ok",
              },
              {
                title: "External customer email approval",
                body: "Especially when message includes pricing, contract terms, or loyalty incentives.",
                tone: "ok",
              },
              {
                title: "Stale account data hold",
                body: "If CRM contact hasn't verified in 30 days, AI cannot send — held for data steward review.",
              },
              {
                title: "Audit trail for brand and legal",
                body: "Who requested the offer, who approved, what went to the customer.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/manufacturing-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Manufacturing AI governance
            </Link>{" "}
            ·{" "}
            <Link href="/ai-governance-for-mid-size-companies" className="text-indigo-300 hover:text-indigo-200">
              Mid-size company overview
            </Link>
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
