# LoopLabs engineering contract

This file is the source of truth for every coding agent and contributor in this repository. Read it before changing code. Also read the nearest nested `AGENTS.md` if one is later added.

## Product truth

LoopLabs is an early-stage control-plane prototype for workflows involving people and AI agents. The shipped demos show deterministic, browser-local simulations of identity, permissions, policy checks, approvals, execution state, output checks, and reconciliation. They do **not** currently provide a production gateway, live third-party execution, a durable audit service, cryptographic receipts, or a self-service visual workflow builder.

Use `docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md` for the claim matrix and `docs/CONTROL_PLANE.md` for architecture. Never turn roadmap intent into a shipped claim.

The separate `/control-plane/durable` workspace adds authenticated PostgreSQL-backed actions, approvals, leases, effect verification, and compensation for one controlled database test connector. Read `docs/DURABLE_CONTROL_PLANE.md` before changing it. Original demos remain browser-local; industry-grade reliability and external integrations are not established. The separate `/control-plane/refunds` workspace adds a scoped refund agent and PostgreSQL-backed policy/approval/execution/reconciliation against a dedicated private FetchSandbox Stripe twin. No real money moves, no model runs, and the refund fixture is not full live Stripe parity. Read `docs/REFUND_AGENT_PROOF.md`. Durable tests require a dedicated `LOOPLABS_TEST_DATABASE_URL` and must not be skipped.

The private `/control-plane` now uses invited named member sign-in. `/control-plane/actions` unifies discount and refund views; legacy durable/refund URLs redirect there. Agent registration persists a scoped discount, CRM or messaging identity, invited owner and lifetime allowance. CRM and messaging actions require exact named approval; a human cannot approve their own request. Prepared examples remain browser-local. Read `docs/WORKSPACE_ACCESS.md` before changing authentication, sales intake or registration. Applied schema migrations 1–4 must not be edited after release; add a new migration. Read `docs/CONNECTOR_VERIFICATION.md` for private FetchSandbox CRM/messaging contracts, source-version fixture limits and measured proof.

The private `/control-plane/workflow-runs` adds a fixed CRM-to-message workflow with immutable step IDs, enrolled scoped agents, dependency checks at dispatch, pause and final effect verification. Migration 5 is new; migrations 1–4 remain unchanged. Read `docs/WORKFLOW_ONBOARDING_PROOF.md`. This is a bounded provider-twin proof, not arbitrary workflow orchestration or live customer integration.

The invited `/control-plane/work` additionally uses a bounded Amazon Bedrock planner for typed customer-enquiry requests and clarifications. It saves only the fixed sample acknowledgement plan, never conversational execution authority. Read `docs/CHAT_WORKFLOW_PROOF.md`. Private twin rehearsal is proved; hosted CRM-to-email stays blocked without atomic source-version enforcement. No live delivery, arbitrary workflow builder, inbox monitoring or durable chat memory is established.

The managed customer acknowledgement in `/control-plane/work` automatically assigns single-action assistants and submits held actions after exact plan review. Migration 8 adds opt-in background dispatch and a worker heartbeat/cursor. A dedicated worker executes and verifies only independently approved, opted-in enquiry runs; raw chat is not persisted. Hosted managed execution stays blocked until atomic CRM source-version enforcement exists. Read `docs/ENQUIRY_MANAGED_EXPERIENCE.md` and `docs/FETCHSANDBOX_ENQUIRY_HANDOFF.md`. This is one private provider-twin rehearsal, not live inbox automation or arbitrary workflow building.

## Required workflow

1. Inspect the affected route, its tests, and the relevant docs before editing.
2. Keep changes small and preserve the shared site system: Geist, `lib/site.ts`, common navigation, and existing responsive behavior.
3. Add or update meaningful tests whenever behavior, permissions, policy, state transitions, data handling, or public claims change. Test failure paths and replays, not only the happy path.
4. Run `pnpm quality` before committing. A change is unfinished until it passes.
5. Do not bypass, weaken, skip, or delete a gate to make a change pass. Fix the change or explain why the gate itself is wrong and update the test with evidence.
6. Production deployment must use `./deploy.sh`; it requires a clean `main` commit already pushed to `origin/main` and reruns all gates.

## Security and correctness invariants

- Default deny when identity, capability, evidence, policy, budget, or state is missing or malformed.
- Match the action's agent identity to the evaluated identity.
- Treat action IDs as idempotency keys. A retry must not duplicate spend, approvals, output, or side effects.
- Revalidate identity, policy version, run state, and authorization at approval time.
- Never execute or restore state after a failed, stale, or invalidated approval.
- Reconciliation must detect concurrent writes and preserve containment when uncertain.
- Do not persist secrets or sensitive playground input. Do not commit credentials, tokens, `.env` files, private keys, or production data.
- Browser-local checksums are demo evidence. Do not call them immutable, signed, tamper-proof, or production audit records.

## Commands

- `pnpm dev` — local app on port 3007
- `pnpm test` — focused test suite
- `pnpm quality` — repository policy, lint, types, coverage thresholds, and production build
- `pnpm release:check` — production release eligibility plus the full quality gate

The reusable implementation playbook is in `.agents/skills/looplabs-engineering/SKILL.md`. CI is defined in `.github/workflows/quality-gates.yml`.

## Isolated Temporal adoption

Read `docs/TEMPORAL_ADOPTION_PLAN.md` before modifying orchestration. Migration 9
adds explicit one-way Temporal ownership and a leased start outbox, but production
is not cut over. `enquiry-temporal` is a separate scoped workload. Never enable
both dispatch paths for one run or treat scheduling/plan review as execution
approval. Current owner revocation must be checked before dispatch and completion;
an effect already sent may remain uncertain. Run the actual Temporal proof suites
and all affected connector/chat proofs when their covered sources change. Applied
migrations 1–5, 7 and 8 remain unchanged. Phase 3 throughput and real-provider gates,
and Phase 4 HA/operational gates remain open; no Temporal-parity claim is supported.

## Workspace disaster recovery

Read `docs/WORKSPACE_DISASTER_RECOVERY.md` before changing restore or authority.
Migration 10 adds the externally configured recovery epoch and offline quarantine.
An enrolled deployment must rotate the epoch outside the database archive, stop all
writers before restore, revoke restored credentials/approvals and reconcile effects
before new work. Never automatically resume restored approvals, reset reservations,
rewrite action IDs or expose quarantine over a runtime API. Applied migration 9 is
now immutable too. Unenrolled production does not gain restore protection. Run the
actual `workspace:restore-proof` and all affected Temporal/connector/chat proofs.

## Persisted proposal boundaries

Read `docs/PERSISTED_PROPOSAL_BOUNDARIES.md` before changing saved proposals or
operational fields. Migration 11 freezes action identity/payload/policy snapshots,
workflow steps/run ownership and local effect values at the database boundary.
Approval, lease, state and readback updates remain controlled by the application;
this is not a complete database state machine or protection against the database
owner. Apply through `workspace:proposal-boundaries` with a separate owner connection;
unmigrated deployments gain no protection. Preserve migrations 1–5 and 7–11 once
applied. Run the actual connector, Temporal, restore and chat proofs with migration
11 enabled before declaring this boundary verified.

## Exact connector requests

Read `docs/EXACT_CONNECTOR_REQUESTS.md` before changing request preparation,
templates, dispatch or readback. Server-created snapshots bind method, resource,
source condition and body to saved plans and action approval hashes. Adapters send
the saved request; they must reject missing/changed contracts before HTTP. Do not
edit retained v1 content or silently replace historical request displays. Downstream
steps must match current predecessor destination/request contracts as well as
identity, policy and verified state. Changes require meaningful failure/replay
tests and fresh application/worker/container plus actual proof suites.


## Record-scoped connector work

Read `docs/RECORD_SCOPED_CONNECTORS.md` before changing enrolled record scope or
recipient routing. The private adapter's server-only `prepared-request-2` contract
binds workspace/record/test-recipient; v1 remains unchanged. Extra records are
fixture enrollment, not live provider/tenant authentication. Record-scoped managed submission and Temporal ownership transfer require the compatible immutable-route and worker-build gates described below; a v1 worker must never receive scoped work. Never relabel a v2 request as a pinned v1 contract or treat the
manual two-record proof as approved load or deployed background acceptance.

## Persistent record authority

Read `docs/PERSISTED_RECORD_GRANTS.md` before changing migration 12, record enrollment, per-agent grants or scoped approval checks. Revocation/reactivation must not revive an old plan or approval. Preserve uncertain effects and recovery quarantine. The enrollment service is not yet a self-service UI. Compatible scoped background routing uses the separate contract described below.

## Scoped background routing

Read `docs/SCOPED_TEMPORAL_ROUTING.md` before changing migration 13 or record-aware Temporal dispatch. Applied migrations 1–12 must remain unchanged. Scoped transfers require an immutable record route and explicit content-bound worker build; no legacy, sample-record or hosted fallback is allowed. Legacy dispatch must exclude scoped runs before ownership transfer. Scoped managed runs use existing explicitly granted agents and cannot silently enroll authority. The private fixed acknowledgement workflow is not an arbitrary workflow builder or live integration.

The invited `/control-plane/records` screen manages administrator-configured private test-record enrollment and versioned agent access. Read `docs/RECORD_ONBOARDING_WORKSPACE.md` before changing its catalog, API or UI. Enrollment/granting never authorizes execution. Chat selection of these enrolled records is not yet established. Missing schema or unsupported hosted bindings must fail closed.
