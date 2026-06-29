import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/healthcare-copilot-ai-governance";

const FAQ = [
  {
    q: "Does Copilot Business meet HIPAA requirements on its own?",
    a: "Microsoft offers HIPAA-aligned configurations for enterprise tiers, but deployment still requires access controls, audit logging, and policies for what AI may do with PHI. Copilot surfaces what users can already access — governance must limit what AI can act on, not just read.",
  },
  {
    q: "Can we block AI from exporting patient lists?",
    a: "Yes. Set access boundaries so AI cannot read or export patient directories, billing files, or clinical notes outside minimum necessary roles — and log every attempt for compliance review.",
  },
  {
    q: "We're a 400-bed regional system with no AI team. Is this realistic?",
    a: "Yes. Start with three policies: no AI-sent patient communications without approval, no exports of PHI to external channels, and hold actions on records not verified within your freshness window.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Healthcare AI Governance for Copilot & ChatGPT Rollouts",
  description:
    "How regional hospitals and healthcare groups (50–1,000 employees) govern Copilot and AI assistants — PHI access, patient communications, and HIPAA-ready audit trails without an AI platform team.",
  path: PATH,
  keywords: [
    "healthcare Copilot governance",
    "HIPAA AI governance",
    "PHI AI access control",
    "hospital AI audit trail",
    "healthcare AI compliance",
  ],
});

export default function HealthcareCopilotGovernancePage() {
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
              headline: "Healthcare AI Governance for Copilot Rollouts",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Healthcare · 50–1,000 employees"
        title="Copilot can summarize a discharge note. It shouldn't email a patient without approval."
        description="Regional hospitals, clinic groups, and healthcare administrators are rolling out Microsoft Copilot and ChatGPT Enterprise for scheduling, prior auth drafts, and operational email. HIPAA still requires knowing what AI accessed, what it tried to send, and who approved it — with a team that is not building custom AI."
        stats={[
          { value: "PHI", label: "access controlled" },
          { value: "Human", label: "approval on sends" },
          { value: "HIPAA", label: "audit-ready logs" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The scenario compliance officers worry about">
          <p>
            A patient access coordinator asks Copilot to &ldquo;follow up with patients
            who missed appointments this week.&rdquo; Copilot drafts emails using names,
            dates, and reasons pulled from scheduling data. One draft includes clinical
            detail that should not go to a personal inbox. Another goes to a stale address
            because the EHR sync lagged overnight.
          </p>
          <p>
            There was no approval step. No record of which patient data Copilot read. No
            easy answer when privacy asks: &ldquo;Prove this was minimum necessary.&rdquo;
          </p>
        </SeoSection>

        <SeoSection title="What Purview covers — and what it doesn't">
          <p>
            Microsoft Purview and Business Premium sensitivity labels help classify
            content inside Microsoft 365 and support eDiscovery on Copilot interactions.
            That is necessary — not sufficient.
          </p>
          <SeoList
            items={[
              "Prior auth submissions in your payer portal — outside M365",
              "Patient callbacks logged in your phone system CRM",
              "ChatGPT Enterprise plugins reaching ticketing or billing APIs",
              "Agentforce updating patient outreach lists in Salesforce Health Cloud",
            ]}
          />
          <p>
            Governance must follow <em>actions</em>, not just documents in SharePoint.
          </p>
        </SeoSection>

        <SeoSection title="Three policies a 300-person health group can enforce today">
          <SeoCards
            items={[
              {
                title: "No AI-sent patient communication without approval",
                body: "Drafts are fine. Sending — especially external email or SMS — stops for a human who confirms content and recipient.",
                tone: "ok",
              },
              {
                title: "PHI export blocked by default",
                body: "Bulk lists, chart exports, and copy-to-clipboard flows that leave your controlled environment require explicit policy and logging.",
                tone: "warn",
              },
              {
                title: "Hold actions on stale records",
                body: "If patient or appointment data hasn't synced within your window, AI cannot act on it — held for review instead of silently using old data.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="What your audit trail needs to show">
          <SeoList
            items={[
              "Which user and AI session initiated the action",
              "Which patient or record identifiers were involved",
              "Whether the action was allowed, blocked, or sent for approval",
              "Who approved patient-facing communication before it went out",
              "Timestamp chain from draft to final send",
            ]}
          />
          <p>
            That is the difference between &ldquo;we use AI carefully&rdquo; and evidence
            you can hand an auditor. See how approval and audit work in the{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              interactive demo
            </Link>
            .
          </p>
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/ai-governance-for-mid-size-companies" className="text-indigo-300 hover:text-indigo-200">
              AI governance for mid-size companies
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
