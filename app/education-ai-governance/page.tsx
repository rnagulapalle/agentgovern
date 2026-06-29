import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/education-ai-governance";

const FAQ = [
  {
    q: "Does Copilot in Microsoft 365 Education meet FERPA requirements alone?",
    a: "Microsoft provides education-tier agreements and controls, but FERPA compliance depends on how you configure access, what AI can export, and whether you log actions on student records. Governance fills the gap when AI acts beyond chat.",
  },
  {
    q: "Can teachers use ChatGPT on student data?",
    a: "District policy may allow drafting with de-identified data. Governance enforces what systems AI can read and whether exports or emails containing student PII require administrator approval.",
  },
  {
    q: "We're a 2,000-student district with three IT staff. Is this feasible?",
    a: "Yes. Prioritize student record access, parent communication approval, and blocking bulk roster exports — three policies that cover most FERPA incidents tied to AI assistants.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Education AI Governance — FERPA, Copilot & Student Records",
  description:
    "AI governance for school districts and education organizations (50–1,000 staff): govern Copilot and AI on student records, parent communications, and FERPA compliance.",
  path: PATH,
  keywords: [
    "education AI governance",
    "FERPA Copilot governance",
    "student data AI access",
    "school district AI compliance",
    "K-12 AI audit trail",
  ],
});

export default function EducationAiGovernancePage() {
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
              headline: "Education AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Education · districts & institutions"
        title="Teachers use Copilot. FERPA still applies to what AI can export and email."
        description="School districts and colleges enabled Microsoft Copilot and ChatGPT for lesson planning, admin email, and student support. Student records, IEP details, and parent communications are FERPA-regulated — and AI moves faster than your handbook policies."
        stats={[
          { value: "FERPA", label: "aligned controls" },
          { value: "Student", label: "record boundaries" },
          { value: "Parent", label: "comm approval" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The incident superintendents fear">
          <p>
            An administrator asks Copilot to &ldquo;email parents about tomorrow's
            schedule change for the basketball team.&rdquo; The draft pulls a roster
            with student names, includes an IEP accommodation note from a shared folder,
            and cc's a listserv that includes community partners not authorized for
            student data.
          </p>
          <p>
            Nobody meant to violate FERPA. There was no approval gate before send — and
            no log showing which student fields Copilot accessed.
          </p>
        </SeoSection>

        <SeoSection title="Why acceptable use policies aren't enough">
          <p>
            Most districts published AI guidance in 2024–2025. Staff still use Copilot
            daily because it saves time. The enforcement gap is at{" "}
            <strong className="text-white/80">action</strong>: sending email, exporting
            rosters, updating SIS fields — not drafting lesson ideas.
          </p>
          <SeoList
            items={[
              "Student information systems connected to admin workflows",
              "Shared drives with IEP and discipline records mixed with general docs",
              "ChatGPT Enterprise plugins reaching ticketing or transportation systems",
              "Parent portals updated from AI-generated summaries",
            ]}
          />
        </SeoSection>

        <SeoSection title="Controls a small district IT team can maintain">
          <SeoCards
            items={[
              {
                title: "Student PII export blocked by default",
                body: "Bulk roster downloads and copy-out flows require administrator approval and logging.",
                tone: "warn",
              },
              {
                title: "Parent & community email approval",
                body: "Messages that include identifiable student information route to principal or FERPA designee.",
                tone: "ok",
              },
              {
                title: "Role-based access to sensitive folders",
                body: "AI inherits user permissions — tighten folders first, then enforce action-level policy.",
              },
              {
                title: "Audit trail for board and counsel",
                body: "Document what AI accessed and who approved outbound communication.",
                tone: "ok",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/healthcare-copilot-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Healthcare AI governance
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
