# AgentGovernance — GTM / SEO / PR

**Product:** AgentGovernance — AI governance between business AI tools and company systems  
**Domain:** https://agentgovern.ai  
**Repo:** `~/agent-trust-demo`  
**Demo UI:** AgentGovernance Control Plane at `/agent-governance-demo`  
**Twitter:** @agentgovern

## Positioning (Mar 2026)

**ICP:** SMB/traditional organizations (50–1,000 employees) rolling out Copilot, ChatGPT Enterprise, Gemini, Agentforce — not AI-native builders.

**Trigger:** Employees use AI to access company systems and take real business actions (email, CRM, finance, documents).

**Message:** Control layer with AI visibility, human approval, access control, and audit trails.

**Voice:** Vanta / Okta / Microsoft Security / Drata — business and compliance language first.

**Copy source of truth:** `lib/site.ts` (homepage, FAQ, metadata).

### Banned on homepage & top-of-funnel SEO

policy engine, execution engine, orchestration, infrastructure, Rego, OPA, LLM framework, SDK, APIs

### Preferred terms

AI governance, AI security, AI approvals, AI access control, AI audit trail, AI compliance, AI risk management, human approval, business policies, enterprise AI controls

## Mandatory before any content

1. Read **`~/.cursor/skills/agentgovern-gtm/SKILL.md`** — Research Gate protocol
2. Pick a row from **`docs/research/industry-narrow-post-matrix.md`**
3. Read **`docs/research/2026-06-agent-governance-reddit.md`** for customer signals
4. Update **`/Users/raj/promo/content/gtm-content-ledger.md`**

## One post rule

Every blog post, SEO page, Dev.to article, and social thread =

**one industry + one failure mode + one action type**

No broad "AI agent governance" essays. No prompt-guardrails thought leadership.

## Industries we target (narrow posts each)

- RevOps / sales (GTM agents, CRM writes, discounts, external email)
- Finance / BFSI (refunds, invoices, AML triage)
- Healthcare admin (prior auth, PHI export, stale records)
- Procurement / vendor ops (contract amendments, supplier payments)
- Public sector (FOI, citizen service, PII)
- Engineering / internal ops (Jira, GitHub, tool integrations)
- Customer support (Zendesk, ticket refunds)

Full backlog with slugs, queries, and evidence: **`docs/research/industry-narrow-post-matrix.md`**

## Adding an SEO page

1. Complete Research Gate (see skill)
2. Create `app/<slug>/page.tsx`
3. Add to `lib/seo-tools.ts`
4. Bump `UPDATED` in `app/sitemap.ts`
5. Ledger + matrix status update

## Voice

- Business problem first — what AI tried to do, what policy required, what got logged
- Compliance/security buyer tone — not developer infrastructure
- Banned words: blazing, powerful, AI-powered, revolutionary

## Deploy

- `docs/DEPLOY.md` — Lightsail + Docker + Cloudflare

## Dev.to (weekly)

**Cadence:** 1 post every **Tuesday** · drafts in `docs/devto/` · calendar in `docs/devto/devto-weekly-calendar.md`

| Step | Action |
|------|--------|
| Pick | Next row in weekly calendar (matches a live guide URL) |
| Draft | `docs/devto/week-NN-*.md` — narrow incident, business/IT voice, `published: false` |
| Canonical | Always `https://agentgovern.ai/<guide-slug>` — not Dev.to as primary |
| Publish | Dev.to editor → paste markdown → set canonical URL → 4 tags |
| After | Ledger `Posted` + Dev.to URL; optional Hashnode (canonical = Dev.to) |
| Measure | GSC impressions on **guide** (Friday check, 7-day lag) |

**Month 1 drafts ready:** weeks 01–04 in `docs/devto/`. Weeks 05–12 scheduled in calendar — draft the Friday before publish week.

**Tags (pick 4):** `ai`, `security`, `devops`, `microsoft`, `chatgpt`, `compliance`, `startup`

**Do not:** broad AI safety essays; repeat same industry+failure within 30 days; use dev jargon (policy engine, OPA, MCP) in titles.

