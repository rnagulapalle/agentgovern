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
