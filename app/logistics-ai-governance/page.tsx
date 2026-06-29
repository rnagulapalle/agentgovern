import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/logistics-ai-governance";

const FAQ = [
  {
    q: "Can Copilot update delivery ETAs in our TMS without approval?",
    a: "Only if your policies allow it. Most freight brokers and 3PLs require human approval when AI changes customer-facing delivery commitments, rate confirmations, or carrier assignments above delegated authority.",
  },
  {
    q: "We dispatch from spreadsheets and email — does AI governance still apply?",
    a: "Yes. Governance intercepts the moment AI tries to send a customer update, book a load, or change a record in your TMS — regardless of whether the workflow started in Copilot, ChatGPT, or a CRM plugin.",
  },
  {
    q: "We're a 200-person brokerage with two IT people. Where do we start?",
    a: "Start with customer- and carrier-facing emails plus any rate or appointment change above your standard threshold. Those three policies cover most costly mistakes when dispatch teams adopt AI.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Logistics AI Governance — Copilot, TMS & Customer Commitments",
  description:
    "AI governance for freight brokers, 3PLs, and logistics firms (50–1,000 employees): control Copilot and AI on delivery commitments, carrier communications, and TMS updates.",
  path: PATH,
  keywords: [
    "logistics AI governance",
    "freight broker Copilot governance",
    "TMS AI approval workflow",
    "3PL AI audit trail",
    "supply chain AI compliance",
  ],
});

export default function LogisticsAiGovernancePage() {
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
              headline: "Logistics AI Governance",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Logistics · brokers, 3PLs & carriers"
        title="Copilot confirmed the delivery window. The customer got the wrong date."
        description="Mid-size logistics companies rolled out Copilot and ChatGPT for dispatch, customer service, and sales ops. AI can email shippers, update TMS appointments, and confirm rates — binding commitments your ops team used to double-check manually."
        stats={[
          { value: "ETA", label: "commitment approval" },
          { value: "Carrier", label: "comms control" },
          { value: "TMS", label: "change logging" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="Where AI creates logistics liability">
          <p>
            A customer service rep asks Copilot to &ldquo;update Acme Foods on
            tomorrow&apos;s delivery and cc the carrier.&rdquo; Copilot pulls an
            appointment from yesterday&apos;s TMS export, drafts a confident email,
            and is one click from send. The load was re-routed overnight. Nobody
            approved the new commitment — and there is no log tying the message to
            the source record.
          </p>
          <p>
            In logistics, the damage is immediate: missed appointments, chargebacks,
            and carriers acting on stale instructions.
          </p>
        </SeoSection>

        <SeoSection title="Failure modes ops managers recognize">
          <SeoCards
            items={[
              {
                title: "Stale appointment data",
                body: "AI confirms a pickup window from a spreadsheet or TMS view that hasn't synced since the last exception.",
                tone: "warn",
              },
              {
                title: "Rate confirmation without authority",
                body: "Sales or dispatch uses AI to accept a lane rate above the rep's delegated ceiling — email becomes the contract.",
                tone: "warn",
              },
              {
                title: "Wrong party on the thread",
                body: "Customer update cc's a carrier contact pulled from an old CRM note — sensitive freight details leak across parties.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="Policies a 150-person brokerage can enforce">
          <SeoList
            items={[
              "Customer- or carrier-facing email about timing, rate, or appointment → dispatcher approval",
              "TMS appointment or load status change → logged; writes above threshold need manager sign-off",
              "Actions on loads not updated within your sync window → held for review, not auto-sent",
              "Audit trail exportable for shipper audits and insurance claims",
            ]}
          />
          <p>
            Your team already runs on commitments and exceptions. AgentGovernance
            applies those rules when Copilot or ChatGPT tries to act — without
            disabling the speed AI provides.
          </p>
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            <Link href="/manufacturing-ai-governance" className="text-indigo-300 hover:text-indigo-200">
              Manufacturing AI governance
            </Link>{" "}
            ·{" "}
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
