# Customer acknowledgement: managed workspace

The invited `/control-plane/work` workspace now keeps one bounded job in a conversation: describe a customer acknowledgement, clarify the sample customer, review the saved plan, rehearse, approve from a different named account, and follow verified progress. It uses the shared site font, navigation and mobile design.

The experience borrows the describe/connect/delegate pattern shown on [Tasklet's public website](https://tasklet.ai/), inspected October 6, 2026. This is not a claim of feature parity with Tasklet's authenticated application, OAuth integrations, scheduling or general agents.

## What runs

- A real bounded planning-model call interprets the typed request. Missing details are clarified. Unsupported commitments, recipients and extra actions do not become plans.
- The validated sample plan persists; raw conversation messages and secrets do not. Reopening work restores the canonical plan and progress, not arbitrary chat memory.
- Connection cards show the configured private or hosted twin binding. **Check connections** performs an authenticated customer-record read with no write. Credentials stay server-side.
- **Rehearse this plan** transactionally enrolls two assistants, each with exactly one capability and a lifetime allowance of one action. Generated scoped credentials are not returned to chat or the browser. The owner is the named initiating member.
- Rehearsal submission creates exact held actions. Reviewing the plan does not approve an action or send anything. Only its owner can submit the managed rehearsal; another member must approve each action.
- Approval cards show the acknowledgement recipient, subject and fixed approved text, current decisions, and observed effects. Exact request payloads and IDs remain in a disclosure for integration work.
- The separate worker picks up saved, explicitly opted-in runs. It cannot approve, create arbitrary plans, or reconcile unrelated runs. It rechecks current authorization, dependencies, policies, leases and independent approvals through the existing services.
- After CRM verification, the email action may dispatch. The runner performs a final independent provider read-back before marking the run complete. The browser is not the executor.
- Restart recovery retains IDs and state. Uncertain effects are inspected; they are never automatically resent. Paused, rejected, stale, conflicting or revoked work remains contained.
- Worker heartbeat makes availability visible. A durable rotating cursor processes batches of ten so old held runs do not permanently starve newer work. This is a single-host bounded prototype, not evidence of HA, disaster recovery or arbitrary workflow scale.

## Migration and release

Migration **8**, `lib/enquiries/managed-schema.sql`, adds append-only background dispatch consent and worker heartbeat/cursor state. Applied migrations 1–5 and 7 are unchanged; 6 remains reserved. Provision with the separate database owner using `scripts/enquiry-managed-setup.ts`; grant runtime SELECT/INSERT on consent and SELECT/INSERT/UPDATE on worker status. Worker credentials are private, separate from human sessions, and require explicit existing-key reuse rather than silent rotation.

Docker builds a bundled worker in the same release image. Compose starts `enquiry-worker` with only runtime database, provider binding and dedicated worker credential; no model or migration-owner credentials. `deploy.sh` activates and rolls back the worker together with the application. The initial rollback removes the new worker when the previous release has no such service.

## Proof and boundary

Run `pnpm build`, then `pnpm chat:proof` with the separately provisioned model runtime environment. `docs/evidence/chat-ui-proof.json` records actual browser, Bedrock, PostgreSQL and provider-twin observations, including a managed run completing while both browsers are away and a real app/worker restart after response loss. Service tests cover unauthorized enrollment, stale plans, declines, paused work, revoked workers and scope escape. Existing connector and hosted proof must be rerun after covered changes; `pnpm quality` enforces fingerprints.

This release supports **one sample acknowledgement at a time** for `customer@example.test`. It does not watch a live inbox, accept arbitrary customer data, expose customer OAuth connection onboarding, produce unrestricted model replies, ingest reference files, schedule recurring jobs or connect real providers. The current CRM effect retains the contact's reviewed lifecycle; it does not add enquiry notes. No real email is delivered.

The complete hosted CRM-to-email path is **blocked** by FetchSandbox's missing atomic approved-contact-version guarantee. Managed submission rejects that hosted binding server-side, not just in the UI. Existing hosted API proof retains the no-write/no-downstream boundary. See `FETCHSANDBOX_ENQUIRY_HANDOFF.md`; fixing that provider contract must precede enabling hosted managed rehearsal.
