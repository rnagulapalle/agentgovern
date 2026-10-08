# Typed customer-enquiry rehearsal

October 6, 2026. MVP milestone 1: actual chat interpretation connected to the existing saved-plan and control APIs, not a general workflow builder.

## Try the UI

Invited members sign in and open `/control-plane/work` (Work with agents).

1. Type: “When a customer asks about our service, check their CRM record, prepare an acknowledgement, and ask me before sending. Rehearse it with FetchSandbox first.”
2. Answer the missing-customer question with `customer@example.test`. Confirm ask-first and rehearsal if asked. Only this sample contact is available.
3. Check connections, then review the exact recipient, fixed reply, reference and CRM lifecycle preservation. Choose **Rehearse this plan**. LoopLabs assigns two single-action scoped assistants and submits held actions; neither action is approved or executed.
4. A different invited member opens the saved enquiry and approves each exact action using its inline card. The requester cannot approve their own work.
5. The separate background runner executes CRM, verifies its effect, then dispatches messaging and verifies the whole run. Both browsers may leave. Inspect request details and the saved receipt in the same workspace.

The advanced registered-agent path remains available for integration/debugging. See [managed experience](ENQUIRY_MANAGED_EXPERIENCE.md) and [FetchSandbox handoff](FETCHSANDBOX_ENQUIRY_HANDOFF.md).

The CRM step retains the existing lifecycle through a version-checked PATCH; it does not write enquiry notes. Messages are recorded by the twin, not delivered to an inbox. A receipt is database evidence, not a cryptographically signed certificate or real-world delivery guarantee. Agent enrollment restricts standalone work and is not reversible; paused runs cannot resume yet.

## What the model can do

Amazon Bedrock Nova Lite interprets up to six user turns into a strict intent schema. It can ask for missing information; it cannot select arbitrary tools, invent recipients, construct executable payloads or replace independent approval. The server validates sample-recipient evidence, actor authority, policies, source versions and immutable IDs. Unsupported extra actions stop rather than being silently omitted. Requests are limited to 30 per member/hour and 150 globally/hour. Model failure produces no plan. User text is sent to Bedrock; only the canonical sample plan is saved. Do not use private customer data or credentials. RawReply memory and compaction are not integrated.

## Reproducible evidence

Use a dedicated `LOOPLABS_TEST_DATABASE_URL`, connector twin Python environment and a model-only AWS identity. Set `LOOPLABS_CHAT_MODEL=us.amazon.nova-lite-v1:0` and provision Bedrock `InvokeModel` for this inference profile and its foundation-model destinations. Keep credentials in ignored private environment files, never Git.

Run `pnpm build`, then `pnpm chat:proof` with the private environment configured. The proof launches Chromium, signs in as two isolated sample members, types the request and clarification, runs the real model API and application UI, and records actual HTTP twin effects against a temporary PostgreSQL schema. It kills/restarts the application and separate background worker during recovery. Temporary credentials and data are cleaned up.

Recorded outputs: [browser evidence](evidence/chat-ui-proof.json), [completed UI](evidence/chat-ui-completed.png), [mobile UI](evidence/chat-ui-mobile.png), [connector proof](evidence/connector-proof.json), [hosted contract proof](evidence/hosted-connector-proof.json). Fingerprint tests reject evidence stale for its covered implementation.

Passed browser cases: normal completion; duplicate plan/start replay without extra effects; two independent named approvals; lost CRM response holding email; process restart and read-back without a second write; customer version change after approval refusing stale dispatch and downstream email; unsupported work refusing plan creation; mobile layout containment; automatic scoped-assistant assignment; background completion while both browsers are away; automatic read-back recovery after a real app/worker restart.

## Hosted blocker and unsupported work

Hosted email binding acceptance/read-back is separately verified, including a response lost after acceptance. The complete hosted CRM-to-email path is **blocked**: its contract does not provide the required atomic contact-version guarantee. Read-before-write is not equivalent to compare-and-set. LoopLabs stops CRM dispatch and holds downstream messaging; no weakening or passing claim is made. Private fixture CAS proves the rehearsal only, not hosted or live HubSpot parity.

Not supported: live customer connections or email delivery, general prompt-generated graphs, arbitrary recipients/replies, inbox triggers, schedules, durable chat memory, automatic human approval, organisation self-service and industry-grade availability/failover. Source changes require new reviewed work; previous approval never authorizes changed data.

## Live sign-in regression

Production dogfooding exposed a request burst from automatic marketing navigation prefetches. Shared marketing links now load routes on click, preserving the existing nginx limit. The browser proof checks that sign-in produces no background route prefetch requests for either member. This is a navigation fix, not a weakened request or authentication gate.

## Staging durable execution handoff (October 7)

The server-only `LOOPLABS_TEMPORAL_WORKSPACE=staging` switch exposes **Use durable
execution** inside a saved managed rehearsal. It is off by default. Migration 9
and the separately provisioned Temporal scheduler/worker must exist in that isolated
environment. This is not a production cutover switch or a worker readiness signal.

The active requester explicitly selects the one-way handoff while both actions
are unexecuted. The existing transactional outbox prevents legacy dispatch after
transfer; a race with already-started execution refuses transfer. Another member
still approves each action. No review, chat message or scheduling choice grants
execution authority. Hosted CRM remains refused. Scheduling status distinguishes
saved/pending from accepted by the engine; it does not claim the engine is currently
healthy or that connector effects happened. The existing step evidence supplies
the actual outcome.

`chat:proof` now types the request through the real model, transfers via the invited
UI, checks both actions remain held, starts a real isolated Temporal service/worker,
approves through the second browser account, measures exactly two HTTP twin effects,
and reloads to verify ownership and completion. The original legacy, stale-source,
lost-response and restart cases are retained. HTTP tests additionally cover disabled
and malformed configuration, origin, roles, tenant isolation, extra fields, duplicate
transfers, hosted refusal and paused-run refusal. Remote deployment, durable runner
health in the workspace and customer-provider acceptance remain open.
