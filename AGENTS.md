# LoopLabs engineering contract

This file is the source of truth for every coding agent and contributor in this repository. Read it before changing code. Also read the nearest nested `AGENTS.md` if one is later added.

## Product truth

LoopLabs is an early-stage control-plane prototype for workflows involving people and AI agents. The shipped demos show deterministic, browser-local simulations of identity, permissions, policy checks, approvals, execution state, output checks, and reconciliation. They do **not** currently provide a production gateway, live third-party execution, a durable audit service, cryptographic receipts, or a self-service visual workflow builder.

Use `docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md` for the claim matrix and `docs/CONTROL_PLANE.md` for architecture. Never turn roadmap intent into a shipped claim.

The separate `/control-plane/durable` workspace adds authenticated PostgreSQL-backed actions, approvals, leases, effect verification, and compensation for one controlled database test connector. Read `docs/DURABLE_CONTROL_PLANE.md` before changing it. Original demos remain browser-local; industry-grade reliability and external integrations are not established. The separate `/control-plane/refunds` workspace adds a scoped refund agent and PostgreSQL-backed policy/approval/execution/reconciliation against a dedicated private FetchSandbox Stripe twin. No real money moves, no model runs, and the refund fixture is not full live Stripe parity. Read `docs/REFUND_AGENT_PROOF.md`. Durable tests require a dedicated `LOOPLABS_TEST_DATABASE_URL` and must not be skipped.

The private `/control-plane` now uses invited named member sign-in. `/control-plane/actions` unifies discount and refund views; legacy durable/refund URLs redirect there. Agent registration persists a scoped discount, CRM or messaging identity, invited owner and lifetime allowance. CRM and messaging actions require exact named approval; a human cannot approve their own request. Prepared examples remain browser-local. Read `docs/WORKSPACE_ACCESS.md` before changing authentication, sales intake or registration. Applied schema migrations 1–4 must not be edited after release; add a new migration. Read `docs/CONNECTOR_VERIFICATION.md` for private FetchSandbox CRM/messaging contracts, source-version fixture limits and measured proof.

The private `/control-plane/workflow-runs` adds a fixed CRM-to-message workflow with immutable step IDs, enrolled scoped agents, dependency checks at dispatch, pause and final effect verification. Migration 5 is new; migrations 1–4 remain unchanged. Read `docs/WORKFLOW_ONBOARDING_PROOF.md`. This is a bounded provider-twin proof, not arbitrary workflow orchestration or live customer integration.

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
