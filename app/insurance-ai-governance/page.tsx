import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/insurance-ai-governance";

const FAQ = [
  {
    q: "Can Agentforce auto-resolve claims without human review?",
    a: "Only if your policies allow it — and only within limits you set. Most carriers require human approval for payments above threshold, coverage decisions, or any communication to policyholders about denials.",
  },
  {
    q: "How do state regulators view AI in claims handling?",
    a: "Expectations vary by state, but examiners consistently ask for documentation: what data AI used, who approved outbound communication, and how you prevent unauthorized access to policyholder PII.",
  },
  {
    q: "We're a 350-person regional carrier. Do we need a chief AI officer?",
    a: "No. You need clear approval workflows and audit trails your compliance team can run — the same skills they use for SOX and privacy programs, applied to Copilot and Agentforce actions.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Insurance AI Governance — Claims, Copilot & Policyholder Data",
  description:
    "AI governance for regional insurers and agencies (50–1,000 employees): govern Copilot, Agentforce, and AI on claims data, policyholder communications, and compliance audit trails.",
  path: PATH,
  keywords: [
    "insurance AI governance",
    "claims AI approval workflow",
    "Agentforce governance insurance",
    "policyholder data AI access",
    "insurance AI compliance",
  ],
});

export default function InsuranceAiGovernancePage() {
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
              headline: "Insurance AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Insurance · carriers & large agencies"
        title="Agentforce closed the claim. Compliance asked who authorized the payment."
        description="Regional insurers and large agencies deploy Salesforce Agentforce, Copilot for adjusters, and ChatGPT for policy research. Regulators and reinsurers want evidence — not anecdotes — that AI didn't pay, deny, or email policyholders outside policy."
        stats={[
          { value: "Claims", label: "approval limits" },
          { value: "PII", label: "access control" },
          { value: "State", label: "exam-ready logs" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="Where AI creates insurance risk">
          <p>
            It is not the chatbot on your marketing site. It is the adjuster workflow
            where AI summarizes medical bills, suggests a payment, drafts a denial letter,
            or updates reserves in the policy admin system — faster than your controls
            were designed for.
          </p>
        </SeoSection>

        <SeoSection title="Scenarios your compliance team already simulates">
          <SeoCards
            items={[
              {
                title: "Payment above authority",
                body: "AI recommends a $12,000 settlement; adjuster's delegated limit is $5,000. Without governance, it posts anyway.",
                tone: "warn",
              },
              {
                title: "Wrong policyholder channel",
                body: "Denial or PHI-rich update sent to an email on file that hasn't been verified in months.",
                tone: "warn",
              },
              {
                title: "Cross-policy data leak",
                body: "Copilot answers using another insured's file because CRM permissions were inherited from a shared queue.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Governance insurance compliance teams can own">
          <SeoList
            items={[
              "Payments and reserve changes above limit → human approval with reason code",
              "Any policyholder-facing email about coverage or payment → approval + template check",
              "Access to claim files limited by line of business and role — not queue membership alone",
              "Full audit trail exportable for state market conduct exams",
            ]}
          />
          <p>
            AgentGovernance sits between Agentforce, Copilot, and your policy admin —
            so your compliance officers enforce rules without disabling the tools adjusters
            rely on.
          </p>
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/healthcare-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Healthcare AI governance
            </Link>{" "}
            ·{" "}
            <Link href="/accounting-firm-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Accounting firm AI governance
            </Link>
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
