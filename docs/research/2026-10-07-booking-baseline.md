# October 7: restored account access and booking baseline

## Observed, not inferred

Authenticated Chrome access is restored. This supersedes the earlier locked-Mac blocker for the accounts inspected today. Private raw account evidence is stored outside Git in `/Users/raj/.codex/looplabs-research/`.

| Stage/source | Actual observation | Limit |
| --- | --- | --- |
| Search Console | Seven-day selection; chart September 29–October 4; 1 click, 15 impressions, CTR 6.7%, average position 42.7 | Lagged tiny sample; no ranking traction conclusion. |
| Search entry pages | Guides has the one observed click; healthcare and insurance pages each show five impressions | Page aggregation differs from property totals. Visible queries have zero clicks; do not assign the hidden click to a query or claim branded/non-branded attribution. |
| Indexing overview | 31 indexed, 19 not indexed | Exclusion causes not audited in this run. Not every excluded URL should be indexed; private workspace routes must stay private. |
| PostHog saved funnel | Last30days September7–October7 UTC: 102 entered, 7 tour starts, 2 booking clicks; dashboard reports 1.96% | Anonymous IDs, founder/QA contamination possible, legacy tour definitions and invitation gate. These are not bookings. |
| Accepted sales intake | Invited founder inbox says No requests yet | A separate accepted-request stage; client analytics alone is not authoritative. |
| Calendar | Correct authenticated founder account; no upcoming or unconfirmed bookings; one past October6 reservation visible | Historical reservation has unknown product attribution, pain, qualification and attendance. Do not count it as a qualified LoopLabs call. |
| YouTube recovery | Correct channel; nine public Shorts; episode10 absent | Did not upload: chooser explicitly acknowledges YouTube Terms; action-time consent is required. Quota has not been tested in this attempt. |

No qualified-call count is established. Zero current reservations and zero visible sales requests are observed; historical meeting qualification remains unknown.

## Measurement gap and next action

Inspected `components/marketing/sales-form.tsx`, `components/analytics/Analytics.tsx`, sales persistence and booking references. Success saves intake and emits `sales_request_submitted`; calendar links point to a generic founder page. The global click listener also emits booking-click events; the success CTA emits its own click event, so raw click counts may include duplicate instrumentation. No verified booking webhook or intake-to-calendar correlation receiver was found in the inspected repository.

Action `booking-baseline-20261006` is complete as a baseline with explicit gaps. New action `booking-attribution-20261007` is due October8: design a verified booking-created/canceled boundary with event deduplication, durable reservation IDs and non-PII source correlation. Keep booking, attendance and qualification separate. No webhook, app permissions or production configuration was changed tonight. Inspect exact Cal.com webhook contract and release tests before implementation.

## Wednesday research decision

Customer-operations/RevOps remains provisional. Two current source checks clarify the discovery filter:

- [n8n approval discussion](https://community.n8n.io/t/how-are-you-handling-human-in-the-loop-hitl-approvals-for-autonomous-ai-agents/310949?tl=en): poster reports unintended API actions but also promotes their own gate. Treat as builder/category signal, not independent buyer or design-partner demand.
- [HubSpot data discussion](https://www.reddit.com/r/hubspot/comments/1whdi9h/is_my_hubspot_crm_data_ready_for_ai_agents/): agency practitioner describes Insycle-based cleanup. Data quality matters, but willingness to pilot action verification or budget is unstated. Cached timestamps are inconsistent; do not assert a precise incident date.
- [Official n8n tool-review documentation](https://github.com/n8n-io/n8n-docs/blob/main/docs/build/integrate-ai/ai-examples/human-in-the-loop-for-tools.md): approvals already exist. Ask about an actual stale CRM write, unclear acknowledgement or recovery handoff; do not sell generic approval as differentiation.

No public reply, private outreach, pitch or article is warranted by these signals alone. Next discovery action remains ten firsthand operations-pain candidates, narrowed to five with workflow ownership, current workaround and bounded-pilot interest. Do not count promotional posts as validated buyers.

## Proof and experiment

Engineering PR34 is merged and the live invited `/control-plane/work` now has typed clarification, exact plans, independent approval, a background runner and provider-twin read-back. Actual production dogfood passed with both members away. This improves proof for an invited operator session; it does not establish buyer demand, live customer integration or full Tasklet parity. Hosted CRM remains blocked on atomic source-version enforcement.

Continue the five independent comprehension-session experiment. Ask whether the operator can explain why customer communication stays held after an uncertain CRM write. Record a specific native-stack gap and agreed next step. Stop broad distribution if three sessions find no unresolved problem; revise the wedge rather than adding more articles.

Restaurant watch: cached rendition still shows the three baseline comments; second-hand acquaintance remains the only restaurant anecdote, no new verified owner, volume or pilot/pay evidence. Live completeness is unavailable. No restaurant page, reply or contact. Four unchanged observation days, below14-day reduction threshold.

Product Hunt remains canceled and untouched. AEO fixed benchmark was not executed; no answer-engine results were fabricated. No site deployment was required for this internal measurement/recovery run.
