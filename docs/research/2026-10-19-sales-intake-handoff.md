# October 19: actual sales intake handoff

Recovery of booking-attribution-20261007, originally due October 8. This change
implements the actual sales transaction/API/form boundary, rather than another
private event normalizer. The parent booking outcome remains partial.

## Behavior and authority

`submitSales` generates an unpredictable UUID and saves it in the existing
tenant-bound sales row. Only a successful COMMIT returns `{received:true,intakeRef}`.
The actual `/api/sales` route returns this bounded no-store receipt. The form
validates the receipt and constructs a fixed Cal.com link carrying only that
reference in metadata. Email, name, company, workflow, tenant and campaign do not
enter the calendar URL or analytics properties. Request-supplied source, tenant,
reference and destination fields are rejected. The reference is correlation data,
not authentication or a confirmed booking. No released migration or database
grant changes. Global public admission counts failed attempts separately from
the sales transaction; the inquiry and tenant-local throttle roll back together.

The sales scope now matches the installed platform description: sample discount
data and CRM/messaging twins; refunds unavailable in this deployment; no real
money or customer email.

## Measured checks

- 37 tests in the sales/workspace, handoff-rendering and product-scope files pass.
  The actual route uses installed web-role pools over disposable PostgreSQL:
  persisted UUID matches returned reference; foreign tenant cannot read it;
  injected source/tenant/reference/destination rejected; deferred constraint failure
  at COMMIT returns no receipt and leaves no inquiry/tenant throttle row.
- Separate unchanged tenant-boundary suite: 29 tests pass, including worker and
  scheduler refusals, real tenant isolation and explicit column-grant containment.
  Both receipts use the declared disposable loopback plaintext fixture, refuse a
  wrong password and clean up their owned database. They are not TLS/native proof.
- Source-construction tests: 6 pass. Actual sales API/form/page now belong to the
  reviewed web dependency graph. Regenerated construction descriptors describe
  source inputs, not a new provider or execution acceptance receipt.
- Focused ESLint, TypeScript, repository policy and diff hygiene pass locally.
  Full candidate CI and production deployment are separate subsequent gates. Initial
  f554635 CI refused two stale source-evidence checks (3,383tests passed,2failed),
  so that revision was not eligible for release. Genuine successor connector proof
  passed36checks; discovery browser proof passed30assertions with ownedTLS,
  password/plaintext refusal and cleanup.94focused evidence/negative tests pass.
  The authenticated299-file CI archive now carries the exact newly measured
  compiled discovery bytes; provider bytes are unchanged. Historical receipts are
  retained and the prior approval-reference receipt is explicitly refused as current.
- Authenticated Chrome observed a synthetic metadata reference preserved in both
  existing founder profile event links. No inquiry or booking was submitted in
  production, no account webhook/event configured, no attendee data transmitted.

Private raw receipts: `/Users/raj/.codex/looplabs-research/2026-10-19-nightly-growth/`.
No benchmark questions, posts, uploads, indexing requests, private outreach or
Product Hunt launch actions were repeated.

## Evidence and next action

The immediately preceding weekly review remains the analytics baseline: rolling
7-day PostHog 11 visitors/17 views/13 sessions; lagged GSC zero clicks/36 impressions;
no qualified booking or attendance verified. This run does not reinterpret those
counts or synthetic calendar metadata as demand.

[Cal.com documents metadata correlation](https://cal.com/blog/cal-v-1-2) and
[requires HTTPS for SaaS webhooks](https://cal.com/docs/developing/guides/automation/webhooks).
A browser-observed URL is weaker than a signed provider delivery. The next
engineering step is the actual signed receiver/store with additive reviewed
migration, exact event/organizer config, tenant-scoped lookup, concurrency,
cancellation and reschedule proof. Native configuration waits for its verified
HTTPS deployment. The founder inbox remains intentionally unavailable in the deployment profile.
An operator-only aggregate read at09:00UTC used the existing production bootstrap
and scoped role: zero accepted inquiry rows all-time and inOctober12–18 for the
configured sales workspace.12bundled library sources matched currentproduction
c0ad416; activation stayed unchanged. No grants, prospect-data endpoint or
production inquiry were added. These are row counts, not unique independent
prospects, direct calendar bookings, attendance or qualification. Product booking
measurement still requires the signed receiver. The private receiver currently
expects64hexreferences, so its port must explicitly adopt the actual UUID contract;
its prior25-test receipt does not prove compatibility.

Fresh [AWS guidance](https://aws.amazon.com/blogs/machine-learning/trust-in-depth-giving-agents-more-autonomy-without-losing-control/)
reinforces native policy/approval overlap. A
[practitioner discussion](https://community.n8n.io/t/how-do-you-handle-human-approvals-for-ai-agent-workflows-in-n8n/311957)
reports approval identity/audit/conditional-rule friction; it is a self-reported
community observation, not a qualified LoopLabs prospect or a verified product gap.
Keep the bounded uncertain-CRM-write/held-message experiment; no broad approval
article or superiority claim follows from these sources.


## Native Chrome visual follow-through

The first synthetic form completed its transaction/reference checks, but visual
inspection found two separate gaps: the retained scroll could leave the result
under the sticky header, and the calendar link inherited an unstyled control-plane
class on the public page. Those findings superseded b1a78d1 before release; its CI
was canceled, not counted as a full pass.

The result now focuses its heading with8rem scroll clearance and uses the existing
public `sales-cta` brand rule. Actual Mac Chrome observed the focused heading
at128px below a99px header, a57px black/white calendar button and no horizontal
overflow at the measured desktop viewport. The visible opaque reference matched
exactly one committed synthetic row; no external calendar was opened. TLS database
password/plaintext refusals and owned cleanup passed. The browser used local HTTP
only; this is not production HTTPS or native calendar delivery acceptance.

An initial fixture127.0.0.1 Origin was correctly refused; using Next's verified
canonical localhost Origin resolved setup without weakening CSRF. The genuine
observations, source fingerprints and screenshot are retained in
`docs/evidence/sales-handoff-native-20261019-focus.json` and its PNG. A source-bound
regression test retains the observed earlier visual failure and corrected result;
it does not infer commercial conversion from a synthetic request.

The focus successor discovery run again passed30assertions against current source,
with its own TLS/cleanup receipt. The connector36-check receipt remains applicable
because its closed-source fingerprints did not change.96focused evidence/refusal
tests pass. Private CI prerequisites carry the exact measured compiled route bytes,
with unchanged provider bytes and only exact-object GetObject for the existing CI
role; no public ACL or trust change. Final full CI/activation remain separate gates
in the private nightly receipt.
