# LoopLabs SEO, AEO, GTM, and PR operating plan

**Operating window:** September 30–November 24, 2026  
**Primary objective:** Make LoopLabs discoverable and credible when a buyer asks how to build agent workflows, control agent actions before execution, approve high-risk actions, audit outcomes, or recover uncertain state.

## What success means

The goal is not raw traffic. The goal is qualified discovery followed by product proof.

1. A buyer finds a LoopLabs page for a specific problem.
2. The page answers the question with original evidence and a precise point of view.
3. The buyer enters the guided product tour or watches the relevant proof.
4. The buyer starts a founder conversation or joins early access.

Google and answer engines do not guarantee placement. Our controllable goal is to become a source worth retrieving and citing. We will earn that through crawlability, original evidence, clear product proof, founder expertise, and independent mentions.

## Positioning and query map

LoopLabs owns one category statement:

> Build agent workflows, control what agents may execute, and reconcile state when outcomes are uncertain.

We organize discovery around five buyer problems rather than publishing broad AI-governance articles.

| Buyer problem | Primary query family | Product proof |
|---|---|---|
| An agent can take an unsafe action | AI agent action control; stop AI agent tool calls | allow, hold, block decisions |
| A high-risk action needs a person | AI agent approval workflow; human approval for AI agents | approval queue and recorded decision |
| Nobody can prove what happened | AI agent audit trail; agent action receipt | run timeline and audit export |
| A retry may duplicate an external effect | AI agent state reconciliation; safe agent retry | version-aware recovery sequence |
| Teams need repeatable work, not chat sessions | build AI agent workflows; governed agent workflow | prepared workflow and guided run |

The initial commercial wedge is operations teams governing actions that affect money, external parties, CRM records, tickets, and regulated data. Every asset follows the repository research gate: one industry, one failure mode, and one action.

## Baseline on September 30

- Google Search Console property is verified for `looplabs.run`.
- `sitemap.xml` was submitted successfully and reports 32 discovered URLs.
- Search Console is still processing its first performance and indexing data.
- Googlebot, OAI-SearchBot, and GPTBot receive HTTP 200 on the homepage.
- The site has canonical URLs, structured data, RSS, robots.txt, sitemap.xml, and llms.txt.
- PostHog measures acquisition, landing pages, product-tour progress, proof interactions, and founder-conversation clicks.
- No reliable non-branded ranking or AI-citation baseline exists yet. Week 1 establishes it.

## Weekly scorecard

Record this every Friday in the GTM ledger. Compare seven-day periods; do not react to a single day.

### Discovery

- Valid indexed URLs and excluded URLs in Search Console
- Non-branded impressions, clicks, CTR, and average position
- Queries entering positions 1–10, 11–20, and 21–50
- Referring domains and earned editorial mentions
- Video impressions and clicks when Search Console exposes them

### Answer-engine visibility

- Citation rate across a fixed 30-prompt benchmark
- Recommendation rate: LoopLabs named as a product, not only cited as a source
- Accurate-description rate: answer correctly describes build, control, and reconcile
- Share of cited sources versus the five closest competitors
- AI referral sessions and engaged product-tour sessions

Run the same prompts from [`docs/research/looplabs-aeo-benchmark.csv`](research/looplabs-aeo-benchmark.csv) weekly in Google AI experiences, ChatGPT search, Perplexity, and Gemini. Record results in [`docs/research/looplabs-aeo-weekly-results.csv`](research/looplabs-aeo-weekly-results.csv). Use a clean session where possible, record the exact prompt, date, answer, cited URLs, position, and whether the product description is accurate. Never manufacture mentions or use personalized sessions as evidence.

### Activation

- Organic and AI-referral visitors
- Visitor → product tour
- Tour start → all four tour sections viewed
- Tour completion → founder-conversation click
- Founder-conversation click → confirmed booking, once the booking webhook exists

### Content quality

- Every new page has a named author or reviewer, first-hand evidence, updated date, and claim-to-demo link
- Every externally distributed asset earns a relevant visit, discussion, citation, or backlink; volume alone is not success
- Remove or consolidate pages with duplicated intent instead of producing sitemap filler

## Week 1 — Baseline, indexing, and launch readiness

**Dates:** September 30–October 6  
**Goal:** Make every priority surface crawlable, measurable, and ready to convert Product Hunt and search traffic.

- Export the first Search Console indexing baseline after processing completes.
- Inspect and request indexing for the homepage, product tour, guides, definitive control-plane article, and five highest-value failure-mode pages.
- Validate canonical tags, status codes, rendered headings, structured data, video poster/transcript, mobile experience, and Core Web Vitals.
- Confirm Cloudflare does not challenge Googlebot, Bingbot, or OAI-SearchBot.
- Establish the fixed 30-prompt AEO benchmark across the five buyer problems.
- Add founder/reviewer attribution, an About surface, editorial standards, and a claim-verification policy to strengthen entity and experience signals.
- Build a launch press kit: one-sentence description, founder bios, logo files, four product screenshots, demo video, claim sheet, and contact details.
- Use tagged Product Hunt, LinkedIn, Dev.to, email, and founder URLs so PostHog can compare sources.

**Exit criteria**

- Sitemap remains successful with no accidental noindex or canonical conflicts on priority pages.
- All 10 priority URLs have an inspection record and index status documented.
- The 30-prompt AEO baseline is saved.
- Every launch link has a source-specific UTM.
- Product Hunt visitors can reach a relevant proof within one click.

## Week 2 — Define the category with original product proof

**Dates:** October 7–13  
**Goal:** Become the clearest source for what an agent control plane does at the action boundary.

- Upgrade the definitive “What is an agent control plane?” article with an original build/control/reconcile model, architecture diagram, glossary, limitations, and links to exact demo states.
- Publish one narrow comparison: prompt guardrails versus action control, grounded in a single attempted external action.
- Create indexable, captioned proof for the demo video: transcript, chapter links, screenshots, and the exact behaviors that are simulated.
- Publish one founder-led technical note explaining why an unknown outcome must be reconciled before retry.
- Distribute one adapted article to Dev.to with LoopLabs as canonical, one founder LinkedIn post, and targeted replies in two relevant discussions.
- Pitch five narrowly selected agent infrastructure or security newsletters with the original action-control framework, not a generic launch announcement.

**Exit criteria**

- Three category pages provide unique evidence and link to the relevant product-tour state.
- At least two independent domains mention or link to LoopLabs.
- First non-branded impressions appear for at least five target queries, or Search Console records the pages as indexed if impressions lag.
- Product-tour start rate from organic and referral visits has a measurable baseline.

## Week 3 — Capture high-intent pain searches

**Dates:** October 14–20  
**Goal:** Match concrete buyer pain to a concrete LoopLabs decision and recovery path.

- Publish or materially improve three pages from the research matrix:
  - stale CRM contact → hold external email;
  - refund above authority → require approval;
  - missing action receipt → block tool execution.
- Give each page a direct answer, incident sequence, decision table, proof screenshot, implementation boundary, FAQ, and one product-tour CTA.
- Add contextual internal links from category articles to these failure-mode pages and back to the definitive category page.
- Add a downloadable “Agent Action Control Readiness Checklist” based on the real control model.
- Conduct five buyer interviews or founder conversations. Record their exact vocabulary and objections in research notes; update page language only when evidence supports it.
- Start targeted outreach to ten practitioners who write about agent security, identity, workflow reliability, or human approval.

**Exit criteria**

- Three pain pages pass the claim-to-demo audit and are submitted for indexing.
- At least 25% of organic/referral visitors reach product proof, once the sample reaches 40 visitors.
- At least three new buyer phrases or objections are captured from real conversations.
- At least one third-party expert responds, contributes, or cites the work.

## Week 4 — Publish evidence that others can cite

**Dates:** October 21–27  
**Goal:** Replace marketing claims with a small, reproducible evidence asset.

- Run and publish a transparent benchmark of 20–30 agent-action scenarios across allow, hold, block, approve, and reconcile outcomes.
- Document the test inputs, policy version, expected result, observed result, limitations, and downloadable data.
- Create a visual report and a two-minute walkthrough that reporters and practitioners can embed or cite.
- Issue a focused data story to 15 relevant reporters, newsletters, podcasts, and analyst writers. Lead with the result and methodology.
- Hold one public demo or small roundtable on unsafe retries and action reconciliation; publish the recording and transcript.
- Review Search Console query/page pairs and rewrite titles or descriptions only where impressions exist and CTR is weak.

**Week 4 outcome targets**

- 80% or more of the 10 priority URLs indexed.
- 100–500 cumulative non-branded impressions is a healthy early range; record the actual result without treating the range as a promise.
- Five or more non-branded queries visible in Search Console.
- Three independent referring domains, with at least one editorial mention.
- AEO citation in at least 2 of 30 benchmark prompts is an early signal.
- At least one qualified founder conversation attributed to organic, AI referral, Product Hunt, or earned media.

## Week 5 — Build one vertical authority cluster

**Dates:** October 28–November 3  
**Goal:** Win a narrow use case before expanding the category.

- Select the vertical using evidence from weeks 1–4: query impressions, tour engagement, founder conversations, and Product Hunt feedback.
- Default wedge if evidence is inconclusive: RevOps/vendor operations controlling CRM writes and external communication.
- Publish one vertical hub, two failure-mode pages, one workflow template, and one demo path that all use the same vocabulary and proof.
- Secure two subject-matter reviews or quotations from operators in that vertical.
- Pitch the vertical story to its trade publications and practitioner newsletters.

**Exit criteria**

- One complete query-to-proof cluster exists for a single ICP.
- At least two pages enter the top 50 for a relevant non-branded query, subject to Search Console data availability.
- The selected vertical generates a founder conversation, a repeat visit, or materially higher tour completion than site average.

## Week 6 — Add customer evidence and evaluation content

**Dates:** November 4–10  
**Goal:** Help an active evaluator understand when LoopLabs fits and what production proof still requires.

- Publish the first named design-partner story, or an anonymized implementation diary if permission is unavailable.
- Publish an honest evaluation guide: action control versus observability, identity, model gateways, and prompt guardrails.
- Add a security and architecture page with deployment boundary, data handling, supported proof, and current limitations.
- Add authoritative booking completion tracking through the scheduling webhook.
- Ask five customers or practitioners for factual feedback, not promotional testimonials.

**Exit criteria**

- One first-hand implementation artifact is live.
- Founder-conversation conversion is measurable end to end.
- At least one external expert or customer links to, quotes, or shares the evidence.
- AI answers describe LoopLabs accurately in at least 80% of appearances.

## Week 7 — Compound authority through PR and partnerships

**Dates:** November 11–17  
**Goal:** Earn corroboration from sources that search and answer engines already trust.

- Package the benchmark, vertical evidence, and founder point of view into three distinct pitches: security, operations, and agent infrastructure.
- Pursue guest appearances, expert quotes, podcast discussions, community demos, and integration-partner content.
- Publish one joint technical walkthrough with a relevant tool, identity, workflow, or observability partner.
- Refresh the best-performing article with Search Console query language, new evidence, and clearer proof links.
- Reclaim unlinked brand mentions and ensure Product Hunt, YouTube, founder profiles, and social profiles use consistent entity descriptions and links.

**Exit criteria**

- Five or more quality referring domains in total.
- Two earned editorial or expert citations in total.
- AI/referral traffic has a measurable engaged-session rate and tour-start rate.
- At least one priority query reaches positions 11–20, treated as a directional goal rather than a guarantee.

## Week 8 — Consolidate winners and set the next quarter

**Dates:** November 18–24  
**Goal:** Stop weak work, strengthen proven clusters, and choose the next 90-day wedge.

- Compare every query cluster on impressions, rank movement, qualified visits, tour completion, and founder conversations.
- Merge or redirect duplicated intent; update winners with new screenshots, data, expert review, and internal links.
- Re-run all 30 AEO prompts and publish an internal citation/share-of-answer report.
- Decide which vertical, failure mode, and channel receive 70% of the next quarter's effort.
- Prepare the next original benchmark or customer proof release.

**Week 8 outcome targets**

- 90% or more of priority URLs indexed, excluding intentional noindex product workspace routes.
- 1,000–3,000 cumulative non-branded impressions is a useful validation range for a new niche domain; quality and trend matter more than hitting the range.
- 10 or more non-branded queries visible, with three pages in the top 20.
- Six quality referring domains and three editorial/expert mentions.
- LoopLabs cited in at least 15% of the fixed AEO prompt set and named as a relevant product in at least 10%.
- Three qualified founder conversations from organic search, AI referral, earned media, or partner sources.

## Content and PR rules

- Publish one strong local asset per week. Update a proven page before adding a weak page.
- Every claim links to a demo state, test result, primary source, or clearly labeled roadmap item.
- Every article includes a useful answer before the product pitch.
- Original screenshots, diagrams, benchmark data, transcripts, and implementation lessons are preferred over generic summaries.
- External distribution is adapted to the audience. The LoopLabs page remains canonical.
- PR outreach is researched and individual. Do not mass-email reporters or buy links.
- Do not create dozens of keyword variants, fake comparisons, unsupported customer claims, or synthetic forum mentions.
- `llms.txt` is maintained for clarity, but it is not treated as a Google ranking mechanism.

## Friday operating review

Every Friday:

1. Export Search Console pages and queries for the last 7 and 28 days.
2. Review PostHog acquisition → proof → founder-conversation funnels by source and landing page.
3. Run the fixed AEO benchmark and record citations and description accuracy.
4. Update the GTM ledger with shipped, indexed, distributed, cited, and converted status.
5. Select one page to improve and one evidence asset to ship next week.
6. Record one decision: continue, improve, consolidate, or stop.

This document is the standing LoopLabs GTM/SEO/PR plan. Future content and distribution work should use these goals, the repository research gate, and the Friday scorecard unless product evidence changes the strategy.

## Guidance behind the plan

- [Google: optimizing for generative AI features](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide)
- [Google: creating helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Google: combining Search Console and analytics data](https://developers.google.com/search/docs/monitor-debug/google-analytics-search-console)
- [OpenAI: publishers and developers FAQ](https://help.openai.com/en/articles/12627856)
