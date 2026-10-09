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
