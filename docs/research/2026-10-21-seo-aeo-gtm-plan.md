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

### Raj's voice through RawReply

Integration references checked: /Users/raj/ember/connectors/rawreply-python/README.md and src/rawreply/client.py plus chat.py. The hosted connector supports RawReplyClient.new_chat(project_id=...) and ChatSession.send_message/run_until_reply, using an operator-issued bearer identity. Project context/memory is important; verify Raj's actual LoopLabs project rather than inventing an ID or assuming generic anti-slop wording is his voice. Existing authenticated browser chat is an allowed fallback. No token was present in the execution environment at setup; no live generation or voice verification is claimed.

For public drafts, send a sanitized public brief, supported claims and public citations through the verified account/project. Keep private prospect data, analytics, raw request logs and secrets out of the request. Check the generated wording against proof, preserve limitations and remove invented personal experience. Store a sanitized generation receipt. If authentication/project access is unavailable, hold the affected public draft and queue that exact stage while continuing safe SEO work. Do not extract cookies/browser tokens, alter the Ember service, create a new project or accept legal terms to bypass a blocker.


## First execution receipt — October21

Correction to aggregate indexing interpretation: exact URL inspection now says the category article is on Google and indexed; last crawlOctober15 by Googlebot smartphone, fetch successful, indexing allowed, Google-selected canonical is the inspected URL. No indexing request submitted. Exact private Actions URL remained indexed despite robots; its existing anonymous sign-in page declares noindex. Submitted one exact-URL temporary removal, nowProcessing request; permanent removal remains unproven.

Candidate5c4213d adds Guides starting links to three existing articles, uses public/platform overview CTAs in Guides/shared SEO shell, and corrects the category article CTA. Six focused tests, affected ESLint, TypeScript and diff checks passed; five public link destinationsHTTP200. Static SSR desktop preview is available on the Mac; native local server refused startup without tenant installation config, which was not bypassed. GitHub push failed for missing credentials, so fullCI and production deployment remain pending. This is partial execution, not a ranking or traffic improvement. Evidence:/Users/raj/.codex/looplabs-research/2026-10-21-seo-first-task/receipt.json


### GitHub credential recovery — October21

Raj confirmed the existing GitHub token is configured in /Users/raj/.zshrc. Source that file in the release shell with tracing disabled and output suppressed before checking authentication. This recovered rnagulapalle CLI access and pushed PR130. Do not print environment files or token values, and do not ask Raj to log in again without first checking this existing configured environment. Use the gh git credential helper for the authenticated push.


### Public discovery patch deployed — October21

Existing .zshrc credential recovered GitHub access. PR130 merged and deploy.sh --profile control-demo activated14ee612663fb8768a179e9a4794f3ba24ba8cc68, image29b94fee3d55b9c7708892c8f396d00078f10fa7e8826035aa4085a231830179. CI39609067482 all3jobs passed,3458tests/379files. Eleven production HTTP/auth responses and assertions passed; actual Chrome navigation Guides→categoryarticle→public/platform succeeded. Desktop width1312≤1321, canonical unchanged, zero main-content private-tour links and three starting articles observed. Temporary SSH rule removed and firewall restored. Public patch execution is verified; Google removal/permanent deindexing and SEO uplift remain unproven. October23 exact removal follow-up preserved. Receipt:/Users/raj/.codex/looplabs-research/2026-10-21-seo-first-task/release-verification.json


### October22 measured reassessment

Continue the narrow proof/conversion sequence; do not expand the generic content calendar. GSC matchedOct13-19vsOct6-12 shows22vs79impressions and0vs0clicks, ending before theOct21patch. Relevant visible-query-v1baseline is2vs0; output-only adjacent0vs1 and branded0vs4 retained separately. Full28daycomparison unavailable in this observation: UIlabels28days but selecteddatefields clamp to21days; do not report a28daygrowthrate. QA/founder-excluded proof funnel remains unverified. November18targets remain100impressions/5clicks/20relevantimpressions, not actuals. Bookingownerextension/directhandler now15actualPGchecks, draftPR132CIpending; composed inventory/recovery/profile/native delivery still needed. No new article or distribution warranted from this sample. Private measurement:/Users/raj/.codex/looplabs-research/2026-10-22-nightly-growth/measurement.json


### October23 scorecard and decision

MatchedGSC Web Oct15–21vsOct8–14:33vs53impressions,0vs0clicks; relevant visible-query-v1=3vs0. Category article2apex+1www impressions; no release causality inferred. Full28comparison unavailable: actual23day fields saved. Exact private Actions URL is now Temporarily removed; permanent exclusion still unproved. PostHog displayed152/639/229 with test-filter switchon but founder/QA coverage and proof funnel unverified. Confirmed qualified bookings and attended calls unknown. Preserve original November18targets. Continue existing-page internal-link/proof work; improve private exclusion and measurement; stop duplicate taxonomy variants and avoid broad new publishing. Next due: Oct26 reviewed permanent private-exclusion strategy and QA proof-funnel verification. Evidence:/Users/raj/.codex/looplabs-research/2026-10-23-nightly-growth/measurement.json. No code deployment this run.


### October23 account measurement follow-through

The two existing saved PostHog funnels now render directly. Raw proof127→7→5→4→1 and tour-to-booking-CTA127→7→2 cover displayed September23–October23UTC including partial current day. These are not matched GSC windows, independent buyers or confirmed bookings. Both saved internal/test toggles are off with separate $is_test!=true; project cohort coverage and historical founder/QA tagging remain unverified. October26 action is now precise: validate the Internal / Test users cohort and source tagging, then capture an unsaved excluded preview with exact reporting dates. Keep original targets; do not infer conversion improvement from recovered visibility. No settings change or deployment. Evidence: /Users/raj/.codex/looplabs-research/2026-10-23-account-follow-through/measurement.json


### October24 observed scorecard

GSCWebOct16–22vsOct9–15:45vs41impressions,0vs0clicks;visibleprimaryquery-v1=2vs1. Aggregateposition20.9vs46.4 is not a keyword rank or causal improvement. Full28comparison unavailable(actual24daywindows). Preserve originalNovember18targets100/5/20 as stretch targets. PostHogdisplay152/639/229, founder/QA independence unverified; qualified bookings and attendance unknown. CurrentAcme reuse gate governs proof work: evaluate existing native workflows, no new pipeline or generic article. Existing booking candidate quality prerequisites recovered; fullgatefailed92cases, separatebrowserreruns46/46 and72/72pass, Docker unavailable. No commit/deploy/publication or indexing resubmission. NextOct26:cohort/tagging preview and permanent private exclusion; accepted temporary removal not resubmitted. Evidence: /Users/raj/.codex/looplabs-research/2026-10-24-nightly-growth/measurement.json and engineering-verification.json.


## October25 Sunday scorecard and Monday handoff

GSCWebOct17–23vsOct10–16:50vs36impressions,0vs0clicks,visibleprimary2vs2,exactbrand0vs2. Query17rows17vs25impressions;page23rows59vs38,not site totals. Aggregateposition26.1vs46.1 is query-mix diagnostic. Selected28comparison actually25days each; full28unavailable. No conclusion of relevant search improvement; originalNov18targets100impressions/5clicks/20relevant retained. PostHogrolling152/639/229unchanged, audienceexclusionunverified; qualifiedbookings/attendance unknown.

Monday primary task: actual Internal/Test cohort coverage and unsaved excluded previews of existing proof/founder funnels, then exact private-page exclusion follow-up without resubmission. Booking prerequisite remains failed despite Dockerlaunch; no merge/deploy before fullgate. One unqualified self-reported approval reviewer screen reinforces testing source-evidence comprehension in existing Acme UI; no new queue/pipeline/article justified. Continue categorylinks; improve attribution/proof; consolidate native controls; stop duplicate taxonomy expansion. Existing weeklycommercialtargets remain targets with no acceptance claimed. Detailed handoff: /Users/raj/.codex/looplabs-research/2026-10-25-nightly-growth/monday-dispatch.md. Notes local/uncommitted.


## October26 weekly execution decision

AvailableWebOct18–24vsOct11–17:67vs20impressions,0vs0clicks,relevantquery-v1primary4vs2,exactbrand0vs1.20queryrows28vs10impressions;22pagerows67vs31,not site totals. Aggregateposition35.9vs26.4is query-mix diagnostic; selected28comparisonactually26days each. Business reviewOct19–25is not the fully reported search window. Preserve originalNovember18stretch100/5/20targets.

ReproducedHTTP522is now the first technical recovery: four requiredHTTPSURLs200; legacyhostlocal301does not establish activeorigin behavior. CurrentprofilehostSSHtimedout. Cloudflareaccount sign-in expressly accepts terms and awaits confirmation. No firewall/auth/DNS/redirectchange. Exact Actions temporaryremoval remainsaccepted; permanent exclusion unproved.

Internal/Test cohort605589has2people and criterionperson$internal_or_test_user=true. Unsaved excluded proof127→7→5→4→1andCTA127→7→2unchanged; savedswitchesnotchanged,historicalfounderQAcoverageunknown. No qualifiedbooking/attendance actual inferred. Monday conversion task now advances declared identity/tagging coverage and existing native proof comprehension rather than repeat the raw-funnel measurement.

See [weekly review](2026-10-26-weekly-growth-review.md) for persona,asset,distribution,targets,action dispositions andstopconditions. Local booking fullquality passed384files3519tests aftersetup correction; draftPR132commit1766fd4notdeployed,normal/runtime/nativeacceptance stillopen. Continue categorylinks; improveHTTP,attributionandexistingcancellationproof; consolidate native controls; stop duplicates.
