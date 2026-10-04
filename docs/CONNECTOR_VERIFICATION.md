# Connector controls and verification

Updated October 4, 2026. This document describes shipped scope, not a promise of universal connector support.

## Product behavior

`/control-plane/actions` offers four supported workflows: discounts, refunds, CRM contact updates and customer messages. `/control-plane/verification` shows recorded checks and remaining operational requirements. Named member authentication protects both routes. Register CRM and messaging agents under Agents and boundaries, with an active invited owner and a lifetime request allowance; the key may propose/read its own requests but cannot approve, execute, contain or configure.

| Workflow | Business effect | Enforcement and evidence | Limits |
| --- | --- | --- | --- |
| Discounts | Versioned sample record | Existing PostgreSQL controlled connector, approvals and safe compensation | One sample record |
| Refunds | Simulated payment refund | Existing private FetchSandbox Stripe twin, amount/budget policy and effect lookup | No money, bounded fixture; no rollback |
| CRM | Set one contact lifecycle to lead/customer | Exact request and trusted fixture source version are approval-bound; fixture enforces the version at write time; read-back checks observed fields/version | One contact; action journal/CAS are LoopLabs fixture extensions, not live HubSpot guarantees |
| Messages | One fixed case-received template to a fixed sample recipient | Server-owned payload/recipient allowlist, stable action key, exact approval and effect/read-back verification | No real email, no arbitrary text/recipients, no real delivery proof |

FetchSandbox is used through its actual engine, provider specs and resource contracts from the existing backend. We do not modify the shared FetchSandbox deployment. The separate fixture listens on loopback or the fixed private Docker alias. There is no arbitrary URL option and production credentials are refused.

## State and authorization

`held -> ready -> executing -> succeeded / uncertain / conflict`.

Held actions may be rejected or cancelled. Every CRM/message action needs named approval. A human operator cannot approve their own request; another operator must review it. Agent requests require an operator's approval. The older discount/refund walkthroughs retain their original approval rules.

Approval binds the exact payload, trusted source version where applicable, policy version and a 15-minute expiry. At dispatch, membership/workload authority, agent capability, active policy, expiry and the execution lease are checked again. Stable action IDs bind immutable logical requests; changed details conflict, same-ID retries do not reserve again. Different IDs are different requests; semantic duplicate detection across new IDs is not claimed. Lifetime request admission is not a monetary or daily budget.

All database transactions are short; provider calls do not hold workspace locks. An in-flight external write can finish after containment; we never claim that revocation recalls an email or payment. Containment cancels queued work and leaves dispatched outcomes uncertain. Enabling a connector allows new proposals and does not revive old approvals. Uncertainty never automatically resends the request. Operator verification reads evidence only.

A source lookup alone is insufficient for CRM safety: the fixture enforces the approved version during the write. A real CRM adapter without an equivalent provider-supported mechanism needs a different containment/control design. Do not translate the fixture version extension into a live HubSpot claim.

The refund service now also keeps provider calls outside mutation locks. Authority is rechecked after payment lookup and before dispatch, and again when acknowledging an effect. Containment/revocation/lease expiry after dispatch retain uncertainty. Reconciliation performs provider lookup outside database locks.

## Persistence and isolation

Migration 4 adds connector policies, shared actions and protected event history; migrations 1–3 are unchanged. Runtime permissions allow action/policy changes and insert/read events; event update/delete is blocked. Tenant scope and connector assignment are enforced server-side. Database owners can administer evidence; it is not cryptographically signed or independent immutable storage. Production row-level security, enterprise SSO/MFA, rotation and audit review remain open.

The single-process private twin atomically persists engine state and its fixture action journal together. Normal restarts preserve effects and replays. This is not a multi-process production database or a distributed transaction. The provider's real idempotency retention/lookup/pagination and concurrency rules must be tested before connecting it.

## Run and prove

```sh
pnpm connectors:setup
pnpm connectors:twin
# Another terminal:
pnpm dev
```

Keep credentials in ignored private files. Production twin mounts only its dedicated connector state/credential directory. Never give an agent a twin, database, operator or worker credential.

With port 8018 free, run:

```sh
pnpm connectors:proof
pnpm quality
```

The proof requires the dedicated `LOOPLABS_TEST_DATABASE_URL`, FetchSandbox's existing Python environment and PostgreSQL dump/restore tools. It does not skip missing dependencies. It creates an isolated schema and private fixture directory, uses real HTTP, restarts the actual twin, terminates a real worker before/after the effect, and performs a local database restore drill. Lease expiration is injected in the isolated schema to avoid a 30-second wait. It cleans up these isolated resources. No production workspace, CRM, email or money is involved.

Sanitized evidence is recorded in `docs/evidence/connector-proof.json`. Private detailed output remains under `.local`. The exact implementation fingerprints are checked by the regression gate: changing covered connector code requires rerunning the HTTP proof. The evidence page displays a dated recorded result, not live health or measured customer demand.

## Production acceptance still required

- Real provider test-mode contract tests, customer/account scope and authoritative outcome lookup.
- Approved credentials held by trusted connectors; prevent direct agent bypass.
- SSO/MFA, narrower human roles, rotation and independent security review.
- Supervised worker service, dispatch backpressure, alerts and manual resolution owners.
- Managed database/PITR, off-host backups and production restore/failover exercises with agreed recovery objectives.
- Load/soak tests and operational SLOs. The local restore duration is not a production recovery guarantee.
- Model execution and general multi-step orchestration remain separate, unconnected features.

These proofs improve evidence for specific contracts. They do not establish an industry-grade control plane for every connector or regulated industry.
