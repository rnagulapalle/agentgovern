import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/manufacturing-ai-governance";

const FAQ = [
  {
    q: "Our plant floor doesn't use Copilot — why does HQ need AI governance?",
    a: "Copilot in procurement, quality, and sales still reaches suppliers, ERP records, and customer commitments. One wrong vendor email or unauthorized BOM change affects production — governance starts where AI touches business systems, not just the factory line.",
  },
  {
    q: "Can AI change ERP records without approval?",
    a: "Not if you set write policies. Read-only access for drafting and analysis; any create or update in ERP, quality, or supplier systems requires approval and logs the change.",
  },
  {
    q: "We have 600 employees and one IT manager. Can we manage this?",
    a: "Yes. Focus on external communications and financial thresholds first — supplier emails, PO changes above limit, quality hold releases — rather than trying to govern every chat prompt.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Manufacturing AI Governance — Copilot, Suppliers & ERP Controls",
  description:
    "AI governance for manufacturers (50–1,000 employees): control Copilot and AI assistants accessing ERP, supplier communications, and quality records — without an AI platform team.",
  path: PATH,
  keywords: [
    "manufacturing AI governance",
    "Copilot ERP governance",
    "supplier email AI approval",
    "manufacturing AI audit trail",
    "industrial AI compliance",
  ],
});

export default function ManufacturingAiGovernancePage() {
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
              headline: "Manufacturing AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Manufacturing · discrete & process"
        title="Copilot drafted the supplier email. Nobody verified the lead time — or the price."
        description="Manufacturers from 200 to 2,000 employees use Copilot and ChatGPT in procurement, quality, and customer service. AI can email suppliers, update CRM commitments, and pull specs from shared drives. Your ISO audit and customer contracts assume a human approved those commitments."
        stats={[
          { value: "Supplier", label: "comms approval" },
          { value: "ERP", label: "write controls" },
          { value: "Quality", label: "audit trail" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="Where manufacturing AI risk actually shows up">
          <p>
            It is rarely the chatbot on the shop floor. It is the buyer who asks Copilot
            to &ldquo;confirm the revised shipment date with Acme Steel,&rdquo; the quality
            engineer who has AI summarize a nonconformance report and email the customer,
            or the sales ops rep who updates forecast fields from an AI-generated pipeline
            summary.
          </p>
          <p>
            Each action binds the company — commercially and sometimes contractually —
            without a purchase order workflow or quality sign-off in the loop.
          </p>
        </SeoSection>

        <SeoSection title="Failure modes plant leadership recognizes">
          <SeoCards
            items={[
              {
                title: "Wrong supplier contact",
                body: "AI pulls an old contact from CRM and commits to terms with someone who left the vendor two years ago.",
                tone: "warn",
              },
              {
                title: "Unauthorized schedule promise",
                body: "Customer-facing email cites a ship date the production plan cannot support — drafted from stale ERP data.",
                tone: "warn",
              },
              {
                title: "Spec or BOM exposure",
                body: "AI attaches the wrong drawing revision because folder permissions were broader than policy intended.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Policies a mid-size manufacturer can enforce">
          <SeoList
            items={[
              "Any AI-sent email to an external supplier or customer → manager approval",
              "ERP or quality system writes → approval + audit entry, not silent updates",
              "Actions on records not synced within 24 hours → held for review",
              "Financial commitments above delegated authority → blocked until CFO delegate approves",
            ]}
          />
          <p>
            These are business rules your ops team already understands. AgentGovernance
            enforces them when Copilot or ChatGPT tries to act — not when someone
            remembers the policy.
          </p>
        </SeoSection>

        <SeoSection title="ISO and customer audit questions">
          <p>
            Auditors increasingly ask how AI-assisted decisions are controlled. You need
            a log that shows: what AI attempted, which policy applied, who approved
            external communication, and whether production records were current. Prompt
            policies in a handbook do not satisfy that.
          </p>
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/retail-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Retail Copilot governance
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
