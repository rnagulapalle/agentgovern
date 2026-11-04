# LoopLabs SEO, AEO and GTM review — October 21, 2026

Status: measured audit and proposed execution sequence. Saved locally; this document does not change production. Public web release last verified as 2159c405. No content, indexing request, external post or private outreach was submitted during this audit.

## Measured baseline

Authenticated Search Console, sc-domain:looplabs.run, Web report ending October18:

- October12–18: 0 clicks, 22 impressions, 0% CTR, aggregate average position30.5. This is not the rank of an individual keyword.
- Selected three-month report actually displays September29–October18: 1 click,133 impressions,0.8% CTR,average position34.7. No comparable prior-period trend established in this audit.
- Healthcare copilot landing page44 impressions and insurance35, both0 clicks. The guides index has the single click,6 impressions. Homepage16 impressions; action/execution/output article5; permissions/approval/recovery article4.
- Visible recent queries include healthcare/copilot language; “ai agent control plane” has2 impressions and “looplabs”1 in the prior captured seven-day query view. Query anonymity and multiple page appearances mean query/page totals need not equal site totals.
- 35 indexed URLs;22 excluded URLs. Exclusions are10 noindex,3 redirects,2 robots-blocked,1 historical404,5 crawled/unindexed,1 discovered/unindexed. The ten noindex and two blocked URL lists were not inspected individually; their correctness remains unverified.
- All five crawled/unindexed examples are non-article resources: three Open Graph images, one font, feed.xml. Do not count them as five failing articles or request indexing for them.
- The one discovered/unindexed article is /blog/2026-09-30-what-is-an-agent-control-plane. Fresh HTTP200; investigate internal links and URL inspection before any one-time submission.
- Historical404 is /$, crawledOctober3. Do not redirect arbitrary junk paths to the homepage. Audit generated/internal links for the exact malformed URL before deciding a fix.
- One indexed-but-robots-blocked URL is /control-plane/actions?workflow=discounts. Keep authentication and private workspace exclusions. Review a deliberate noindex/removal strategy; robots blocking alone does not prove deindexing. Never open private data to crawlers to clear a report.
- Fresh curl requests: homepage, robots.txt, sitemap.xml, category article and new taxonomy article returned200. Sitemap parses as36 unique URLs, including the new article. Homepage has one H1 and self-canonical. Python urllib requests returned403 while curl succeeded; this client-dependent result does not establish a Googlebot block. Verify actual URL-inspection crawl before assigning cause.
- Core Web Vitals field data unavailable, not passed. Mobile performance and full sitemap-URL crawl remain unmeasured.

Authenticated PostHog observation from this morning, Last28days:152 visitors,639 views,229 sessions; contact-sales8 visitors/11 views; Google3 visitors/14 views; YouTube organic_video campaign25 visitors/25 views, plus channel2/2. Founder/QA exclusion was not independently verified in Web analytics. Most Growth dashboard funnel tiles stayed loading. These are not independent buyers or confirmed calls. No fresh calendar attendance/qualification observation; current commercial outcomes unknown.

AEO: October19 fixed benchmark recorded30 question responses per four engine families, with no LoopLabs product mention observed.125 stored rows include recovery/setup observations; differing settings and incomplete source inventories prevent a comparable citation-share score. Do not call this zero visibility across all AI engines or rerun daily.

Evidence: /Users/raj/.codex/looplabs-research/2026-10-21-seo-audit/ and /Users/raj/.codex/looplabs-research/2026-10-21-nightly-growth/measurement.json.

## Diagnosis

Search visibility is early and weak. The most visible legacy pages address broad healthcare/insurance copilot intent, whereas current original proof is customer operations and consequential agent actions. This mismatch is observed; it is not proof of a penalty, a technical ranking defect or a winning replacement query. Low CTR at this volume/position does not establish a title problem. Do not delete legacy pages or mass-change titles from this sample.

Technical foundations are partly demonstrated: public pages accessible, canonical and sitemap present,35 indexed URLs. Indexing growth alone is not qualified discovery. The new LangChain/LangGraph/Deep Agents article first publishedOctober21 cannot be evaluated from data endingOctober18.

Deployed AWS READY runtimes and declared roles are an inventory, not successful workflow scenarios. Do not turn24 workflows into24 unsupported SEO claims. Use actual per-request actor, policy, approval and provider evidence with limitations.

## Four-week sequence, not a publishing quota

1. October21–25 — engineering and existing-page improvement. Inspect the unindexed category article and private-page indexing issue; audit internal links from homepage/platform/guides to existing relevant proof. Finish authoritative booking measurement separately through existing installer/release gates; never count a CTA or accepted form as booking. Obtain two independent operator evaluations before expanding distribution. Keep the October19 weekly commercial targets:1 qualified booking and1 attended qualified conversation, explicitly targets, not actuals.
2. October26–November1 — first narrow proof asset, conditional on demand/claim gate. Candidate: “What should a cancellation agent do when an exception needs manager approval?” Audience: customer-operations workflow owner. One action: cancel an agreement; one failure: proceeding without the required exception decision. Show the existing recorded cancellation path, role attribution, exact decision and separate refund continuation. Identify test-mode transactions and workflow-owned controls; do not imply LoopLabs enforces every native rule. Add a short annotated video/transcript and one relevant founder-conversation CTA.
3. November2–8 — improve an existing refund page rather than duplicate its intent. Candidate query: “AI refund agent timed out: how to check before retrying.” Use bounded provider-twin timeout/reconciliation proof, clearly separated from native Stripe TEST evidence. Hold publication if same-request timeout/effect/idempotency proof is absent. Explain what can remain unknown; do not claim live-money safety.
4. November9–15 — improve /stale-crm-contact-agent-blocked using observed operator objections. Candidate query: “AI agent sends email to an outdated CRM contact.” Show a held send and source freshness boundary from the bounded CRM/message proof, labeled twin/service scope. If interviews establish native CRM controls suffice, stop this experiment rather than publishing another page.

The taxonomy article supports category comprehension and internal navigation. Review its exact pageNovember4; add no adjacent “agent types” article until observed queries justify a distinct intent.

All proposed queries are hypotheses, not measured keyword volume. Candidates remain gated: before drafting, record primary-source SERP intent, independent pain, distinct existing-page overlap, proof and conversion scores. Current cancellation buyer-pain/conversion evidence is insufficient for an autonomous publication pass; user-requested planning is not a declaration that the gate passed.

## Article and AEO structure

Use one customer problem, one action and one failure mode. Answer the question immediately, define terms plainly, show the decision path and original scoped proof, distinguish observed from missing evidence, link primary documentation and include concise genuine FAQs. Link related existing pages and one canonical proof destination. Article/schema metadata must match visible content. No fabricated customer story, endorsement or model-agent autonomy. Google says normal SEO foundations apply to AI features; no special AI files or schema guarantee inclusion.

## PR and distribution

After proof and conversion gates, adapt one canonical proof into a founder-owned public post and a short demo clip with source-specific UTMs. Use a concrete, verifiable engineering lesson such as separating approval from verified outcome. Record distribution URL and relevant replies. Pitch a method or result to a narrowly relevant practitioner/newsletter only once independent evidence supports it; prepare individualized pitches, but private recipients require authorization. No paid links, synthetic engagement, mass posting or canceled Product Hunt activity.

## Review and stop rules

At14days, check technical indexability, impressions/query relevance and proof engagement; absence of traffic is not a statistical verdict. At28days, compare equal GSC windows by page/query, branded vs nonbranded, source and device. Report sample sizes. Verify PostHog founder/test filters before funnel claims. Track visit → relevant proof → accepted sales request → calendar-confirmed booking → attended qualified call → bounded pilot separately.

Qualification requires observed ownership, recurring pain/consequence, current stack/workaround and willingness to explore a bounded pilot. Unknown remains unknown. Targets for the next four weeks:2 confirmed qualified bookings and1 attended qualified call; no rankings or bookings promised. If two independent evaluations identify no unmet control gap, stop the proposed positioning/asset and revise the hypothesis. If an asset gets impressions but mismatched intent, improve/consolidate it before adding another. If indexed but no relevant discovery after28days, revisit demand/distribution and proof instead of increasing volume.

Primary guidance: https://developers.google.com/search/docs/appearance/ai-features and https://developers.google.com/search/help/crawling-index-faq . Google guidance does not establish performance on other answer engines.


## Recurring execution contract — October21 update

Raj explicitly requested recurring execution, reevaluation and improvement, plus use of his voice through RawReply. Existing four ACTIVE heartbeat jobs were updated through the Codex automation tool; schedules and notification settings were retained. No duplicate job was created.

- Nightly01:30 Pacific: advance one due execution action with actual evidence.
- Watchdog04:30 daily: verify action evidence and recover/dispatch incomplete steps.
- Account follow-through09:00 daily: recover account-dependent measurements or voice-stage access without duplicate submissions.
- Monday00:15: compare dated results, revise the plan and select the next measurable action.

### SEO scorecard: targets, not actuals

By the November18 review, the latest fully reported GSC seven-day window should target100 impressions and5 clicks, from baseline22 impressions/0 clicks onOctober12–18. Also target20 nonbranded impressions for agent action controls, approvals, cancellation/refund or recovery queries. Establish the actual relevant-query baseline first and retain a consistent documented classification; it is currently unmeasured. Aggregate position30.5 is a baseline diagnostic, not a promised keyword rank. These are stretch goals, not forecast results.

Weekly compare full seven-day windows and28days versus prior28 when available; record exact dates, query/page aggregation and lag. ReviewNovember4 andNovember18. Record actuals, absolute change, relevance and sample size; percentages from zero are undefined. Preserve original targets if revised, with the date and reason. Do not hide a missed target by lowering it. Track proof engagement and the separate2 qualified booking/1 attended-call four-week targets without counting founder tests or anonymous visits as qualified demand.


## November 4 checkpoint and revised priority

The [dated checkpoint](2026-11-04-seo-checkpoint.md) supersedes the opening historical deployment/status for current measurement only. Latest full reported Web October27–November2 versusOctober20–26:158/110impressions,3/0clicks,relevant-query-v1 12/8. Original November18targets100impressions/5clicks/20relevant impressions remain unchanged; only aggregate impressions meet the current threshold. Equal prior28-day history is unavailable, not zero. Taxonomy is indexed with24/14page impressions and0clicks. Consolidate it; add no variants.

Next: exact changed-payload refusal and accepted-email/timeout evidence using the existing operator worksheet and execution owner; privacy-preserving current proof capture remains issue156's engineering prerequisite. The39/0fixed-window intent preview is not confirmed bookings; qualified bookings/attendance remain unknown. PrivateURL Google exclusion is still partial with lastcrawlOctober9 despite current hosted noindex/sign-in. Continuecategorylinks; improveproof/capture; consolidateexistingassets; stopduplicatevariants/paidrenewal/canceledPH. No application deployment or new indexing request in this review.
