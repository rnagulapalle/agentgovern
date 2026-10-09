# Semantic worker-version lifecycle proof

The bounded two-image upgrade/recovery trial passed on October 9, 2026.
Retirement and enterprise acceptance remain incomplete.
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
build ID. Both packaged implementations have now executed against the isolated
authenticated PostgreSQL-backed Temporal service; see the measured result below.

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
The private observation is `semantic-replay-bytes-calibration-20261009.json` in the
local research directory. This calibrates the fixture and replay gate; it does not
prove authenticated PostgreSQL service, worker containers, connector authority,
loss/recovery, retirement or enterprise acceptance.

The shared replay gate verifies manifest identity against service/workflow/lock
bytes, requires identical service and dependency bytes but different workflow
bytes, uses those verified workflow bytes directly rather than reopening a mutable
path, and rejects failed, truncated, reordered or activity-free histories.
`staging-semantic-controller.mjs` is the actual-runtime controller. It uses
existing named sessions, normal enrollment/grants/approvals and immutable scoped
outbox routes. Its Docker host checkpoints, admission and isolated provider setup
executed through a strict derived fresh-host parent. A controller checkpoint file alone is never proof
that a worker stopped, recovered, or is safe to retire.

## Full fresh-host driver

`staging-semantic-proof.mjs` requires disposable Linux/AMD64 CI and the original
fresh typed HTTPS/browser gates. It validates all measured parent fingerprints
before deriving the trial; the parent file and existing four-effect restore proof
are unchanged. It builds the incompatible image with the owned builder, reserves
an additional bounded worker in a separate phase admission, and stops the original
web/poller/provider roles before that phase. The original browser memory reserve
is retained; the later phase runs without Chromium and has its own reserve.

The host verifies actual Docker image/instance identities, non-OOM SIGKILL,
replacement readiness, independent provider read-back and stopped additional
writers. Each new container/network/volume has an exclusive owner label; cleanup
cannot remove a foreign resource. The two original owned database/service
containers are temporarily attached to a private semantic network, then detached
before the original restore proof. New provider effects are measured separately
from the original four effects. Failed runs produce no acceptance receipt.

Retirement admission/reset fencing and long-term retention remain open. This
measured trial does not authorize production cutover or enterprise acceptance.


## Actual disposable service result: October 9

[Private CI run 37901080849](https://github.com/rnagulapalle/sandbox/actions/runs/37901080849)
completed successfully, including the complete quality gate after the actual runtime
trial. It checked public source `e9d4df0551e94efe3cd846c293308378b91df9f2`
and private workflow `76f3b4e4b17062c5f021266c0ddb3e268d1a1b5b`.
The retained receipt is [staging-semantic-proof.json](evidence/staging-semantic-proof.json),
SHA-256 `279b89b24fdcca7ba88e8c01c97292ff0cc89fd917c303a601f5264b62468430`.
Artifact 11602713275 has archive digest
`b555f2c4b081d39a268e6754dd13749c49fd3bbba181a96fd86839f1338d9b37`;
its seven-day CI retention is temporary, not a long-term retention service.

The authenticated trial built distinct actual images and content-bound worker IDs.
With both independent records held, the separate provider had zero effects. After
SIGKILL of the old worker, the new worker completed only its own two effects while
old approved work stayed pending. Recreating the exact old image resumed the old
history and completed its two effects. Provider read-back confirmed four total
effects, with the intended records and recipients; replay added none. The captured
histories had 58 and 39 events. Both matching replays passed, and both cross-version
replays threw the SDK's actual nondeterminism error. Additional writers stopped.
The original typed HTTPS/mobile browser, independent approval, lost-response,
crash/recovery and archive-restore containment checks also passed unchanged.
All 106 measured source fingerprints match the checked implementation.

`validateSemanticReceipt` and its adversarial tests keep this recorded evidence
consistent with those exact sources and refuse missing coverage, changed build/image
identities, weaker admission, altered replay outcomes or lost authority checks.
They do not authenticate CI origin or substitute for running a new trial. A future
covered implementation change must obtain fresh runtime evidence.

### Next acceptance gap: retiring a build

The current outbox requires a correctly formed build ID and saves the route
immutably. It has no registry that atomically stops new assignments when a build
begins draining. A quiet worker or zero observed open histories does not close that
race. Next work must fence admission without modifying existing routes or approvals,
check both durable route ownership and Temporal history, and define retained-image,
reset/recovery and closed-history query rules before any deletion. No build deletion,
route override or production rollout was performed in this trial.
