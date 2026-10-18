# Persistent record enrollment and grants

October 7, 2026. Local foundation verified; not deployed or enterprise accepted.

Migration 12 persists server-enrolled record destinations and per-agent grants.
`ScopeControl` is an authenticated server service, not a public HTTP enrollment API
or a self-service connector catalog. Enrollments bind workspace, fixed test record,
test recipient and adapter destination identity. They contain no provider secret.
The record must exist and match the private adapter's trusted source before
registration. The adapter's privileged fixture credential remains separate.

The database freezes enrollment identity/target/binding and grant identity. Changing
active status requires the next positive integer version; deleting, retargeting,
resetting a version or changing a version without a status transition is refused.
Repeating enrollment or grant creation returns existing state, including inactive
state: retries never reactivate permissions. Explicit authenticated reactivation
increments the version and does not update old plans or approvals. Audit events
are append-only at the application PostgreSQL boundary, not signed certificates.

A scoped agent requires an active enrollment, an active record grant and an active
invited owner. Existing identity, tool, policy, budget, independent approval, expiry,
run dependency and connector binding checks still apply. New scoped actions save
`scopeId`, `scopeVersion` and `grantVersion` inside the immutable approval payload.
Public proposals cannot supply that snapshot. Current versions are checked at
approval, dispatch, after a possible effect, during reconciliation and for preceding
steps. Revoked or reactivated authority cannot make an old snapshot current again.

Saved plans freeze the enrollment ID/version. Starting a manual scoped workflow
requires current enrollment and grants for both agents. Re-reviewing a plan does
not authorize execution. Scope or grant changes never rewrite proposal fields,
create replacement action IDs or reset reservations.

Revocation cannot recall a request already sent to a provider. If authority changes
after a possible effect, the action stays uncertain. Authorized operator readback
can retain the observed effect as evidence without restoring permission to execute.
Reactivation does not release that old action or its downstream work. Review provider
effects before deciding whether fresh work is appropriate; new IDs are not a safe
way to retry an already completed business operation.

## Installation and recovery

Use a separate migration-owner connection:

```sh
pnpm workspace:record-scopes
```

The CLI verifies applied prerequisite digests for 1–5, 7–9 and 11 under the shared
migration advisory lock. Migration 10 remains separate recovery enrollment. It
checks migration 12's digest on replay, grants the existing runtime role only
SELECT/INSERT/UPDATE for the scope/grant tables and SELECT/INSERT for their events,
and never provisions a credential, enrolls a record, grants an agent, approves an
action or starts a worker. Runtime has no granted DELETE, TRUNCATE or schema-owner
permission. These controls do not protect against a database owner or a compromised
application/runtime credential performing otherwise granted mutations.

Restore quarantine now revokes restored enrollments and grants and increments
versions alongside the existing identity/policy/approval quarantine. Deployment epoch
rotation remains outside the archive and stopped writers are mandatory. Restore is
an offline owner operation; no runtime route can perform it.

## Verification and remaining product work

Dedicated PostgreSQL tests exercise concurrent enrollment/grant replay, missing
owner/grant/schema, stale permissions, wrong workspace, client injection, immutable
SQL boundaries, independent approvals, downstream containment, post-effect revocation
and restore quarantine. The actual migration CLI runs twice and concurrently in a
disposable schema and refuses missing/changed prerequisite and migration digests.

The actual HTTP connector harness covers persisted grants on separate customer flows,
revocation before dispatch, refusal after reactivation, and revocation after an actual
provider effect/lost response followed by real fixture restart. The application
archive drill additionally registers a real fixture scope/grant before backup,
revokes them, restores the archive and checks that quarantine revokes resurrected
version 1 as version 2 before fresh authority can operate.

The current UI/factory still selects the original sample. The subsequent local routing phase is described in `SCOPED_TEMPORAL_ROUTING.md`: compatible per-run routing now has packaged-process proof, with explicit build pinning and no fallback. Existing v1 behavior is preserved. Next: server enrollment UX/API and invited browser proof; then approved independent record/tenant sustained load and operational acceptance. No live provider grant, hosted CRM
atomic write guarantee, sustained throughput or full tenant security is established.

## Storage failure found during verification

A full local disk exposed volatile fixture effects being readable after journal persistence failed. The fixture now refuses further authenticated writes and evidence after any persistence exception, fsyncs both file and containing directory, and requires restart from saved state. The HTTP drill injects this failure after a native effect and checks uncertainty, unchanged durable journal, restart and no resend. This is private-fixture evidence, not certification of a live provider. The interrupted test PostgreSQL cluster was restarted after freeing generated caches and completed automatic WAL recovery; production was not changed.

Measured local verification: 334 tests across 45 files; coverage 97.46% statements, 95.90% branches, 99.45% functions and 98.15% lines. Fresh actual suites: connector HTTP 36 checks, hosted connector 7, Temporal fault/replay 7, version routing 7, dispatch 6, packaged load 10, secure containers 17, application archive restore 5 and real-model/invited-browser chat 12. All saved source fingerprints match this implementation. The rebuilt worker image is `sha256:99bf494ba8fd7e607162e610fd323095552f8589fd867a2aaca94cf07b9d806f`; the harness verifies packaged bytes against its manifest. These numbers are local checks, not production capacity or SLA measurements.
