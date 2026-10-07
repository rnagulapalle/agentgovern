# Customer enquiry: bounded base workflow

Updated October 6, 2026. The typed chat entry now calls a bounded model planner. This remains a saved provider-twin workflow, not the complete conversational/live-connector product from the PRD. See [CHAT_WORKFLOW_PROOF.md](CHAT_WORKFLOW_PROOF.md) for real browser evidence and the hosted CRM blocker.

The default UI now automatically assigns single-action assistants, submits held actions and shows independent approvals and background progress in one workspace. Migration 8 adds explicit dispatch consent and worker heartbeat/cursor. See [ENQUIRY_MANAGED_EXPERIENCE.md](ENQUIRY_MANAGED_EXPERIENCE.md). The manual registered-agent/API path below remains available for integration work.

## What works

Invited operators open Work with agents and type their request. Chat asks for missing sample details and saves the same immutable plan used by the existing control APIs. Prepared sample enquiries remain available through the API and exercise a valid service request, a missing sender, an unsupported contact and a discount request requiring human judgment. Clarification cases create neither a saved plan nor executable work. The approved response is only the existing acknowledgement; no pricing or contractual commitments are inferred.

For the supported enquiry the server reads contact 1001 from the private CRM twin. Its email, version and lifecycle must match the supported contract. The plan preserves the existing lifecycle rather than promoting a lead or downgrading a customer. This connector does not create contacts, write enquiry notes, search a real CRM or deliver real email. The visible plan states those limits.

The server saves the enquiry fixture, exact contact, CRM intent, approved reply reference, source version, policy versions, plan hash and creator in PostgreSQL. Bounded chat text is sent to Amazon Bedrock for interpretation but is not saved in PostgreSQL; only the canonical validated sample plan is persisted. Private customer data and secrets must not be entered. The plan cannot be rewritten by normal runtime updates. Only its run link may be added once. Database owners can administer the data; this is not independent signed storage.

Reviewing a plan permits creating one workflow, not executing either effect. Start requires the exact plan hash, valid current contact/policy evidence and two active scoped agents. It creates the workflow and its plan link in one transaction. Repeat start with the same ID and identities returns the same run, including after a lost response/restart; changed identities conflict. A new ID denotes a different simulated enquiry event. Duplicate content under different event IDs is not automatically detected.

The first CRM proposal also requires the contact version from the reviewed plan; a change between plan creation and proposal holds the enquiry rather than silently refreshing its evidence. Each CRM/email action still requires independent named approval. Approvals bind the current exact payload/source/policy and expire. Dispatch rechecks authority and dependencies. A CRM response lost after commit leaves the downstream email held. Reconciliation reads back the existing effect without resending; final verification checks both effects. Pause does not recall effects and paused runs cannot resume yet.

## Setup and proof

After connector migrations, apply `pnpm enquiries:setup` with migration-owner access. Migration 7 is new; version 6 is reserved by the separate back-office proposal and migrations 1–5 are unchanged. Runtime receives SELECT/INSERT and only UPDATE(run_id) on the new table. No new credentials are generated or shared.

`pnpm connectors:proof` includes the actual enquiry HTTP handlers, real PostgreSQL and private FetchSandbox engines. It verifies clarification, exact plan hash, stable replay, independent approvals, downstream refusal, response loss, API restart, read-back and completion. Existing backup/restore proof now includes saved enquiry plans. Sanitized scope and source fingerprints are recorded in `docs/evidence/connector-proof.json`.

`pnpm quality` requires PostgreSQL tests for stale plans, changed policies, wrong capabilities, revoked actors, tenant boundaries, immutable rows, changed replay identities, customer-stage preservation and HTTP authentication/origin/field checks.

## Still needed for the chosen customer pilot

- The bounded planner is implemented with a model-only Bedrock identity and rate limits. General planning, durable conversational memory and broader jobs remain unsupported. Personal model subscriptions are not used as the customer-service backend.
- Approved reference-document ingestion and versioned retrieval; model drafts must cite approved facts and pass validation. This release uses one fixed reference/template.
- Live-provider delegated access, customer-specific contact matching, notes, reply drafts and authoritative provider acceptance/effect contracts. The private fixture CAS/idempotency extensions are not live HubSpot/Resend guarantees.
- Durable inbound events and message-thread/reply detection, then schedules and cancellation for follow-up.
- Employee-only roles, organisation provisioning, operational supervision, monitoring, backup/failover objectives and provider-specific production acceptance.

The first pilot remains one team, one CRM, one email provider and one enquiry at a time. No automatic payments, discounts, contractual commitments or bulk campaigns.
