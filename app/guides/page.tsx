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
  title: "AI Governance Guides for Mid-Size Companies",
  description:
    "Practical AI governance for 50–1,000 employee organizations rolling out Copilot, ChatGPT Enterprise, and Gemini — without an AI platform team.",
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
      title="AI governance for organizations that aren't building AI"
      description="You rolled out Copilot or ChatGPT Enterprise so people could work faster — not so IT would become an AI lab. These guides are written for 50–1,000 employee companies with a small security or compliance team and no dedicated AI platform group."
      primaryCta={{ href: "/ai-governance-for-mid-size-companies", label: "Start with the overview" }}
      secondaryCta={{ href: "/agent-governance-demo", label: "Live demo" }}
    >
      <SeoSection title="Who these guides are for">
        <p>
          Manufacturing plants, regional hospitals, law firms, freight brokers, CPA
          practices, insurance agencies, contractors, retailers, brokerages, school
          districts, and property firms share the same rollout pattern: business AI
          tools first, governance questions second.
        </p>
        <SeoList
          items={[
            "50–1,000 employees — big enough for real systems, small enough that IT wears many hats",
            "Recently enabled Microsoft Copilot, ChatGPT Enterprise, Google Gemini, or Salesforce Agentforce",
            "No AI platform team — maybe one security lead and a compliance-minded ops manager",
            "Goal: let people use AI safely without turning every manager into an AI expert",
          ]}
        />
      </SeoSection>

      <SeoSection title="Industry guides">
        <div className="mt-5 grid gap-3">
          {AGENTGOVERN_SEO_TOOLS.filter((t) => t.href !== "/guides").map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className="card block p-4 transition-colors hover:border-white/[0.12]"
            >
              <span className="text-[15px] font-medium text-white/90">{t.label}</span>
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
              title: "How AgentGovernance helps",
              body: "A control layer between the AI tools employees already use and the systems those tools can reach.",
            },
          ]}
        />
      </SeoSection>
    </SeoPageShell>
  );
}
