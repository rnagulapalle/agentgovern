# Persisted reset intents — optional candidate, not deployed

Migration15 addresses the observed repeated-reset gap in
[COMPLETED_RUN_RESET_PROOF.md](COMPLETED_RUN_RESET_PROOF.md). It does not expose an
operator reset endpoint or install itself during bootstrap. Production is unchanged.

The separate owner CLI `scripts/reset-intent-setup.ts` requires exact prerequisite
migration digests including recovery10, immutable routing13 and admission14. It
serializes installation, refuses changed applied bytes, and grants runtime only
read access. Existing actions, approvals, routes and worker artifacts are unchanged.

An intent freezes workspace, operation ID, existing plan/route, Temporal namespace,
original execution, task boundary, history hash, content-build label, retained image
identity and recovery epoch. The database requires a started existing dispatch,
completed application run, matching route/build/image and current recovery epoch.
Draining builds are allowed only for their existing pinned routes; this does not
admit new work or authorize artifact deletion. One original execution may belong
to only one operation. The first successful insert commits `uncertain` before RPC.
There is no lease-expiry retry, requeue or deletion transition.

`reset-intent-store.mjs` is offline owner/proof plumbing. It checks table ownership,
the exact migration15 digest and independently configured `LOOPLABS_RECOVERY_EPOCH`,
then serializes concurrent claims. Duplicate claims never send another reset.
Caller mutation cannot change the saved request. If an RPC response is lost, the
committed uncertainty survives reconnect; retries return uncertainty. A success
response alone is not effect verification.

Read-only reconciliation captures one actual execution, checks a completed
contiguous acknowledgement history and the original worker pin, and requires the
Temporal reset marker to match original/new execution IDs and the exact persisted
operation reason. It saves an `observed` result. An unrelated, incomplete, changed
pin, wrong-namespace or mismatched-lineage execution cannot resolve the intent.
`observed` means execution readback, not verified business effects or new approval.

The owner and Temporal service remain trusted infrastructure. These records and
history hashes are not signed attestations. The separate owner cannot be treated
as an unprivileged tenant role. Epoch checks contain stale archives only when the
deployment maintains and rotates its external epoch; a trusted administrator can
alter database schema or external configuration. The offline candidate grants no
new business execution authority. The actual worker must continue checking current
identity, scope, approvals, policy and provider effects.

## Measured component scope

Dedicated PostgreSQL tests measure eight concurrent claims with one dispatch,
immutable identity/results, runtime mutation refusal, wrong route/image/run
containment, changed migration refusal and missing/rotated external epoch refusal.
The actual owner CLI is tested on the full schema concurrently/idempotently.

A local actual Temporal1.32.0 test sends one reset and deliberately discards its
response. A fresh PostgreSQL connection retries without sending another RPC. The
new pinned execution completes; independent reset history resolves the saved intent.
The test observes two inert activity calls total and one reset RPC. It uses fixture
route/image metadata and a synthetic worker-build label; it does not inspect a
packaged worker image or call a provider. This is component/inert-runtime evidence.

## Remaining assembled acceptance

Before exposing this to invited operators, prove the same protocol with real named
authority, frozen approvals, actual retained worker images, migration14 draining,
independent provider readback, no duplicate reservations/effects, process restart,
and archive restoration with epoch rotation. Test unavailable history and denied
current authority, then retain/retrieve both image bytes and histories. No public
API, automatic completed-workflow reset, production cutover, broad orchestration or
enterprise SLA is claimed. The previously accepted 113-source drain proof remains
unchanged; it does not cover this new boundary.
