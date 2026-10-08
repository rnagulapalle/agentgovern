# Persisted proposal boundaries

Migration 11 adds PostgreSQL update/delete triggers over the discount, refund and
CRM/messaging action tables, workflow steps, workflow run identity and local discount
effect values. This is an additional application-data safeguard, not certification
or a production deployment. Saved enquiry plans already have a separate boundary.

Every action's workspace, action ID, agent, original policy version, payload/hash,
source version, destination binding and creation metadata remain fixed after insert.
Changing a request requires a new proposal and fresh authorization; a stable action
ID cannot be reused to rewrite it. Workflow steps and their dependency ordering remain
fixed; run owner/identity remain fixed. No existing values are rewritten by migration.

State, reason, named approval/expiry, leases and verification fields remain mutable
so the existing controllers can approve, contain, verify and recover work. The local
discount effect allows only its compensation flag to change. New columns are frozen
by default unless a later reviewed migration explicitly permits them.

## Provisioning and trust boundary

Stop/drain writers and use the separate table-owning migration connection:

```sh
pnpm workspace:proposal-boundaries
```

Requires `LOOPLABS_MIGRATION_DATABASE_URL` and migrations 1–5, 7–9. Version 6 is
reserved; recovery migration 10 is separate enrollment. Application is transactional,
serialized with the existing migration advisory lock and digest checked on replay.
It creates no credentials, grants no additional privileges, starts no run and
approves no work. A deployment without applied migration 11 does not gain this
protection. Production has not been updated by this phase.

Triggers reject direct updates and deletes even when a runtime principal has broad
UPDATE/DELETE privileges. Runtime must not own tables or possess CREATE, TRUNCATE,
superuser or role-administration privileges. The tests use an actual non-owner
PostgreSQL role; deletion, truncation and trigger disabling are refused. An owner
can still disable triggers or truncate tables: this is not tamper-proof storage.

The allowed operational columns are not a complete database state machine. A
compromised runtime database credential could forge approvals/state, insert new
rows or change mutable evidence. Application-level named approval and delayed
revalidation, separate credentials, network restrictions, auditing and security
review remain necessary. This phase does not claim to solve those remaining risks.

## Evidence

`lib/durable/proposal-boundary.test.ts` applies the real provisioning CLI twice over
existing proposals, tests direct SQL rewrites and future columns under a restricted
role, checks migration replay/digest/prerequisites, and performs actual restore
quarantine without rewriting proposals. Core controller regression suites now apply
migration 11 before testing approvals, lost responses, concurrency and reconciliation.
Actual HTTP, Temporal, restore and browser proof harnesses apply the same migration;
their refreshed evidence passed: 28 HTTP connector checks, 7 hosted checks (CRM
still held without atomic version enforcement), 7 Temporal crash/replay checks,
7 version checks, 6 dispatch checks, 10 packaged-service checks, 17 secure-container
checks, 4 real archive restore checks and 12 real-model/browser checks. The existing
unchanged runtime image was reused for the secure-container drill; the new database
migration was applied in the isolated application schema. Full quality passed with
303 tests across 41 files and 52 rendered destinations. This remains local evidence.
The validation history preserves the initial stale-evidence gate refusal and its
actual rerun in `docs/evidence/proposal-boundary-validation.json`.

Capacity, multiple independent records, remote staging, production restore,
real-provider guarantees and enterprise security acceptance remain open.
