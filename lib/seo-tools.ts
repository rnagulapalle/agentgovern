/**
 * SEO landing page registry for LoopLabs.
 *
 * Add a slug here when a new indexable page ships — sitemap.ts imports this
 * list so footer clusters and /sitemap.xml stay in sync.
 *
 * Repo: ~/agent-trust-demo · Domain: looplabs.run · Ledger:
 * /Users/raj/promo/content/gtm-content-ledger.md
 */

export type SeoLink = { label: string; href: string };

/** Shipped indexable pages beyond the homepage. */
export const AGENTGOVERN_SEO_TOOLS: SeoLink[] = [
  { label: "Guides hub", href: "/guides" },
  { label: "Agent workflow and control blog", href: "/blog" },
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
  { label: "Stale CRM contact blocked", href: "/stale-crm-contact-agent-blocked" },
  { label: "AI support refund approval", href: "/refund-ticket-agent-above-limit" },
  { label: "External party actions approval", href: "/external-party-actions-always-approve" },
  { label: "Contract amendment wrong vendor contact", href: "/contract-amendment-wrong-vendor-contact" },
  { label: "Jira delete blocked (destructive actions)", href: "/jira-delete-project-agent-blocked" },
  { label: "Invoice approval above threshold", href: "/invoice-approval-agent-threshold" },
  { label: "Prior auth without audit trail", href: "/prior-auth-agent-without-audit-trail" },
  { label: "HubSpot write without rollback", href: "/hubspot-agent-write-without-rollback" },
  { label: "MCP tool call without receipt", href: "/mcp-tool-call-without-receipt" },
  { label: "Zendesk ticket reply auto", href: "/zendesk-ticket-reply-agent-auto" },
  { label: "Stale patient record hold", href: "/stale-patient-record-agent-hold" },
  { label: "Supplier payment dual approval", href: "/supplier-payment-dual-approval" },
  { label: "Education AI governance (FERPA)", href: "/education-ai-governance" },
  { label: "Logistics AI governance", href: "/logistics-ai-governance" },
  { label: "Construction AI governance", href: "/construction-ai-governance" },
  { label: "Real estate AI governance", href: "/real-estate-ai-governance" },
];

/** Paths included in sitemap.xml (SEO tools + core product surfaces). */
export const AGENTGOVERN_SITEMAP_PATHS: string[] = [
  "/",
  "/about",
  "/control-plane",
  ...AGENTGOVERN_SEO_TOOLS.map((t) => t.href),
];
