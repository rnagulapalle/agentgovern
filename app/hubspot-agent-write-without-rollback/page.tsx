import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/hubspot-agent-write-without-rollback";

const FAQ = [
  {
    q: "Aren't HubSpot's native AI write controls enough?",
    a: "Native CRM tool-approval controls what the agent may call inside HubSpot. They do not give you a cross-tool receipt or a rollback plan when the write already landed. Governance still needs an external decision + evidence bundle for reversible vs irreversible writes.",
  },
  {
    q: "What does 'no rollback' mean for a CRM agent?",
    a: "The agent bulk-updated 400 contact fields (lifecycle stage, owner, custom properties). There is no versioned before-image, no approval that named the field set, and no way to restore the previous values without a weekend of exports. The write succeeded; the control failed.",
  },
  {
    q: "Should every CRM write require a human?",
    a: "No. High-volume, low-risk enrichment can auto-run with a receipt. Bulk ownership changes, stage jumps, and deletes should queue — and every write class needs a documented undo path before it is allowed to auto-run.",
  },
];

export const metadata = buildSeoMetadata({
  title: "HubSpot AI Agent Wrote CRM Fields — With No Rollback Trail",
  description:
    "Govern HubSpot AI agent writes: require approval for bulk field changes, keep before/after evidence, and block irreversible CRM updates that have no rollback path.",
  path: PATH,
  keywords: [
    "HubSpot AI agent CRM write governance",
    "AI agent HubSpot write approval",
    "HubSpot Breeze agent rollback",
    "CRM AI agent audit trail",
    "HubSpot agent bulk update controls",
  ],
});

export default function HubspotAgentWriteWithoutRollbackPage() {
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
              headline: "HubSpot AI Agent Wrote CRM Fields — With No Rollback Trail",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="RevOps · CRM writes"
        title="The agent updated 400 contacts. Nobody can undo it."
        description="The HubSpot agent was supposed to enrich missing industry fields. It also rewrote lifecycle stage and owner on a bulk set. RevOps notices a week later when pipeline reports look wrong. There is no before-image, no approved field allowlist, and no rollback — only a successful write log."
        stats={[
          { value: "400", label: "contacts mutated" },
          { value: "0", label: "before-images kept" },
          { value: "1", label: "weekend of cleanup" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode RevOps recognizes">
          <p>
            Sales wants agents inside the CRM. HubSpot (and peers) now ship
            native write tools so an agent can update properties without a
            human clicking every record. That is useful — until the agent
            writes the wrong property set at scale.
          </p>
          <p>
            The gap is not &quot;did HubSpot allow the tool call?&quot; The gap
            is: which fields were in scope, who approved that scope, what the
            values were before, and how you reverse the change if the
            enrichment model was wrong. Native allow/deny on a tool name does
            not answer those questions after the write has already landed.
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
            , CRM writes are a governed action class: field allowlists and bulk
            thresholds live outside the prompt, irreversible updates queue for a
            named owner, and every decision writes a receipt you can replay in
            an audit.
          </p>
          <SeoCards
            items={[
              {
                title: "Allowlist the properties",
                body: "Enrichment may touch industry and employee count. Lifecycle stage and owner require a human — the agent cannot negotiate the list in prose.",
                tone: "warn",
              },
              {
                title: "Before/after on the receipt",
                body: "Approved writes record the prior values (or a hash of the prior record set) alongside the new payload. That is the difference between a log line and a rollback plan.",
                tone: "ok",
              },
              {
                title: "Bulk is a different action",
                body: "Updating one contact is not the same capability as updating four hundred. Cross the bulk threshold and the action queues even if each field is on the allowlist.",
              },
              {
                title: "No undo path → no auto-run",
                body: "If the integration cannot restore prior values, the write never auto-runs. Policy fails closed until RevOps ships a reversible path.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "CRM agent writes use an external property allowlist — not a prompt that says 'only enrich missing fields.'",
              "Bulk updates above a defined contact count always queue for a named RevOps owner.",
              "Every auto-approved write stores before/after evidence sufficient to reverse the change.",
              "Ownership, stage, and delete-class properties never auto-run without a human decision.",
              "Weekly review: repeated queue hits on the same workflow mean the allowlist is wrong, not that the agent is 'bad.'",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            CRM write governance sits next to{" "}
            <Link
              href="/stale-crm-contact-agent-blocked"
              className="text-indigo-300 hover:text-indigo-200"
            >
              stale CRM contact blocks
            </Link>{" "}
            and{" "}
            <Link
              href="/external-party-actions-always-approve"
              className="text-indigo-300 hover:text-indigo-200"
            >
              external-party send approval
            </Link>
            . For the retail sales-agent authority pattern, see{" "}
            <Link
              href="/retail-copilot-ai-governance"
              className="text-indigo-300 hover:text-indigo-200"
            >
              retail Copilot AI governance
            </Link>
            .
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
