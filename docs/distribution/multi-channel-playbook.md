# AgentGovernance — Multi-Channel Distribution Playbook

**Goal:** Every governance/privacy news item earns **backlinks to agentgovern.ai** and accelerates indexing of guides + news.

**Golden rule:** **Publish local first.** Syndicate outward. Every external post links **home**.

```
content/news/*.md  →  agentgovern.ai/news/[slug]   ← CANONICAL (source of truth)
        ↓
   Dev.to (canonical → local URL)
   LinkedIn (link → local URL)
   X (link → local URL)
   Optional: Hashnode (canonical → Dev.to or local)
```

---

## What qualifies as "governance / privacy news"

| Type | Example | Category tag |
|------|---------|--------------|
| **Vendor / platform change** | Copilot prompt retention, Purview update | `privacy` |
| **Regulation** | State AI law, EU AI Act workplace duties | `regulatory` |
| **Incident pattern** | Wrong customer email via Copilot (narrow) | `governance` |
| **Compliance checklist** | Pre-rollout audit for 200-person firm | `governance` |

**Not news:** generic product changelog without compliance angle; broad "AI is risky" essays.

---

## Weekly rhythm (stack with Dev.to Tuesday)

| Day | Channel | Action |
|-----|---------|--------|
| **Mon** | Local | Ship or update `content/news/[slug].md` → deploy → GSC URL Inspection |
| **Tue** | Dev.to | Syndicate adapted version; **canonical = `https://agentgovern.ai/news/[slug]`** |
| **Tue** | LinkedIn | Founder post (3–5 short paragraphs) → link local news URL |
| **Tue–Wed** | X | Thread (5–7 posts) → final post links local news URL |
| **Fri** | GSC | Check impressions on news URL + related guide |

Alternate Tuesdays: Dev.to **incident post** (existing `docs/devto/week-NN`) canonical → **guide** URL. News Mondays take priority when regulatory/privacy news is timely.

---

## Local publish checklist (Monday)

```
□ Draft in content/news/[YYYY-MM]-[slug].md
□ Frontmatter: title, description, published, category, tags, relatedGuide
□ npm run build (verify /news and /news/[slug])
□ Deploy agentgovern.ai
□ Add /news/[slug] to sitemap (auto via listNewsSlugs)
□ GSC → URL Inspection → Request indexing
□ IndexNow ping (when live)
□ Create docs/distribution/out/[slug]/ syndication pack (below)
```

---

## Syndication pack (per article)

Create folder: `docs/distribution/out/[slug]/`

| File | Purpose |
|------|---------|
| `devto.md` | Shorter Dev.to version; frontmatter `canonical_url: https://agentgovern.ai/news/[slug]` |
| `linkedin.md` | 3–5 paragraphs + bullet checklist + link |
| `x-thread.md` | 5–7 tweets; tweet 1 = hook; last = link |
| `backlinks.md` | Track where posted + URLs for ledger |

---

## Dev.to syndication rules

- **canonical_url** in frontmatter → **always** the local news URL for news pieces
- First paragraph: "Originally published on [agentgovern.ai](url)"
- End with link to related **guide** + demo (internal link equity)
- Tags: `ai`, `security`, `privacy`, `microsoft` (pick 4)
- Do **not** set Dev.to as canonical when local version exists

---

## LinkedIn rules

- Voice: compliance / IT leader speaking to peers — not developer infrastructure
- Hook in first 2 lines (visible before "see more")
- One concrete checklist (3–5 bullets)
- Single CTA link: **local news URL**
- Optional second link in comment: related guide or demo
- No engagement bait; no "thought leadership" filler

---

## X (@agentgovern) rules

- Thread format for news (5–7 posts)
- Post 1: the news hook in one sentence
- Posts 2–5: what changed / what to verify / one example
- Final post: full URL to **local news** (not Dev.to)
- Pin thread if regulatory news; attach demo clip only when incident-related

---

## Backlink strategy

**Primary (you control):**

| Source | Links to |
|--------|----------|
| Dev.to | Local news (canonical) |
| LinkedIn | Local news |
| X | Local news |
| Hashnode | Dev.to or local (prefer local canonical) |

**Secondary (monthly targets):**

- AlternativeTo profile → agentgovern.ai
- Product Hunt launch → agentgovern.ai/news + demo
- Founder posts on FetchSandbox/rawreply Dev.to → one contextual link when AI + compliance intersect
- Reddit reply-first → link **guide** or **news** only when directly helpful (no spam)

**Internal linking (on site):**

- Every news article → one related guide (`relatedGuide` frontmatter)
- Guides → `/news` when relevant update exists
- Dev.to syndication → link guide in body (second backlink path)

---

## Ledger updates (required)

After each multi-channel publish, update `/Users/raj/promo/content/gtm-content-ledger.md`:

| Field | Example |
|-------|---------|
| Local | `Built` → `Deployed` → GSC submitted date |
| Dev.to | `Posted` + Dev.to URL |
| LinkedIn | `Posted` + LinkedIn URL |
| X | `Posted` + thread URL |
| Measured | GSC impressions/clicks after 7 days |

---

## Metrics

| Signal | Good month 1 |
|--------|----------------|
| News URLs indexed | 2+ |
| Dev.to views per post | 100+ |
| GSC impressions on news + guides | 200+ combined |
| Referring domains | 2+ (Dev.to + one other) |
| Clicks to demo/waitlist | track via UTM later |

---

## File map

| Path | Role |
|------|------|
| `content/news/*.md` | Local news source |
| `app/news/` | Index + article routes |
| `docs/devto/` | Weekly incident posts (canonical → guides) |
| `docs/distribution/out/` | Per-article syndication packs |
| `docs/distribution/multi-channel-playbook.md` | This file |
