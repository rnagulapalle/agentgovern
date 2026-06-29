import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/construction-ai-governance";

const FAQ = [
  {
    q: "Can Copilot email subcontractors about schedule changes without a PM approving?",
    a: "Not if you set that policy. Most general contractors require project manager or superintendent approval before AI sends external messages that commit to dates, costs, or scope.",
  },
  {
    q: "Does this apply to Procore or field apps connected to Copilot?",
    a: "Yes. Governance applies when AI tries to update project records, RFIs, change orders, or send comms through any connected system — not just Microsoft 365 email.",
  },
  {
    q: "We're a 400-person GC with no AI specialists. Is this realistic?",
    a: "Yes. Focus on change orders, subcontractor commitments, and owner-facing updates — three areas where AI speed outruns your existing approval habits.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Construction AI Governance — Change Orders, Copilot & Subcontractors",
  description:
    "AI governance for general contractors and construction firms (50–1,000 employees): govern Copilot and AI on change orders, subcontractor email, and project system updates.",
  path: PATH,
  keywords: [
    "construction AI governance",
    "Copilot construction project governance",
    "change order AI approval",
    "subcontractor email AI control",
    "construction AI audit trail",
  ],
});

export default function ConstructionAiGovernancePage() {
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
              headline: "Construction AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Construction · GCs & specialty contractors"
        title="Copilot drafted the change order email. The owner never approved the cost."
        description="Regional contractors enabled Copilot and ChatGPT for project admin, RFIs, and subcontractor coordination. AI can commit to dates, dollars, and scope in email — the same channels that become evidence in disputes and lien situations."
        stats={[
          { value: "CO", label: "change order approval" },
          { value: "Sub", label: "contractor comms" },
          { value: "Job", label: "site audit trail" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The scenario your project executive knows">
          <p>
            A project engineer asks Copilot to &ldquo;email the electrical sub that
            we need the panel upgrade by Friday and confirm the $18k change.&rdquo;
            Copilot writes a clear, authoritative message. It sends before the PM
            reviews margin, owner approval, or whether the RFI was actually closed.
          </p>
          <p>
            On site, that email reads like a directive. In litigation, it reads like
            an admission. There was no approval step — only speed.
          </p>
        </SeoSection>

        <SeoSection title="Why toolbox talks don't fix it">
          <SeoList
            items={[
              "Field teams adopt AI because it saves hours on RFIs and daily logs",
              "Email remains the system of record for many subs — faster than your PM software",
              "Owner and sub threads mix cost, schedule, and safety detail in one draft",
              "Project folders in SharePoint are often broader than job-specific need-to-know",
            ]}
          />
        </SeoSection>

        <SeoSection title="Controls a mid-size GC can run this year">
          <SeoCards
            items={[
              {
                title: "Change order and cost language → PM approval",
                body: "Any outbound message citing dollar amounts, scope changes, or owner billing requires named approver before send.",
                tone: "ok",
              },
              {
                title: "Subcontractor schedule commitments",
                body: "AI-drafted dates that bind trade partners route to superintendent or PM — especially near critical path.",
                tone: "ok",
              },
              {
                title: "Project system writes logged",
                body: "Updates to Procore, Autodesk, or ERP job cost from AI-assisted flows require audit entries.",
              },
              {
                title: "Owner-facing communication approval",
                body: "Messages to owner reps or architect on record → PM or project executive review.",
                tone: "warn",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="What risk and legal want in a dispute">
          <SeoList
            items={[
              "Who authorized the commitment AI communicated",
              "Which project record the message was based on",
              "Whether cost or schedule was within delegated authority",
              "Separate log of approval vs. what was actually sent",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/manufacturing-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Manufacturing AI governance
            </Link>{" "}
            ·{" "}
            <Link href="/real-estate-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Real estate AI governance
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
