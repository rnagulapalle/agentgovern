# Durable orchestration adoption

October 7, 2026. Phased acceptance plan, not a production-readiness claim.

## Invariant and ownership

Temporal coordinates one existing saved managed acknowledgement. LoopLabs remains
responsible for scoped identity, opt-in dispatch, exact independent approval,
policy/source revalidation, connector idempotency and effect read-back. Activities
receive only a run ID; credentials stay in the worker. Signals never grant
execution authority. No existing UI, worker, applied migration or production
release is switched by this experiment. Never run both dispatchers for a rollout
without an explicit ownership contract.

## Phases and exit gates

| Phase | Deliverable | Required evidence |
| --- | --- | --- |
| 0 | Baseline and ownership contract | Existing quality gate passes; unchanged production path; explicit scope |
| 1 | Isolated Temporal adapter for current managed run | Real Temporal service, PostgreSQL, HTTP twins; held work, separate approval, stable IDs, duplicate wake, recovery and recorded-history replay |
| 2 | Deployment and plan versioning | Actual old/new worker deployment routing; v1 pending approval across v2 rollout; compatible/incompatible history tests; explicit plan/connector versions and retention |
| 3 | Concurrent dispatch and real test-mode providers | Dispatch ownership/outbox, narrower locks, contention/quotas/backpressure; actual provider idempotency/source guards; hosted CRM blocker resolved or refused |
| 4 | Enterprise operations | SSO/MFA, workload rotation, isolation adversarial tests, traces/alerts, managed database and restore/failover drills, measured SLO/RPO/RTO |
| 5 | Behavioral supervision | Sequence/window limits first; observation-mode detector evaluation and measured false positives/misses before enforcement |

## Phase 1 scope

The runtime experiment lives in `runtime/temporal`. It invokes existing services;
no alternate permissions or approval engine is introduced. The activity uses the
dedicated managed worker and existing server-side consent/dependency checks.
Unknown effects are inspected, not automatically resent. Transport retries reuse
saved action IDs. A paused/conflicting/rejected run terminates as contained.
A compatible v2 patch changes only durable waiting and is tested against recorded
v1 history. This is patch compatibility, not worker deployment pinning proof.

Local proof uses temporary database schema and private twin state; never production
data. It does not prove UI onboarding to Temporal, arbitrary workflows, provider
parity, host failover or availability. Phase 2 must establish routing and recovery
for the cutover before any standard production deployment.

## Sources

- https://docs.temporal.io/encyclopedia/event-history
- https://docs.temporal.io/activity-definition
- https://docs.temporal.io/develop/typescript/workflows/versioning
- https://docs.temporal.io/worker-versioning

## Reproduce the local milestone

```sh
pnpm temporal:proof
pnpm quality
```

Requires the dedicated test database, port8018 free, FetchSandbox Python
runtime and network access for the SDK's local Temporal CLI. The proof cleans
its schema/state and dev service. Results are in
`docs/evidence/temporal-proof.json`; fingerprint tests reject stale evidence.
The runtime activity has ordinary regression/adversarial tests included in the
existing coverage gate. No thresholds or existing tests are removed.

The phase1 proof includes real SIGKILL immediately after the private CRM HTTP
effect and before LoopLabs/Temporal completion recording. The replacement worker
uses existing read-back before downstream email. Lease expiry is shortened by a
clock update in the isolated schema; Temporal activity timeout/retry remains real.
Replay accepts the compatible patch and rejects an incompatible activity command.
This does not establish server persistence across dev-service restart, worker
pinning, production availability, UI cutover or a finished phase2 deployment.

## Phase 2 local deployment proof

`pnpm temporal:version-proof` exercises SDK worker deployment options with PINNED
behavior and the server's current-version routing API. Both builds deliberately
run the same compatible acknowledgement code; routing is measured per worker.
No allow-no-pollers or missing-queue bypass is used. New runs use v2 while pending
v1 runs stay v1. If v1 is offline, approved work waits; restoring v1 resumes it.
The local Temporal service is stopped and reopened with the same SQLite database;
history and deployment routing persist. PostgreSQL action IDs remain unchanged.
This is graceful restart proof, not abrupt host failure or production HA.

The new versioned entry point records only a run ID, immutable saved plan digest,
`acknowledgement-1` plan representation and `private-twin-1` connector contract.
Unsupported versions and mismatched saved digests fail before dispatch. These
version names describe the bounded existing plan and private connector adapter;
they do not negotiate arbitrary provider schemas or claim hosted parity. Each
activity still checks current LoopLabs authority. The versioned adapter additionally
checks that the plan creator remains active before dispatch; revocation refuses
the next activity. This precheck is not an atomic fence against revocation during
an in-flight connector request. Phase 3 must put dispatch authority and ownership
in the same transaction and validate changes at completion. The existing
production dispatcher has not acquired this new check.

Keep a deployable old build and compatible activity adapter while any run pinned
to it remains open. Before removing workers, inspect deployment draining status,
open runs, retained-history query needs and the agreed rollback window. Keep
workflow bundles/contract implementations for replay throughout the namespace's
configured history retention and required audit period. Never automatically
migrate approvals, rewrite saved plans or delete retained builds based only on
new-version promotion. Unknown contracts stop; an intentional new plan requires
fresh review. Retention expiry and production drain automation remain unproved.

Results: `docs/evidence/temporal-version-proof.json`. The ordinary quality gate
checks source fingerprints and regression coverage. Phase 3 must still establish
exclusive dispatch ownership, persisted scheduling/outbox and concurrency before
production cutover. Production continues to use its existing worker.

## Phase 3A: exclusive dispatch and scheduling recovery

Migration 9 adds `ll_temporal_dispatch`: one durable ownership record and start
intent per opted-in plan. Only the active initiating owner can transfer an active
run with two unexecuted held/ready actions. The workspace transaction lock orders
transfer against dispatch. Identity, plan digest, contract versions and workflow
ID cannot be rewritten or deleted. Existing migrations are unchanged. Transfer
does not grant approval; human reviewers still approve exact actions separately.

A distinct `enquiry-temporal` workload owns these runs. Legacy polling excludes
them; legacy, generic workers and manual execution cannot bypass ownership.
Temporal cannot operate an untransferred run. Missing migration/ownership denies
Temporal while preserving existing legacy work. Current active plan-owner checks
now run inside existing connector claim and completion transactions for both
engines. Revocation after an HTTP effect records uncertainty and contains
subsequent actions. Already-sent requests cannot be recalled.

The outbox takes at most ten due intents with a 30-second lease, records attempts,
and makes Temporal start requests outside the database transaction. Completion
uses the same unexpired lease token. An expired scheduler cannot acknowledge a
reclaimed intent. Transport failures retain intent with a five-second retry delay.
Deterministic workflow IDs plus USE_EXISTING for open executions and
REJECT_DUPLICATE for closed executions prevent a scheduling replay from creating
another run. A stopped scheduler can be replaced without rebuilding plan/action
IDs. Start completion means scheduled, not approved, executed or verified.

Reproduce: `pnpm temporal:dispatch-proof`. Results and source fingerprints are in
`docs/evidence/temporal-dispatch-proof.json`. The proof uses actual Temporal,
isolated PostgreSQL and private HTTP twins. It injects scheduler lease expiry,
retries accepted starts, tests concurrent schedulers/activities and revokes the
owner after a real CRM HTTP effect. Original connector, hosted, browser/model
and Temporal proof suites must also be rerun after affected service changes.

`pnpm temporal:setup` installs migration 9 and privately provisions the separate
workload after migration 8. It transfers no run and enables no production worker.
No production migration/cutover is performed by this milestone. The outbox adapter
is not yet a packaged production Temporal service or a self-service UI toggle.

### Phase 3 still-open gates

- Retain workspace-wide transaction serialization until narrower aggregate locks
  are justified by contention tests; this proof demonstrates concurrency safety,
  not throughput. Load/quotas/backpressure thresholds and SLOs remain unmeasured.
- Package and operate a versioned worker/scheduler, with namespace/TLS credentials,
  deployment routing, monitoring and explicit rollback/cutover drills. Bind it to
  the existing invited UI before declaring a deployed Temporal product path.
- Actual test-mode provider integration needs atomic CRM source-version guarantees
  and connector-specific idempotency/read-back. Hosted CRM remains blocked; private
  twins do not establish real-provider parity or email delivery.
- Abrupt service/host loss, replicated persistence, restore/failover, retention
  expiry, security review and operational availability remain Phase 4 gates.

The architecture follows Temporal's deterministic workflow/activity separation
and database outbox pattern. It does not make independent HTTP effects exactly
once by assumption: LoopLabs still owns stable action IDs, provider verification
and containment on uncertain results.

Sources:
- https://docs.temporal.io/activity-definition
- https://docs.temporal.io/worker-versioning
- https://community.temporal.io/t/what-is-recommended-approach-on-starting-workflow-in-transaction/16248

## Phase 3B: packaged operations and bounded backlog drill

See `TEMPORAL_OPERATIONS.md` for the separate versioned worker/scheduler package,
authenticated-TLS configuration, content-bound build ID, local health signals,
concurrency settings and staging runbook. `pnpm temporal:load-proof` uses actual
packaged processes, Temporal, isolated PostgreSQL and HTTP twins. It exercises
25 held runs from 50 concurrent transfer calls, scheduler and worker SIGKILL,
natural scheduler lease expiry, restart recovery and workload revocation.
Results and measured timings are in `docs/evidence/temporal-load-proof.json`.

This closes the local package/backlog-recovery acceptance gate. It does not close
independent-customer capacity, remote TLS/namespace ACLs, alert delivery, UI cutover,
real-provider acceptance or production HA. Existing workspace serialization stays
in place. The single-contact fixture cannot prove parallel customer throughput.


## Phase 3C: database connection outage acceptance

The packaged-process proof now includes a real TCP boundary that closes existing
PostgreSQL connections and refuses new worker/scheduler connections. Independent
queries verify that held action IDs persist and no effects occur. Both roles become
unready. After connectivity restoration and explicit process replacement, the same
25 Temporal histories resume without replacement actions or approval bypass. The
ordinary quality gate requires these evidence markers and source hashes.

This closes one dependency-loss recovery case, not database crash/failover, backup
restore, independent-customer load or production acceptance. The enterprise release
matrix is `ENTERPRISE_ACCEPTANCE.md`; every open gate remains open until measured
in its intended deployment environment.


## Phase 3D: authenticated container and persistence recovery acceptance

`pnpm temporal:container-proof` runs the actual built worker and scheduler image
against a separate PostgreSQL-backed Temporal 1.31 service. It adds a verified
private-root-CA configuration option; remote transport still requires authenticated
TLS. Real RPCs prove mTLS rejection, namespace permissions, reader write refusal,
JWT expiry/signature refusal and signing-key rotation. The regular worker remains
scoped to LoopLabs authority, consent, independent approvals and exact action IDs.

The shared workload proof adds actual service and persistence PostgreSQL SIGKILL,
then restores a pre-effect orchestration backup after an independently approved
completion. The restored history reopens; durable LoopLabs completion prevents
duplicate provider effects and the run closes again. Source hashes and actual image
IDs are checked with the repository gates. See `TEMPORAL_OPERATIONS.md` to reproduce.

This is isolated local self-hosted acceptance. Remote hardened staging, LoopLabs
database backup/restore, replicated failover, independent-record sustained load,
provider-specific live guarantees, SSO/MFA, delivered alerts and UI ownership cutover
remain open. No enterprise-grade production or Temporal availability parity claim.

## Phase 3E: application-database restore containment

`workspace:restore-proof` now executes actual `pg_dump`/`pg_restore` against the
LoopLabs schema after an independently approved Temporal run produces two HTTP
provider-twin effects. The restore observably loses completion and credential
revocation. Migration 10 and the deployment-owned recovery epoch refuse restored
authority before an offline idempotent quarantine clears approvals, revokes old
identities and pauses affected work. Fresh recovery authority reads back existing
effects without resending; unknown actions remain uncertain. The original action
IDs and budget reservations survive.

See `WORKSPACE_DISASTER_RECOVERY.md` for enrollment and the required stopped-writer,
external-epoch-rotation and fresh-credential procedure. This is a declared isolated
archive restore acceptance, not automatic detection of undeclared restores, remote
PITR/HA, a recovery time objective or production enrollment. Current production
keeps its existing configuration. Full affected Temporal, connector and browser
proofs must match the new shared authorization source before release.
