import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/accounting-firm-ai-governance";

const FAQ = [
  {
    q: "Can Copilot access one client's files while working on another?",
    a: "If SharePoint permissions overlap, yes — Copilot follows user access. Governance adds client engagement boundaries so AI cannot act on files outside the active engagement, even when folders are overshared.",
  },
  {
    q: "How do we govern AI-assisted invoice approvals?",
    a: "Set dollar thresholds: AI may draft AP review summaries, but approving or posting invoices above your limit requires a named human approver and an audit entry.",
  },
  {
    q: "Does this apply to outsourced bookkeeping teams using ChatGPT?",
    a: "Yes. Governance attaches to actions on your systems — who tried to change a ledger entry, export a trial balance, or email a client tax document — regardless of which AI tool they used.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Accounting Firm AI Governance — Client Data, Invoices & Copilot",
  description:
    "AI governance for CPA and accounting firms (50–500 staff): control Copilot and ChatGPT access to client data, invoice approvals, and external communications.",
  path: PATH,
  keywords: [
    "accounting firm AI governance",
    "CPA Copilot security",
    "client data AI access",
    "invoice approval AI workflow",
    "accounting AI audit trail",
  ],
});

export default function AccountingFirmAiGovernancePage() {
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
              headline: "Accounting Firm AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Accounting · CPA & advisory firms"
        title="Copilot summarized the trial balance. Then it almost emailed it to the wrong client."
        description="Regional accounting firms enabled Microsoft Copilot and ChatGPT Enterprise for research, workpaper drafts, and client updates. SOC 2 and professional standards still require segregation of client data, controlled approvals on filings, and evidence that AI didn't cross engagement walls."
        stats={[
          { value: "Client", label: "engagement walls" },
          { value: "Invoice", label: "approval limits" },
          { value: "SOC 2", label: "audit evidence" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The scenario your risk partner cares about">
          <p>
            A senior accountant asks Copilot to &ldquo;draft a quarterly update email
            with revenue highlights for Client A.&rdquo; The model pulls numbers from a
            shared folder that also contains Client B&apos;s forecast. The draft cc line
            autocompletes incorrectly. One click from send — and you have a confidentiality
            incident, not a productivity win.
          </p>
        </SeoSection>

        <SeoSection title="Why firm policy PDFs don't scale">
          <p>
            Every firm updated its AI acceptable use policy in 2025. Associates still
            move fast during close week. The gap is enforcement at the moment of{" "}
            <em>action</em> — send, export, post, approve — not another training video.
          </p>
          <SeoList
            items={[
              "Tax workpapers with SSNs and EINs in Excel Online",
              "Client portal uploads triggered from AI-generated checklists",
              "AP bots approving vendor payments from ticket summaries",
              "ChatGPT Enterprise browsing client-specific plugins",
            ]}
          />
        </SeoSection>

        <SeoSection title="Controls firms with 80–400 staff actually adopt">
          <SeoCards
            items={[
              {
                title: "Engagement-scoped access",
                body: "AI reads and acts only within the client engagement the user is assigned to this week — not firm-wide search.",
                tone: "ok",
              },
              {
                title: "External client email approval",
                body: "Particularly for attachments containing financial statements, tax docs, or payroll summaries.",
                tone: "ok",
              },
              {
                title: "Invoice and payment thresholds",
                body: "AI cannot approve or post AP/AR actions above partner-delegated limits.",
              },
              {
                title: "Export and download logging",
                body: "Every attempt to bulk-export workpapers is logged with user, client, and outcome.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="What to tell peer review and SOC auditors">
          <SeoList
            items={[
              "We log AI action attempts — not just chat history",
              "Client-facing sends require human approval",
              "Segregation of duties applies to AI-initiated approvals",
              "We can produce a trail for a specific client and date range",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/legal-firm-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Legal firm AI governance
            </Link>{" "}
            ·{" "}
            <Link href="/insurance-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Insurance AI governance
            </Link>
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
