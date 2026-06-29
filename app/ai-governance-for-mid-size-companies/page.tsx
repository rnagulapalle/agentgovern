import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/ai-governance-for-mid-size-companies";

const FAQ = [
  {
    q: "Do we need an AI platform team to govern Copilot?",
    a: "No. Most mid-size organizations need clear policies, approval thresholds for risky actions, and an audit trail — not a team building custom models. AgentGovernance is designed for companies where IT and compliance share the workload.",
  },
  {
    q: "We already have Microsoft Purview. Isn't that enough?",
    a: "Purview helps with data classification, DLP, and eDiscovery inside Microsoft 365. It does not govern actions AI takes in Salesforce, your ERP, payment systems, or vendor email workflows. You still need a control layer when AI moves beyond chat and into business systems.",
  },
  {
    q: "What's the difference between blocking AI and governing AI?",
    a: "Blocking slows adoption. Governing means employees keep using Copilot and ChatGPT, but high-risk actions — large discounts, record changes, external emails with financial terms — pause for approval and get logged.",
  },
  {
    q: "How long does rollout take for a 200-person company?",
    a: "Start with one department and three policies: who can trigger external emails, what dollar threshold needs approval, and which systems AI may read vs. write. Most teams can pilot in weeks, not quarters — without hiring AI specialists.",
  },
];

export const metadata = buildSeoMetadata({
  title: "AI Governance for Mid-Size Companies (50–1,000 Employees)",
  description:
    "How to let employees use Copilot and ChatGPT Enterprise safely when you have a small IT team and no AI platform group — approvals, access control, and audit trails explained.",
  path: PATH,
  keywords: [
    "AI governance mid size company",
    "Copilot governance 500 employees",
    "ChatGPT Enterprise compliance SMB",
    "AI controls without AI team",
    "enterprise AI governance small business",
  ],
  socialTitle: "AI governance when you don't have an AI platform team",
  socialDescription:
    "50–1,000 employee companies are rolling out Copilot and ChatGPT. Here's how to add approvals and audit trails without becoming AI experts.",
});

export default function MidSizeAiGovernancePage() {
  const jsonLd = [faqJsonLd(FAQ), articleJsonLd({
    headline: "AI Governance for Mid-Size Companies",
    description: metadata.description as string,
    path: PATH,
  })];

  return (
    <>
      {jsonLd.map((schema, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
        />
      ))}
      <SeoPageShell
        eyebrow="Mid-size companies · 50–1,000 employees"
        title="You rolled out Copilot. Now leadership wants to know what AI is doing."
        description="This is the moment most 200-person manufacturers, regional insurers, and professional services firms hit: employees love Microsoft Copilot or ChatGPT Enterprise, but nobody can answer whether AI can send email, change a customer record, or read confidential files without approval. You don't need an AI platform team — you need a control layer."
        stats={[
          { value: "50–1k", label: "employee sweet spot" },
          { value: "No AI lab", label: "required" },
          { value: "Audit-ready", label: "by design" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="Your ideal rollout — and where it breaks">
          <p>
            You bought Copilot licenses for sales, finance, and operations. Maybe ChatGPT
            Enterprise for research-heavy teams. Gemini for Google Workspace shops.
            Salesforce Agentforce for service reps. Training was a half-day webinar. Usage
            spiked. Then legal asked one question:
          </p>
          <p className="rounded-lg border border-white/[0.08] bg-white/[0.02] px-4 py-3 text-[15px] italic text-white/70">
            &ldquo;Can it email a client or change our CRM without someone approving
            it?&rdquo;
          </p>
          <p>
            If the honest answer is &ldquo;we're not sure,&rdquo; you are not alone.
            Microsoft&apos;s own guidance for smaller tenants focuses on permissions
            cleanup and Purview labels — important, but incomplete once AI starts{" "}
            <em>acting</em> across email, CRM, ERP, and payment tools.
          </p>
        </SeoSection>

        <SeoSection title="The five questions your board will ask">
          <SeoList
            items={[
              "How do we know what AI is doing?",
              "Can AI send emails without approval?",
              "Can AI change customer or employee records?",
              "Can AI access confidential documents outside someone's role?",
              "How do we prove compliance if a regulator or client asks?",
            ]}
          />
          <p>
            Prompt guidelines and lunch-and-learns do not answer these. You need enforced
            business policies — the same way expense reports need a manager sign-off, not
            an honor system.
          </p>
        </SeoSection>

        <SeoSection title="What a small IT / security team actually needs">
          <SeoCards
            items={[
              {
                title: "Visibility before action",
                body: "See what AI is trying to do — send email, update a record, export a file — before it happens in production systems.",
                tone: "ok",
              },
              {
                title: "Approval thresholds in plain English",
                body: "Discounts above 10%, refunds above $500, any external contract email — route to a named approver. No one has to write code.",
                tone: "ok",
              },
              {
                title: "Access that matches job role",
                body: "AI should not reach HR files, client matter folders, or claims systems just because one employee has broad SharePoint access.",
              },
              {
                title: "Audit trail leadership can share",
                body: "What was requested, which policy applied, who approved, what happened — exportable for compliance review.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Why Microsoft controls alone aren't the full answer">
          <p>
            Copilot respects the compliance features of your Microsoft 365 plan — Business
            Premium sensitivity labels, eDiscovery for prompts, DLP on generated content.
            That matters for data <em>inside</em> Microsoft 365.
          </p>
          <p>
            It does not govern Agentforce updating Salesforce, a Copilot Studio agent
            triggering a payment, or ChatGPT Enterprise plugins reaching your ticketing
            system. Mid-size companies live in a patchwork of SaaS tools. Governance has
            to sit between <strong className="text-white/80">AI assistants</strong> and{" "}
            <strong className="text-white/80">those systems</strong> — not inside one
            vendor console.
          </p>
        </SeoSection>

        <SeoSection title="A practical 30-day path (no AI experts required)">
          <SeoList
            items={[
              "Week 1: List the three actions that would hurt most if AI got them wrong — wrong client email, unauthorized refund, PHI export.",
              "Week 2: Assign approvers by department. Finance lead for money. Ops manager for vendor comms. HR director for employee data.",
              "Week 3: Turn those into policies — thresholds, allowed systems, mandatory approval for external parties.",
              "Week 4: Pilot with one team using Copilot or ChatGPT. Review the audit log weekly. Adjust thresholds.",
            ]}
          />
          <p>
            AgentGovernance is built for this cadence: intercept, enforce, audit — without
            asking your IT generalist to become an ML engineer.
          </p>
        </SeoSection>

        <SeoSection title="Industry-specific guides">
          <p>
            The rollout pattern is the same; the scary scenarios differ by vertical.
            Start with your industry:
          </p>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/55">
            <li>
              <Link href="/healthcare-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Healthcare — PHI access and patient communications
              </Link>
            </li>
            <li>
              <Link href="/legal-firm-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Legal — client matter confidentiality
              </Link>
            </li>
            <li>
              <Link href="/manufacturing-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Manufacturing — supplier and quality records
              </Link>
            </li>
            <li>
              <Link href="/accounting-firm-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Accounting — invoice and client data controls
              </Link>
            </li>
            <li>
              <Link href="/insurance-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Insurance — claims and policyholder data
              </Link>
            </li>
            <li>
              <Link href="/retail-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Retail — discounts and customer outreach
              </Link>
            </li>
            <li>
              <Link href="/education-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Education — student records and FERPA
              </Link>
            </li>
            <li>
              <Link href="/logistics-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Logistics — delivery commitments and TMS updates
              </Link>
            </li>
            <li>
              <Link href="/construction-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Construction — change orders and subcontractor comms
              </Link>
            </li>
            <li>
              <Link href="/real-estate-ai-governance" className="text-indigo-300 hover:text-indigo-200">
                Real estate — offers and client confidentiality
              </Link>
            </li>
          </ul>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
