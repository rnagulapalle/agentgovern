import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata, faqJsonLd, articleJsonLd } from "@/lib/seo-metadata";

const PATH = "/mcp-tool-call-without-receipt";

const FAQ = [
  {
    q: "What is an MCP tool-call receipt?",
    a: "A durable record of what was proposed, what policy decided, what tool ran, and what came back — tied to a timestamp and policy version. Without it, 'the agent called the tool' is a claim you cannot prove in an audit or an incident review.",
  },
  {
    q: "Aren't MCP server logs enough?",
    a: "Server logs show traffic. They do not show whether a human approved the call, which policy version allowed it, or whether the outcome matched the proposal. Governance needs the decision bundle, not only the wire log.",
  },
  {
    q: "Should every MCP tool require a human?",
    a: "No. Read-only and low-risk tools can auto-run with a receipt. Irreversible or external-effect tools (send, pay, delete, write production data) should queue — and no tool in that class should run without evidence you can replay.",
  },
];

export const metadata = buildSeoMetadata({
  title: "MCP Agent Tool Call With No Receipt — Governance Gap",
  description:
    "Govern MCP tool calls: require propose → decide → prove receipts for agent tool use, and block irreversible MCP actions that leave no evidence bundle.",
  path: PATH,
  keywords: [
    "MCP agent governance tool calls",
    "MCP tool call audit trail",
    "AI agent MCP receipt",
    "Model Context Protocol governance",
    "MCP agent approval evidence",
  ],
});

export default function McpToolCallWithoutReceiptPage() {
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
              headline: "MCP Agent Tool Call With No Receipt — Governance Gap",
              description: metadata.description as string,
              path: PATH,
            })
          ),
        }}
      />
      <SeoPageShell
        eyebrow="Engineering · MCP agents"
        title="The agent called the MCP tool. There is nothing to show for it."
        description="Your coding agent proposed a Stripe refund via MCP, the tool ran, the money moved. Security asks for the approval chain. All you have is a chat transcript and a provider dashboard entry — no policy decision, no receipt, no way to prove who authorized the call."
        stats={[
          { value: "Tool", label: "ran" },
          { value: "Money", label: "moved" },
          { value: "Receipt", label: "missing" },
        ]}
        faq={FAQ}
      >
        <SeoSection title="The failure mode platform teams recognize">
          <p>
            MCP made it easy for agents to call real tools — sandboxes,
            ticketing, payments, deploys. That is the point. The failure mode is
            speed without evidence: the tool invocation succeeds, the side
            effect is real, and the only &quot;audit trail&quot; is a scrolling
            chat window that will be gone next session.
          </p>
          <p>
            Prompt rules like &quot;be careful with refunds&quot; do not survive
            contact with a capable model under pressure. If the control plane
            cannot show propose → decide → prove for an MCP call, you do not
            have governance — you have a hope.
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
            , MCP-class tool calls are governed actions: irreversible tools
            queue for a named owner, every decision writes a receipt, and a
            missing evidence bundle hard-blocks the call instead of trusting the
            prompt.
          </p>
          <SeoCards
            items={[
              {
                title: "Propose before invoke",
                body: "The agent states tool, arguments, and intended effect. That proposal is what a human (or policy) approves — not a vague chat summary after the fact.",
                tone: "warn",
              },
              {
                title: "Decide outside the model",
                body: "Allow / queue / block lives in policy. The model cannot talk itself into a refund that policy forbids.",
                tone: "ok",
              },
              {
                title: "Prove with a receipt",
                body: "Approved and blocked calls both leave a durable bundle: actor, tool, args hash, policy version, outcome. That is what incident review opens.",
              },
              {
                title: "No receipt → no call",
                body: "If the evidence path is down, irreversible MCP tools fail closed. Availability of the tool never overrides accountability.",
              },
            ]}
          />
        </SeoSection>

        <SeoSection title="The first policy to ship">
          <SeoList
            items={[
              "Classify MCP tools: read-only (receipt + auto) vs irreversible (queue or block without approval).",
              "Irreversible tools never run without a propose → decide record written before invoke.",
              "Every invoke stores a receipt with tool name, args hash, policy version, and outcome.",
              "Missing or failed receipt storage hard-blocks irreversible tools.",
              "Weekly review: tools that repeatedly queue need a clearer mandate, not a quieter agent.",
            ]}
          />
        </SeoSection>

        <SeoSection title="Related guides">
          <p>
            MCP receipts sit next to{" "}
            <Link
              href="/jira-delete-project-agent-blocked"
              className="text-indigo-300 hover:text-indigo-200"
            >
              destructive action blocks
            </Link>{" "}
            and{" "}
            <Link
              href="/hubspot-agent-write-without-rollback"
              className="text-indigo-300 hover:text-indigo-200"
            >
              CRM writes without rollback
            </Link>
            . For external sends that must never auto-run, see{" "}
            <Link
              href="/external-party-actions-always-approve"
              className="text-indigo-300 hover:text-indigo-200"
            >
              external-party actions
            </Link>
            .
          </p>
        </SeoSection>
      </SeoPageShell>
    </>
  );
}
