import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/supplier-payment-dual-approval";

const FAQ = [
  {
    q: "Can a Copilot or AP agent release supplier payments on its own?",
    a: "Not if the action moves money to an external party. Treasury and SOX practice treat that as maker-checker: the agent may draft the payment; a named human (often two, above a threshold) must approve before the bank or ERP executes.",
  },
  {
    q: "Isn't an invoice-approval threshold enough?",
    a: "Approving an invoice and releasing payment are different actions. An agent can match a PO cleanly and still be the only actor on the wire. Dual approval is about payment release, not three-way match.",
  },
  {
    q: "What should the approval receipt include?",
    a: "Vendor, amount, bank/IBAN or payment method, invoice/PO ids, policy version, both approver identities and timestamps, then the ERP/bank result — logged separately from the approval itself.",
  },
];

export const metadata = buildSeoMetadata({
  title: "AI Agent Supplier Payment Approval — Dual Control Before Release",
  description:
    "Govern procurement agents that release supplier payments: money + external party never auto-execute. Require dual human approval and a payment receipt.",
  path: PATH,
  keywords: [
    "AI agent supplier payment approval",
    "Copilot procurement payment dual approval",
    "AI agent AP payment segregation of duties",
    "supplier payment human in the loop",
    "AI procurement payment governance",
  ],
});

export default function SupplierPaymentDualApprovalPage() {
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
              headline: "AI Agent Supplier Payment — Dual Approval Before Release",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Procurement · supplier payments"
        title="The agent matched the invoice — and was one click from paying the vendor alone."
        description="A procurement Copilot drafted a $12,400 supplier payment from a clean three-way match. No second human. No maker-checker. If that path can hit the bank, you do not have segregation of duties — you have an integration user with a prompt."
        stats={[
          { value: "$12.4k", label: "supplier payment" },
          { value: "1", label: "agent on the wire" },
          { value: "0", label: "human approvers" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode procurement and treasury recognize">
          <p>
            Invoice matching is tedious. Teams want agents to do it. The failure
            is treating a clean match as permission to <em>disburse</em>. Payment
            release is money plus an external counterparty. Category rules that
            shipped in real procurement automation are blunt: anything that
            touches money or an outside party is draft-only until a human
            approves — no exceptions, not “under the limit.”
          </p>
          <p>
            A single-agent path to payment is the opposite of maker-checker.
            Threshold-only invoice approval (the AP agent signs off below
            $10k) does not cover the wire. Dual approval is two named humans
            before execution, or one human plus a hard block if the second
            chair is empty — not the agent approving its own draft.
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
            , money movement and external-party actions are gated categories
            outside the prompt. The demo&apos;s refund rule (charges or refunds
            over $500 need a human) is the same shape as supplier payment:
            the model cannot self-authorize a disbursement. We do not fake a
            bank rail on the demo screen — we show the approval queue and
            receipt the payment action must hit first.
          </p>
          <SeoCards
            items={[
              {
                title: "Category gate, not a vibe check",
                body: "Supplier payment is money + external party. Policy says always queue. The agent cannot argue that the match was clean enough to skip.",
                tone: "warn",
              },
              {
                title: "Dual humans, not agent + agent",
                body: "Above your materiality line, two independent approvers. The drafter (human or agent) is not the only signer. That is SoD, not a second prompt.",
                tone: "ok",
              },
              {
                title: "Approval ≠ paid",
                body: "Log the approve decision, then log the ERP or bank result separately. If the wire fails after approval, the trail still shows both facts.",
              },
              {
                title: "New vendor / new bank details",
                body: "IBAN or account changes route to a human at any amount. Duplicate-invoice and unapproved-vendor checks sit in the same gate.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Supplier payment release never auto-executes — agent drafts, humans approve, then the ERP or bank runs.",
              "Above materiality, require two independent approvers (maker-checker). The agent does not count as a checker.",
              "New vendor, changed bank details, or split payments against one invoice always escalate.",
              "Every approval and every payment result write separate receipts: vendor, amount, policy version, approver ids, timestamp.",
              "Weekly review: repeated single-path payment attempts mean the integration credential is too wide, not that the agent is 'wrong.'",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            Invoice matching without payment release is{" "}
            <Link
              href="/invoice-approval-agent-threshold"
              className="text-indigo-300 hover:text-indigo-200"
            >
              AP threshold approval
            </Link>
            . Customer-money the other direction is{" "}
            <Link
              href="/refund-ticket-agent-above-limit"
              className="text-indigo-300 hover:text-indigo-200"
            >
              support refunds above limit
            </Link>
            . Wrong recipient on the vendor file is{" "}
            <Link
              href="/contract-amendment-wrong-vendor-contact"
              className="text-indigo-300 hover:text-indigo-200"
            >
              contract amendment to the wrong contact
            </Link>
            .
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
