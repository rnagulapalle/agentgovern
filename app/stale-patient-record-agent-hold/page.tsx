import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/stale-patient-record-agent-hold";

const FAQ = [
  {
    q: "Why can't the agent just read the latest EHR chart?",
    a: "It can — and should — when freshness policy allows. The failure mode is acting on a cached or last-synced snapshot that is days stale: scheduling, messaging, or documenting against demographics or meds that changed.",
  },
  {
    q: "Is a hard block better than a hold?",
    a: "A silent hard block looks like an outage. A hold with a reason (stale > N days) tells the nurse or coordinator to refresh the chart, then resume. Same safety; better operations.",
  },
  {
    q: "What does HIPAA have to do with freshness?",
    a: "Wrong-patient or wrong-med actions from stale data create safety and privacy incidents. Freshness gates are clinical safety controls that also keep audit narratives coherent.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Stale Patient Record — AI Agent Hold (Not Silent Fail)",
  description:
    "Govern healthcare admin agents: auto-hold actions when the patient record is stale beyond N days, require a refresh, then resume — instead of acting on outdated EHR data.",
  path: PATH,
  keywords: [
    "stale EHR data AI agent",
    "healthcare AI agent patient record freshness",
    "AI agent hold stale patient data",
    "EHR agent governance",
    "prior auth agent stale chart",
  ],
});

export default function StalePatientRecordAgentHoldPage() {
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
              headline: "Stale Patient Record — AI Agent Hold (Not Silent Fail)",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Healthcare admin · data freshness"
        title="The agent scheduled on a chart that was nine days stale."
        description="The outreach agent pulled the last synced patient demographics, sent a reminder to an old phone number, and logged 'complete.' The chart had been updated in the EHR three days earlier. Nobody blocked the send — freshness was never a policy."
        stats={[
          { value: "9d", label: "stale snapshot" },
          { value: "Send", label: "still fired" },
          { value: "Hold", label: "missing" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode revenue-cycle and care ops recognize">
          <p>
            Agents are good at form-shaped healthcare admin: reminders,
            scheduling assists, PA packet prep. They are dangerous when they
            treat a sync timestamp as truth. Phone numbers change. Coverage
            changes. Med lists change. Acting on last Tuesday&apos;s extract is
            not &quot;automation&quot; — it is automated error at scale.
          </p>
          <p>
            The fix is not &quot;ban agents.&quot; It is a freshness gate:
            if the record is older than policy allows, <em>hold</em> with a
            reason, force a refresh path, then resume. Silent 403s teach
            operators to bypass. Holds teach the workflow.
          </p>
        </SeoSection>

        <SeoSection title="What LoopLabs demonstrates">
          <p>
            In the{" "}
            <Link
              href="/agent-governance-demo"
              className="text-indigo-300 hover:text-indigo-200"
            >
              live control plane
            </Link>
            , patient-record actions carry a freshness check outside the
            prompt: stale beyond N days routes to hold, not auto-send — same
            pattern as{" "}
            <Link
              href="/stale-crm-contact-agent-blocked"
              className="text-indigo-300 hover:text-indigo-200"
            >
              stale CRM contact blocks
            </Link>{" "}
            in RevOps, tuned for clinical ops.
          </p>
          <SeoCards
            items={[
              {
                title: "Freshness outside the prompt",
                body: "N-day thresholds live in policy. The model cannot argue that nine-day-old demographics are 'probably fine.'",
                tone: "warn",
              },
              {
                title: "Hold with a reason",
                body: "Operators see why the agent stopped and what to refresh — not a generic failure that invites shadow IT.",
                tone: "ok",
              },
              {
                title: "Resume after refresh",
                body: "Once the chart sync is current, the same action can proceed under policy without rewriting the agent.",
              },
              {
                title: "Receipt on hold and send",
                body: "Both outcomes log patient id, freshness timestamp, policy version, and actor — audit-ready.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Patient notify / schedule / PA-prep actions require a freshness timestamp ≤ N days (set with clinical ops).",
              "Stale records auto-hold with a human-visible reason — never silent drop.",
              "Refresh path is explicit (re-pull EHR, confirm, resume).",
              "Every hold and every send writes a receipt with freshness evidence.",
              "Weekly review: repeated holds on one feed mean the sync job is the bug, not the agent.",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            Pair with{" "}
            <Link
              href="/prior-auth-agent-without-audit-trail"
              className="text-indigo-300 hover:text-indigo-200"
            >
              prior auth audit trails
            </Link>{" "}
            and{" "}
            <Link
              href="/healthcare-copilot-ai-governance"
              className="text-indigo-300 hover:text-indigo-200"
            >
              PHI export controls
            </Link>
            . For the CRM analogue, see{" "}
            <Link
              href="/stale-crm-contact-agent-blocked"
              className="text-indigo-300 hover:text-indigo-200"
            >
              stale CRM contact blocked
            </Link>
            .
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
