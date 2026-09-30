import Link from "next/link";
import {
  SeoPageShell,
  SeoSection,
  SeoCards,
  SeoList,
} from "@/components/seo/SeoPageShell";
import { buildSeoMetadata } from "@/lib/seo-metadata";
import { AGENTGOVERN_SEO_TOOLS } from "@/lib/seo-tools";

export const metadata = buildSeoMetadata({
  title: "Agent Workflow and Control Guides",
  description:
    "Practical guides for building agent workflows, controlling actions and execution, checking outputs, and recovering failed state.",
  path: "/guides",
  keywords: [
    "AI governance mid size company",
    "Copilot governance SMB",
    "enterprise AI controls",
    "AI compliance small team",
  ],
});

export default function GuidesPage() {
  return (
    <SeoPageShell
      eyebrow="Guides"
      title="Build useful agent workflows without losing control"
      description="Practical guidance for teams automating work with agents. Start with a real workflow, give every agent a role, control what it can do, supervise the full execution, and recover when production state changes unexpectedly."
      primaryCta={{ href: "/ai-governance-for-mid-size-companies", label: "Start with the overview" }}
      secondaryCta={{ href: "/control-plane", label: "Product tour" }}
    >
      <SeoSection title="Who these guides are for">
        <p>
          Product and operations teams building agent workflows, and security teams
          responsible for what those agents can do once they reach real systems.
        </p>
        <SeoList
          items={[
            "Teams automating multi-step work across models, tools, and business systems",
            "Agents that send messages, change records, approve work, or delegate to other agents",
            "Workflows that need role-based permissions, approval thresholds, and execution history",
            "Operators who need to stop a bad run and recover affected state without guessing",
          ]}
        />
      </SeoSection>

      <SeoSection title="Industry guides">
        <div className="mt-5 grid gap-3">
          {AGENTGOVERN_SEO_TOOLS.filter((t) => t.href !== "/guides").map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card block p-4 transition-colors hover:border-hairline/20"
            >
              <span className="text-[15px] font-medium text-fg">{t.label}</span>
            </Link>
          ))}
        </div>
      </SeoSection>

      <SeoSection title="What every guide covers">
        <SeoCards
          items={[
            {
              title: "One real scenario",
              body: "A specific action AI tried to take in your industry — email, record change, document access — and what went wrong without controls.",
            },
            {
              title: "What a small team can enforce",
              body: "Human approval thresholds, access boundaries, and audit trails you can explain to leadership without a PhD in machine learning.",
            },
            {
              title: "How LoopLabs fits",
              body: "A workflow and control layer between your agents and the models, tools, data, and systems they use.",
            },
          ]}
        />
      </SeoSection>
    </SeoPageShell>
  );
}
