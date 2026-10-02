# LoopLabs first Friday growth baseline

Observed October 2, 2026, during the 01:31 PDT scheduled run. This is an internal measurement record, not a customer-success claim. No site code changed.

## Search and crawl

Authenticated Search Console property: `sc-domain:looplabs.run`.

| Surface | Window / result | Interpretation |
| --- | --- | --- |
| Performance | Default last 3 months; 0 clicks, 0 impressions; no query rows; last update about 8.5 hours before inspection | No observable Google discovery yet. Displayed average position 0 means no measured ranking, not rank zero. |
| Page indexing | Processing data | Indexed URL coverage is not yet measurable. |
| Sitemap | Submitted September 30; read October 1; Success; 33 discovered pages | Accepted discovery feed, not proof that all pages are indexed. |
| About URL follow-through | October 1 operational journal records successful live test and indexing request | Do not repeat the submission unless inspection reveals a new problem. |

Live homepage, About page, and sitemap returned HTTP 200 using curl. The live sitemap contains 33 URLs including `/about`. Python urllib received HTTP 403 on the homepage; curl succeeded, so that isolated client response is not evidence of a site outage.

## PostHog acquisition baseline

[LoopLabs web analytics](https://us.posthog.com/project/638636/web): default last 7 days, September 25–October 2, UTC, all domains, test-account filtering off.

| Metric | Observed |
| --- | ---: |
| Visitors | 42 |
| Pageviews | 102 |
| Sessions | 55 |
| Average session duration | 3m 50s |
| Bounce rate | 67% |
| Desktop visitors / views | 29 / 82 |
| Mobile visitors / views | 13 / 20 |
| Direct visitors / views | 40 / 88 |
| Organic search visitors / views | 2 / 13 |
| Organic social visitors / views | 1 / 1 |

Visitor counts by source are not additive. PostHog's two organic-search visitors do not establish Google traffic; referrer classifications, other search engines, and internal testing can differ from Search Console.

Top paths: homepage 40 visitors / 63 views; `/control-plane` 6 / 13; `/about` 4 / 5; `/control-plane/workflows` 4 / 4; `/guides` 2 / 3. These are descriptive counts, not proof of qualified buyer interest.

## Product-proof and conversation funnels

[Visitor to product proof](https://us.posthog.com/project/638636/insights/FjJpU5YH): September 2–October 2 UTC, unique users, sequential steps, seven-day conversion window. Inspected the definition: `$is_test != true`; general internal-user filtering off.

| Step | Persons | Share of entrants |
| --- | ---: | ---: |
| `site_page_viewed` | 33 | 100% |
| `product_tour_cta_clicked` | 3 | 9.09% |
| `product_tour_started` after the CTA | 3 | 9.09% |
| `run_simulated` | 1 | 3.03% |
| `recovery_step_completed` | 0 | 0% |

[Visitor to founder conversation](https://us.posthog.com/project/638636/insights/h2sNJQ70): same displayed 30-day window: 33 entrants → 5 tour starts → 0 `demo_booking_clicked`. Five versus three tour starts reflects the extra CTA prerequisite in the proof funnel, not a contradictory count. No booked-meeting or qualified-conversation conclusion is available from this insight.

### Measurement limitations

- This is the first baseline. There is no comparable prior weekly sample for growth or decline.
- Founder and QA traffic may remain: `instrumentation-client.ts` marks `$is_test` only when `analytics_debug=1` is present. Production reviews without that flag are not reliably excluded retrospectively.
- Future automated production QA must enter with `?analytics_debug=1` (or append it using `&`); retain the test-session marker. Customer journey measurements must use an independently clean session.
- `product_tour_started` currently fires on overview entry. It is not completion or proof comprehension.
- In `components/control-plane/provider.tsx`, `run_simulated` and recovery events are captured before reducer validation. `recovery_step_completed` includes contain, plan, and reconcile attempts. These are interaction signals, not verified successful recovery. Future outcome instrumentation must derive accepted transitions and test rejected/stale/replayed actions.
- `demo_booking_clicked` measures CTA intent. It does not prove a meeting was booked or that a lead is qualified.
- Web analytics and saved funnels use different windows and filters. Never divide counts across those surfaces.
- Error tracking is not configured. Absence of reported frustrating pages is not a clean runtime-health result.

## Product Hunt launch audit and correction

[Authenticated draft](https://www.producthunt.com/posts/looplabs/edit) was unscheduled. Its old tagline claimed control of every production action; its description implied shipped one-agent/multi-agent workflow building. Those claims exceed the [claim matrix](../LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md).

Saved and reloaded the existing draft with:

**Tagline:** Explore agent action controls, approvals, and recovery

**Description:** LoopLabs is an early-stage control-plane prototype for workflows involving people and AI agents. Explore browser-local demos of roles, permissions, policy checks, approvals, execution state, output checks, and reconciliation. We work with design partners to scope one governed workflow. The current tour uses simulated data; live integrations and a self-service builder are not yet available.

**Launch link:** `https://looplabs.run/?utm_source=producthunt&utm_medium=referral&utm_campaign=launch_2026_10`

Verified “All changes saved successfully,” then reloaded and checked persisted text. The draft remains unscheduled. No public post or invitation was sent.

Remaining launch gaps: video field empty; makers list only shows Raj, not Pratibha; existing gallery needs a claim review. The intended Sunday is October 4, 2026. Morning account follow-through should locate the already-uploaded LoopLabs video in the authenticated YouTube account, verify its public/unlisted availability and claim accuracy, and attach that exact URL to the existing draft. Do not reupload or create another launch. Resolve Pratibha's exact public Product Hunt identity before adding attribution; do not guess or send private invitations. Scheduling follows the final media/claim check.

## Research and decision

[Convey's Samsara story](https://convey.dev/customers/samsara) describes a taught recurring Excel/ERP reconciliation process, and its [Strategus story](https://convey.dev/customers/strategus) describes operational reporting. These are vendor-reported examples, not independently verified outcomes or validated LoopLabs demand. They support researching bounded recurring processes rather than promising arbitrary prompt-to-production automation.

[Stripe's idempotency documentation](https://docs.stripe.com/api/idempotent_requests) describes replaying the first response, including failures, parameter matching, and key retention limits. A stable request key alone cannot justify a universal exactly-once or recovery guarantee; external readback and connector-specific semantics remain part of the proposed LoopLabs proof.

**Decision: improve measurement and launch truth before expanding content.** The largest observed numerical drop is before the product-tour CTA, but 33 potentially contaminated entrants cannot establish a UX cause. The strongest ICP remains a hypothesis: RevOps/customer-operations teams with one bounded system-of-record write.

**Next experiment:** Observe five target operators using the prepared CRM workflow; distinguish entering the tour, an accepted policy decision, recovery attempt, successful local reconciliation, and founder-conversation intent. Compare pain language and task comprehension. Do not call browser-local proof production enforcement. Fix success-versus-attempt events with adversarial tests before interpreting recovery conversion.

The 30-prompt AEO results CSV remains header-only. No answer-engine benchmark was performed this run; citation share and description accuracy are unavailable, not zero. Complete a fixed-prompt baseline with recorded engine, date, answer, cited URL, and accuracy before making AEO visibility claims.
