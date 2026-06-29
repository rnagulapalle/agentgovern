import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/real-estate-ai-governance";

const FAQ = [
  {
    q: "Can Copilot email buyers about offer terms without a broker approving?",
    a: "Not if your brokerage policy requires it. Most firms require agent or broker approval before AI sends client-facing messages about price, terms, counteroffers, or confidential seller motivation.",
  },
  {
    q: "Does this cover MLS data and showing feedback?",
    a: "Governance applies when AI tries to export, email, or post listing or client data outside approved channels — including drafts that combine MLS fields with private notes.",
  },
  {
    q: "We're a 120-agent regional brokerage. Do we need new headcount?",
    a: "No. Assign approval rules by role: agents draft with AI; brokers or team leads approve external sends involving offers, commissions, or seller/buyer PII.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Real Estate AI Governance — Copilot, Offers & Client Confidentiality",
  description:
    "AI governance for real estate brokerages and property firms (50–1,000 staff): control Copilot and AI on offers, MLS data, and client communications with approval workflows.",
  path: PATH,
  keywords: [
    "real estate AI governance",
    "brokerage Copilot governance",
    "MLS AI access control",
    "real estate offer AI approval",
    "realtor AI audit trail",
  ],
});

export default function RealEstateAiGovernancePage() {
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
              headline: "Real Estate AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Real estate · brokerages & property managers"
        title="Copilot drafted the counteroffer email. The seller's bottom line was in the cc line."
        description="Regional brokerages and property managers rolled out Copilot and ChatGPT for listing copy, client updates, and transaction coordination. Offers, MLS data, and seller motivation are regulated and confidential — AI moves faster than your compliance training."
        stats={[
          { value: "Offer", label: "terms approval" },
          { value: "MLS", label: "data boundaries" },
          { value: "Client", label: "confidentiality log" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The incident managing brokers fear">
          <p>
            An agent asks ChatGPT Enterprise to &ldquo;draft a counteroffer update
            for the buyers and loop in the co-listing agent.&rdquo; The model pulls
            language from internal notes — including the seller&apos;s willingness
            to accept less and a prior inspection concern. The draft cc line
            includes a party who should not see seller motivation. One send away
            from a fair housing or confidentiality complaint.
          </p>
        </SeoSection>

        <SeoSection title="Why state CE on AI isn't enough">
          <p>
            Many states now expect brokerages to train agents on AI use. Training
            covers competence — not enforcement at the moment of send. Brokerages
            still need firm-wide controls when dozens of agents use Copilot daily on
            CRM, email, and transaction platforms.
          </p>
          <SeoList
            items={[
              "MLS rules on advertising and data display",
              "Client agency agreements and confidential information duties",
              "Fair housing sensitivity in generated listing and outreach language",
              "Property management tenant data in mixed commercial/residential shops",
            ]}
          />
        </SeoSection>

        <SeoSection title="Controls a 200-agent brokerage can adopt">
          <SeoCards
            items={[
              {
                title: "Offer and counteroffer email → broker approval",
                body: "Any message discussing price, concessions, deadlines, or seller motivation routes to designated broker before send.",
                tone: "ok",
              },
              {
                title: "MLS + private notes separation",
                body: "Block AI from merging internal strategy notes into client- or co-broker-facing drafts without review.",
                tone: "warn",
              },
              {
                title: "Commission and referral communications",
                body: "Messages about fees or referral agreements require compliance or managing broker approval.",
              },
              {
                title: "Audit trail for DRE or board inquiries",
                body: "Log what AI accessed, who approved outbound communication, and what was sent.",
                tone: "ok",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Property management note">
          <p>
            Firms that combine brokerage with property management face tenant PII
            and lease terms in the same Microsoft tenant. Apply the same pattern:
            tenant-facing or owner financial communication requires approval; bulk
            export of rent rolls or applications is blocked and logged.
          </p>
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/legal-firm-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Legal firm AI governance
            </Link>{" "}
            ·{" "}
            <Link href="/insurance-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Insurance AI governance
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
