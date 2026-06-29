/**
 * SEO landing page registry for AgentGovernance (agent-governance-demo).
 *
 * Add a slug here when a new indexable page ships — sitemap.ts imports this
 * list so footer clusters and /sitemap.xml stay in sync.
 *
 * Repo: ~/agent-trust-demo · Domain: agentgovern.ai · Ledger:
 * /Users/raj/promo/content/gtm-content-ledger.md
 */

export type SeoLink = { label: string; href: string };

/** Shipped indexable pages (beyond `/` and `/agent-governance-demo`). */
export const AGENTGOVERN_SEO_TOOLS: SeoLink[] = [
  { label: "Guides hub", href: "/guides" },
  {
    label: "AI governance for mid-size companies (50–1,000 employees)",
    href: "/ai-governance-for-mid-size-companies",
  },
  {
    label: "Healthcare Copilot AI governance",
    href: "/healthcare-copilot-ai-governance",
  },
  { label: "Legal firm AI governance", href: "/legal-firm-ai-governance" },
  { label: "Manufacturing AI governance", href: "/manufacturing-ai-governance" },
  {
    label: "Accounting firm AI governance",
    href: "/accounting-firm-ai-governance",
  },
  { label: "Insurance AI governance", href: "/insurance-ai-governance" },
  { label: "Retail Copilot AI governance", href: "/retail-copilot-ai-governance" },
  { label: "Education AI governance (FERPA)", href: "/education-ai-governance" },
  { label: "Logistics AI governance", href: "/logistics-ai-governance" },
  { label: "Construction AI governance", href: "/construction-ai-governance" },
  { label: "Real estate AI governance", href: "/real-estate-ai-governance" },
];

/** Paths included in sitemap.xml (SEO tools + core product surfaces). */
export const AGENTGOVERN_SITEMAP_PATHS: string[] = [
  "/",
  "/agent-governance-demo",
  ...AGENTGOVERN_SEO_TOOLS.map((t) => t.href),
];
