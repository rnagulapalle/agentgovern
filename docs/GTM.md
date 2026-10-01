# LoopLabs — GTM / SEO / PR

> **Current operating plan:** [`docs/SEO_AEO_GTM_8_WEEK_PLAN.md`](SEO_AEO_GTM_8_WEEK_PLAN.md). Use its weekly goals, fixed AEO benchmark, and Friday scorecard for all LoopLabs discovery work through November 24, 2026.
>
> **Persistent learning memory:** [`docs/research/gtm-learning-log.md`](research/gtm-learning-log.md). Every scheduled research, content, distribution, and conversion run must read prior evidence and append observed results, lessons, confidence, and its next experiment.

**Product:** LoopLabs — AI governance between business AI tools and company systems\
**Domain:** https://looplabs.run\
**Repo:** `~/agent-trust-demo`\
**Demo UI:** LoopLabs Control Plane at `/control-plane` (original scenarios at `/agent-governance-demo`)\
**Twitter:** Not configured for the new brand

## Positioning (Oct 2026)

**Provisional design-partner ICP:** Applied-AI, agent-platform, automation, security-engineering, RevOps, and customer-operations teams in mid-market organizations that already have an agent workflow changing a system of record.

**Trigger:** A multi-agent or multi-tool workflow can send, write, pay, delete, delegate, or expose output, and the team needs to control the action or recover from an uncertain outcome.

**Message:** Build an agent workflow with LoopLabs' guided help, control consequential actions before and during execution, and reconcile affected state when an outcome is uncertain.

**Category and wedge:** Use “agent control plane” for category comprehension. Lead with execution integrity and recovery for consequential multi-agent workflows. Do not market a self-serve workflow builder until one is shipped.

**Voice:** Vanta / Okta / Microsoft Security / Drata — business and compliance language first.

**Copy source of truth:** `lib/site.ts` (homepage, FAQ, metadata).

### Banned on homepage & top-of-funnel SEO

policy engine, execution engine, orchestration, infrastructure, Rego, OPA, LLM framework, SDK, APIs

### Preferred terms

AI governance, AI security, AI approvals, AI access control, AI audit trail, AI compliance, AI risk management, human approval, business policies, enterprise AI controls

## Mandatory before any material asset

1. Read **`~/.codex/skills/looplabs-growth-operator/SKILL.md`** for current positioning and route to its decision gate.
2. Check **`docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md`** and the shipped product surface that will support the claim.
3. Use current buyer, search, community, product, or primary-source evidence to score the candidate. Do not draft when buyer pain, product proof, or conversion fit is weak.
4. Check the ledger and variation registry for overlap, then update **`/Users/raj/promo/content/gtm-content-ledger.md`** as the asset advances.

For an industry failure-mode SEO page, also choose or add a researched row in **`docs/research/industry-narrow-post-matrix.md`** and inspect the relevant signals in **`docs/research/2026-06-agent-governance-reddit.md`**. Those files are inputs for that asset type, not a mandatory source for every PR, launch, research, or conversion task.

The older Cursor portfolio and AgentGovern skills are historical inputs. Reuse their research, duplicate-prevention, canonical, ledger, and measurement disciplines; do not inherit stale branding, product facts, audiences, or publishing quotas.

## One post rule

Every blog post, SEO page, Dev.to article, and social thread =

**one industry + one failure mode + one action type**

No broad "AI agent governance" essays. No prompt-guardrails thought leadership.

**Strict variations:** see `~/promo/content/strict-variation-protocol.md` — ≥3 dimensions must change vs last same-channel post; log `variation:` frontmatter on every draft.

**Covers:** mandatory **PNG** on every Dev.to draft — `docs/devto/covers/*.png` + `docs/devto-cover-spec.md`. Dev.to does not accept SVG. Agent creates PNG; never ask user.

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

**Strict variations:** `~/promo/content/strict-variation-protocol.md` — never same `industry + failure_mode + action` on Dev.to; ≥40% new prose if syndicating from a guide.

| Step | Action |
|------|--------|
| Pick | Next row in weekly calendar (matches a live guide URL) |
| Draft | `docs/devto/week-NN-*.md` — narrow incident, business/IT voice, `published: false` |
| Canonical | Always `https://looplabs.run/<guide-slug>` — not Dev.to as primary |
| Publish | Dev.to editor → paste markdown → set canonical URL → 4 tags |
| After | Ledger `Posted` + Dev.to URL; optional Hashnode (canonical = Dev.to) |
| Measure | GSC impressions on **guide** (Friday check, 7-day lag) |

**Month 1 drafts ready:** weeks 01–04 in `docs/devto/`. Weeks 05–12 scheduled in calendar — draft the Friday before publish week.

**Tags (pick 4):** `ai`, `security`, `devops`, `microsoft`, `chatgpt`, `compliance`, `startup`

**Do not:** broad AI safety essays; repeat same industry+failure within 30 days; use dev jargon (policy engine, OPA, MCP) in titles.
