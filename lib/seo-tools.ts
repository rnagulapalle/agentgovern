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
  // Pages land here as they ship. See gtm-sprint-4-products-2026-06-28.md backlog.
];

/** Paths included in sitemap.xml (SEO tools + core product surfaces). */
export const AGENTGOVERN_SITEMAP_PATHS: string[] = [
  "/",
  "/agent-governance-demo",
  ...AGENTGOVERN_SEO_TOOLS.map((t) => t.href),
];
