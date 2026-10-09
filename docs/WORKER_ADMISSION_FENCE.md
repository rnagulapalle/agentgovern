# Worker admission fence — candidate, not deployed

Migration 14 is an explicit owner-installed gate on new record routes. It is not
part of the current staging bootstrap or production deployment. Applying it with
no enrolled builds immediately refuses all new record-scoped transfers; prepare
and verify the exact packaged artifacts before opting in. Existing routes and
approvals are unchanged. Current accepted semantic trial predates this migration
and does not prove its end-to-end application behavior.

The registry retains build, image, workflow, service and lock hashes. Runtime
connections have read access only. The owner may enroll a build and move it once
from active to draining; identity changes, reactivation and deletion refuse.
There is deliberately no retired state or artifact/history garbage collection.
The offline artifact-enrollment command below inspects exact image bytes; it is
not a cryptographic attestation or CI-provenance check. The owner must select a
reviewed release image. Actual assembled lifecycle acceptance remains required.

Every new route insert locks the enrolled build row with FOR SHARE and requires
active state. Draining takes a conflicting row lock in the same PostgreSQL
transaction boundary. If admission wins, drain waits for its commit; if drain wins,
the waiting insert observes draining and refuses. This also covers direct runtime
inserts, without relying on an application check before dispatch. Existing dispatch
and old worker execution remain pinned; neither routes nor approval hashes change.

Row locking needs UPDATE privilege. A narrowly scoped SECURITY DEFINER trigger
performs only the schema-qualified registry lookup/lock. Its search path is fixed
to pg_catalog; the schema comes from the triggering table, and the build value is
bound as a parameter. Public direct execution is revoked. Runtime is not granted
registry write privileges. The database owner can still alter schema, triggers or
privileges; this is an explicit trust boundary, not protection against that owner.

`worker-admission.test.ts` executes the migration SQL against dedicated PostgreSQL
in an isolated trigger harness. It proves default deny, preserved pre-migration
routes, one-way transitions, restricted-role refusal, both measured lock-contention
orders and temporary-table spoofing refusal. It does not prove the actual UI,
Temporal dispatch or retirement/reset/history-retention behavior. The full-schema
owner CLI test applies migration 14 concurrently/idempotently after unchanged
prerequisite digests and rejects a changed applied migration.

Setup uses a separate owner connection:

    node --import tsx scripts/worker-admission-setup.ts

No public runtime enrollment/retirement endpoint, automatic rollout, build deletion,
route rewrite or production cutover is provided. Next acceptance must verify exact
artifact enrollment, concurrent real outbox transfer/drain, pinned old-history
completion, reset/recovery containment and retained artifact/history availability.


## Offline artifact enrollment candidate

`worker-artifact-enroll.mjs` requires a separate registry-owner connection and an
immutable `sha256:` image ID. It inspects Linux/AMD64 identity, refuses unexpected
image volumes, creates a uniquely labeled non-running/no-network extraction
container, and reads four regular bounded files. The manifest must match the
service, workflow and lock bytes together. Symlinks, missing/corrupt manifests,
mutable tags or changed image identity refuse. The container is never started.
Cleanup checks its owner label and removes only its own resources.

The transaction checks table ownership and exact migration14 digest, serializes
with migration/enrollment operations, and records build/image/component hashes.
Duplicate enrollment is idempotent only for the same active identity. Same build
bytes in a different image conflict; a draining record cannot be reactivated.
Runtime member/workload credentials cannot enroll an artifact. No action, plan,
route, approval, worker process or retirement decision is created by enrollment.

With the separate owner environment configured, the explicit command is:

    node scripts/worker-artifact-enroll.mjs sha256:<reviewed-image-id>

Measured tests build two actual inert extraction images on Docker, use dedicated
PostgreSQL, and prove exact-byte/idempotent enrollment, image conflict, non-owner
refusal, corrupt migration refusal and draining refusal. These fixtures are not
runnable Temporal workers. Manifest consistency does not establish CI provenance,
trusted business code, runtime health, image retention or retirement safety. The
existing real two-image lifecycle acceptance is unchanged and predates the fence.
Next, run this command on its reviewed runnable images and prove concurrent actual
outbox transfer/drain with pending old history and retained authority.


## Assembled race driver — runtime acceptance still pending

`staging-drain-proof.mjs` strictly derives the measured parent, host and controller;
the accepted source files remain unchanged. It requires fresh disposable Linux CI
and preserves the original browser/crash/restore/replay gates and peak reservations.
The separate offline owner uses the reserved stopped scheduler's 256MiB allocation.
Only that owner gets the migration URL. Runtime controller and workers receive
restricted credentials, never the owner connection or model session.

After image extraction, the host records inspected IDs and mounts verified bytes
read-only to the owner. The private provisioner-only enrollment helper rechecks
those bytes and the exact migration14 digest; host identity checks bind them to
the actual worker images. This helper is not a public enrollment API. Ordinary
offline enrollment continues to require direct immutable-image inspection.

The controller creates additional held plans through normal named authority,
scoped grants, fixed enquiry planning and proposal APIs. It instruments only the
real outbox's before/after INSERT observation barriers; SQL and transactions are
unchanged. The owner requires actual pg_blocking_pids evidence in both race orders.
Admission-first commits its original route before drain; drain-first refuses and
rolls back dispatch/route ownership. Existing transfers remain idempotent. The
additional admitted old-build route deliberately stays pending, proving that a
successful drain is not permission to remove old artifacts or history.

The original two pinned histories must then finish through independent approval,
old-worker loss/restoration and actual correct/incompatible replay, with exactly
four provider effects. A new receipt is emitted only after these runtime outcomes
and original typed HTTPS/mobile/archive checks pass and all measured/generated
source hashes remain unchanged. No driver receipt exists yet. Applying migration14
after the parent's archive snapshot does not establish migration14 reset/restore
semantics; that remains a separately declared acceptance gap.

October 9 runtime attempt 37907740158 failed at controller startup and produced
no accepted drain receipt; following runtime-dependent quality/upload steps were
not reached. A local Docker reproduction confirmed that root COPY of mode600
generated source prevents the non-root controller from reading it. Generated
controller source now uses mode644; host scripts and credential files retain
mode600. Exclusive creation refuses existing files and symlinks. This correction
is not a successful drain runtime measurement; a fresh full trial is required.

Corrected attempt 37909926306 stopped earlier at host admission, before any
drain runtime acceptance. The child-log wrapper now retains only known admission
blocker codes and bounded numeric memory facts. It rejects malformed/private
diagnostics and never prints arbitrary child output. This supplies a diagnosis
for a refused host; it does not reduce reservations, bypass admission or establish
that the corrected controller has executed successfully.
