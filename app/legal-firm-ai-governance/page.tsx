import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/legal-firm-ai-governance";

const FAQ = [
  {
    q: "Can Copilot read client matter files my paralegal shouldn't see?",
    a: "Copilot can surface anything in Microsoft 365 that user already has access to. If permissions are loose, AI inherits that looseness. Governance adds a second check: what AI is allowed to act on, regardless of overshared folders.",
  },
  {
    q: "How do we prevent AI from emailing opposing counsel?",
    a: "Require human approval for any external email where the recipient domain is not on an approved list — especially when AI drafted the message from matter files.",
  },
  {
    q: "Will this slow down associates using ChatGPT Enterprise for research?",
    a: "No. Reading and drafting inside approved boundaries stays fast. Governance intercepts the moment AI tries to send, file, or export — the actions that create malpractice and confidentiality risk.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Legal Firm AI Governance — Client Confidentiality & Copilot Controls",
  description:
    "AI governance for law firms (50–500 attorneys and staff): govern Copilot and ChatGPT access to client matters, external emails, and document exports without building an AI team.",
  path: PATH,
  keywords: [
    "law firm AI governance",
    "legal Copilot confidentiality",
    "client matter AI access",
    "law firm AI audit trail",
    "attorney client privilege AI",
  ],
});

export default function LegalFirmAiGovernancePage() {
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
              headline: "Legal Firm AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Legal · regional & mid-size firms"
        title="Your associates use Copilot on client matters. Your ethics committee needs proof it's controlled."
        description="Mid-size law firms rolled out Microsoft Copilot and ChatGPT Enterprise to speed research, drafting, and client updates. Confidentiality rules didn't change — but the speed at which AI can read, summarize, and send did. You need governance that partners understand without a technology subcommittee."
        stats={[
          { value: "Matter", label: "access boundaries" },
          { value: "External", label: "email approval" },
          { value: "Privilege", label: "audit trail" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The incident partners fear">
          <p>
            An associate asks ChatGPT Enterprise to &ldquo;draft a status update to the
            client and opposing counsel.&rdquo; The model pulls language from internal
            strategy notes. The draft cc's the wrong party. It ships before a partner
            reviews tone, privilege, or settlement posture.
          </p>
          <p>
            Training slides said &ldquo;always review AI output.&rdquo; There was no
            enforced stop between draft and send — and no log that shows who approved
            what left the firm.
          </p>
        </SeoSection>

        <SeoSection title="Why permission cleanup isn't enough">
          <p>
            Ethics opinions focus on competence and confidentiality: know what you feed
            the model, verify output, avoid waiving privilege. That is lawyer
            responsibility — but firms also need{" "}
            <strong className="text-white/80">firm-wide controls</strong> when dozens of
            staff use AI daily.
          </p>
          <SeoList
            items={[
              "Matter walls in your DMS don't always match SharePoint sharing",
              "Copilot doesn't know which paragraph is work product vs. client record",
              "External sends are where malpractice carriers see claims — not summarization",
            ]}
          />
        </SeoSection>

        <SeoSection title="Controls a 120-person firm can run without an AI practice group">
          <SeoCards
            items={[
              {
                title: "Client matter access boundaries",
                body: "AI may read only matters tied to the user's active cases — not firm-wide search across all clients.",
              },
              {
                title: "Mandatory approval for external email",
                body: "Any message to domains outside the firm or client approved list routes to responsible attorney before send.",
                tone: "ok",
              },
              {
                title: "Block bulk document export",
                body: "Prevent AI-assisted zip downloads or mass copy of discovery folders to personal drives.",
                tone: "warn",
              },
              {
                title: "Audit trail for privilege review",
                body: "Log draft → approval → send so risk management can reconstruct decisions.",
                tone: "ok",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Questions your managing partner should get clear answers to">
          <SeoList
            items={[
              "Can AI email anyone outside the firm without a lawyer approving?",
              "Can AI access matters the user isn't staffed on?",
              "If a client asks what AI touched their files, can we produce a log?",
              "Does governance apply to Copilot and ChatGPT the same way?",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/accounting-firm-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Accounting firm AI governance
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
