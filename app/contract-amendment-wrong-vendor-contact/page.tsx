import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/contract-amendment-wrong-vendor-contact";

const FAQ = [
  {
    q: "How do AI agents send contract emails to the wrong vendor contact?",
    a: "The agent resolves a recipient from a CRM or vendor record that is stale or ambiguous, drafts a coherent email, and sends with confidence. The draft quality hides the recipient risk.",
  },
  {
    q: "What should a reviewer see before a contract amendment goes out?",
    a: "The intended recipient, the source record it came from, when that record was last verified, the amendment diff, the policy outcome, and — after the decision — the final send receipt.",
  },
  {
    q: "Where should procurement teams start?",
    a: "One rule: any contract or amendment email to an external party requires human approval with recipient evidence attached. Expand to POs and renewals after the approval trail is routine.",
  },
];

export const metadata = buildSeoMetadata({
  title: "Contract Amendment to the Wrong Vendor Contact — AI Agent Governance",
  description:
    "Govern AI agents that send vendor contract emails: verify the recipient against the source record before the send, with approval and a full audit trail.",
  path: PATH,
  keywords: [
    "AI agent vendor contract email wrong recipient",
    "AI agent procurement governance",
    "contract amendment AI approval",
    "AI agent wrong contact email",
    "vendor email AI audit trail",
  ],
});

export default function ContractAmendmentWrongVendorContactPage() {
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
              headline: "Contract Amendment to the Wrong Vendor Contact",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Procurement · vendor contract emails"
        title="The agent emailed the contract amendment. The vendor contact left that company in March."
        description="AI agents are good at drafting contract emails and bad at knowing which human should receive them. When the recipient comes from a stale vendor record, a perfect draft becomes a confidentiality incident."
        stats={[
          { value: "Amendment", label: "external send" },
          { value: "Stale", label: "vendor record" },
          { value: "Approval", label: "before send" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode procurement recognizes">
          <p>
            An agent gets a routine task: send the updated amendment to the vendor
            and log it against the contract record. It resolves a contact from the
            vendor master, drafts a clean summary of the changed terms, and prepares
            the send.
          </p>
          <p>
            The draft is not the risk. The recipient is. If that contact changed
            roles, left the company, or was never the commercial owner, confidential
            terms are about to land in the wrong inbox — with a professional cover
            note attached.
          </p>
        </SeoSection>

        <SeoSection title="What LoopLabs demonstrates">
          <p>
            In the{" "}
            <Link href="/agent-governance-demo" className="text-indigo-300 hover:text-indigo-200">
              live control plane
            </Link>
            , contract and amendment emails are category-gated: an external send
            carrying commercial terms routes to approval, and the reviewer sees the
            recipient, the source record, and its freshness before anything leaves.
          </p>
          <SeoCards
            items={[
              {
                title: "Recipient evidence",
                body: "The approval card shows who will receive the amendment and which vendor record produced that contact.",
                tone: "ok",
              },
              {
                title: "Freshness before send",
                body: "A contact that has not been verified within your window routes to the contract owner instead of auto-sending.",
                tone: "warn",
              },
              {
                title: "Terms stay scoped",
                body: "Commercial terms in the body make the send high-risk by category, regardless of how routine the task looked.",
              },
              {
                title: "Receipt after decision",
                body: "Approval and the final delivery are recorded as separate facts for the audit trail.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Contract, amendment, and PO emails to external parties always require approval.",
              "The reviewer sees recipient, source record, and last-verified date on one card.",
              "Contacts stale beyond your window route to the contract owner for refresh.",
              "Approver identity, policy version, and the send receipt are logged separately.",
              "Review one held send per week before extending the gate to renewals and NDAs.",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            This is the procurement cousin of{" "}
            <Link href="/stale-crm-contact-agent-blocked" className="text-indigo-300 hover:text-indigo-200">
              the stale CRM contact block
            </Link>{" "}
            — same root cause, higher stakes. For the category rule itself, see{" "}
            <Link href="/external-party-actions-always-approve" className="text-indigo-300 hover:text-indigo-200">
              external-party actions always need approval
            </Link>
            .
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
