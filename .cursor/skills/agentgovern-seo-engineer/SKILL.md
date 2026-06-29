---
name: agentgovern-seo-engineer
description: AgentGovernance SEO and content for this repo. Use before creating any blog post, SEO page, or indexable route in agent-trust-demo. Enforces industry-specific narrow posts with mandatory research.
---

# AgentGovernance SEO (this repo)

Read **`~/.cursor/skills/agentgovern-gtm/SKILL.md`** first — full Research Gate protocol lives there.

## Scope boundary (standing rule)

**SEO only.** Do not edit homepage, demo app, components, or UX unless the user explicitly asks. Ship new indexable routes + registry/sitemap/ledger updates; leave existing pages alone.

## Local paths

| Asset | Path |
|-------|------|
| Industry post backlog | `docs/research/industry-narrow-post-matrix.md` |
| Customer signals | `docs/research/2026-06-agent-governance-reddit.md` |
| Marketing copy | `lib/site.ts` |
| SEO registry | `lib/seo-tools.ts` |
| GTM playbook | `docs/GTM.md` |
| Content ledger | `/Users/raj/promo/content/gtm-content-ledger.md` |

## Adding an SEO page

1. Pick matrix row → complete Research Gate
2. `app/<slug>/page.tsx` with metadata + FAQ schema
3. Register in `lib/seo-tools.ts`
4. Bump `UPDATED` in `app/sitemap.ts`
5. Ledger row + matrix status update

## Dev.to weekly

See `docs/devto/devto-weekly-calendar.md`. One post/Tuesday; canonical always points to a live guide on agentgovern.ai.

## One post rule

**One industry · one failure mode · one action type** — no exceptions.
