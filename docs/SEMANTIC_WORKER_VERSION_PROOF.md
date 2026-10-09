# Semantic worker-version lifecycle proof

Implementation in progress. No semantic upgrade acceptance is claimed.
Production remains on the legacy runner. The accepted same-worker-build package
proof is in [STAGING_PENDING_PACKAGE_TRANSITIONS.md](STAGING_PENDING_PACKAGE_TRANSITIONS.md).

The earlier `temporal-version-proof.ts` uses two deployment labels with the same
workflow implementation. It proves pinned routing, persisted dev-service history,
retained-worker recovery and contract refusals in its stated environment; it does
not prove a real worker-code change in the assembled container environment.

## Deliberately incompatible code

`semanticWorkflowVariant` verifies the measured baseline's exact source hash before
adding a durable timer before the first existing activity. That changes Temporal
commands, not just a build label. It preserves the existing contract/activity,
signal and terminal-state logic. This is an adversarial fixture, not a new customer
feature. Generated source is exclusive and temporary; normal builds are unchanged.

`Dockerfile.temporal-version-proof` requires an explicit `baseline` or `incompatible`
case. Both cases keep the existing packaged service, pinned dependency lock and
content-bound manifest pipeline. Its context excludes credentials and private local
data. The incompatible bundle has compiled locally with a distinct content-bound
build ID; no packaged worker has executed it and no lifecycle acceptance follows yet.

## Required actual acceptance

1. Build and verify both actual worker images on an admitted isolated host. Use
   distinct content-bound IDs and authenticated PostgreSQL-backed Temporal service.
2. Start independent scoped records using old/new immutable route builds. Keep both
   workers concurrently; promotion must not rewrite existing routes or authority.
3. Remove the old worker with pending old work. The new worker must not acquire it,
   even after separate named approval. Restore the exact old artifact and finish
   the same history/actions without duplicate effects.
4. Replay each completed history with its correct bundle. Cross-version replay with
   the deliberately incompatible command sequence must refuse.
5. Verify retained and current authority, uncertain-effect containment and recovery
   fences. No approval, budget, action ID or ownership rewind is allowed.
6. Measure retirement/drain against both Temporal histories and durable LoopLabs
   route ownership. An observed count is not permission to delete a worker or archive;
   concurrent admission and reset/recovery must not reopen retired work silently.
7. Preserve full typed HTTPS/browser, connector, crash, replay and restore gates.
   Run full quality, normal pre-push and all exact-head release CI before merging.

Permanent host allocation, long-term history/image retention, independent operator
acceptance, real providers and enterprise security/service objectives remain open.
No forced reset or versioning override of existing histories is part of this proof.

References inspected October 9:
- https://docs.temporal.io/production-deployment/worker-deployments
- https://github.com/temporalio/documentation/blob/main/docs/production-deployment/worker-deployments/recover-pinned-workflows.mdx

## Replay calibration measured October 9

A real local Temporal dev service captured two completed histories with the
content-distinct baseline and incompatible bundles: 11 and 16 events. Each matching
bundle replayed successfully. Both cross-version replays threw the SDK's actual
`DeterminismViolationError`; arbitrary exceptions cannot count as incompatibility.
The inert activity ran once for each history and was not invoked by replay.
The private observation is `semantic-replay-calibration-20261009.json` in the
local research directory. This calibrates the fixture and replay gate; it does not
prove authenticated PostgreSQL service, worker containers, connector authority,
loss/recovery, retirement or enterprise acceptance.

The shared replay gate verifies manifest identity against service/workflow/lock
bytes, requires identical service and dependency bytes but different workflow
bytes, and rejects failed, truncated, reordered or activity-free histories.
`staging-semantic-controller.mjs` is the pending actual-runtime controller. It uses
existing named sessions, normal enrollment/grants/approvals and immutable scoped
outbox routes. Its Docker host checkpoints, admission and isolated provider setup
are not wired or executed yet. A controller checkpoint file alone is never proof
that a worker stopped, recovered, or is safe to retire.
