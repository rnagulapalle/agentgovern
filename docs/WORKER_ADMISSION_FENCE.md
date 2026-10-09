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
Registry metadata is owner-supplied, not a cryptographic attestation. A subsequent
artifact-enrollment command and actual assembled lifecycle proof remain required.

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
