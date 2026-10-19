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
  Full candidate CI and production deployment are separate subsequent gates.
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
HTTPS deployment. Accepted-intake totals remain unknown while the founder inbox
is intentionally unavailable in the deployment profile.

Fresh [AWS guidance](https://aws.amazon.com/blogs/machine-learning/trust-in-depth-giving-agents-more-autonomy-without-losing-control/)
reinforces native policy/approval overlap. A
[practitioner discussion](https://community.n8n.io/t/how-do-you-handle-human-approvals-for-ai-agent-workflows-in-n8n/311957)
reports approval identity/audit/conditional-rule friction; it is a self-reported
community observation, not a qualified LoopLabs prospect or a verified product gap.
Keep the bounded uncertain-CRM-write/held-message experiment; no broad approval
article or superiority claim follows from these sources.
