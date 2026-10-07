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
