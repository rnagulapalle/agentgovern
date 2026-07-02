---
name: agentgovern-seo-engineer
description: AgentGovernance SEO for agent-trust-demo repo. Use before creating indexable routes here. For portfolio-wide SEO + duplicate checks, read ~/.cursor/skills/portfolio-seo-engineer/SKILL.md first.
---

# AgentGovernance SEO (this repo)

**Portfolio SEO:** `~/.cursor/skills/portfolio-seo-engineer/SKILL.md` · **Growth rubric:** `~/promo/content/seo-growth-rubric.md` · duplicate gate: `~/promo/scripts/check-seo-duplicate.sh` · **GSC:** `~/promo/content/gsc-submission-playbook.md`

Read **`~/.cursor/skills/agentgovern-gtm/SKILL.md`** first — full Research Gate protocol lives there.

## Scope boundary (standing rule)

**SEO only.** Do not edit homepage, demo app, components, or UX unless the user explicitly asks. Ship new indexable routes + registry/sitemap/ledger updates; leave existing pages alone.

**Strict variations:** `~/promo/content/strict-variation-protocol.md` — same variation key within 30 days on same channel = do not draft.

**Dev.to covers:** mandatory **PNG** per `docs/devto-cover-spec.md` — never SVG on Dev.to; never ask user.

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
