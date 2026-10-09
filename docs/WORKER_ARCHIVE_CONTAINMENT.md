# Worker archive recovery — optional candidate, not deployed

The accepted drain trial's original application archive predates migrations14/15.
It cannot prove recovery of the worker registry and reset intents. Do not delete
new tables, remove dependencies or disable triggers to make an old dump appear
compatible. Existing measured restore and runtime source files are unchanged.

The new dedicated PostgreSQL test applies the actual schema through migration15,
creates a genuine custom dump, advances an intent to observed and drains its build,
then restores the earlier dump. Restoration demonstrably rolls the intent back to
uncertain and the build back to active. A physical archive can resurrect registry
state even though ordinary SQL reactivation is forbidden. Deployment recovery
epochs and offline containment must remain outside the archive.

With the external epoch rotated before restore, old reset-intent claims refuse.
After the existing workspace quarantine has completed, a separate deployment-owner
operation requires its exact archive hash, current external/database epoch,
migration14/15 digests and stopped-writers acknowledgement. It moves every restored
active build to draining, preserving image/build identities, routes, reservations
and old reset intents. Repeated containment is idempotent. It creates no new action,
reset execution, approval, admission permission or artifact-deletion permission.

The candidate worker registry is deployment-global. This operation therefore
refuses deployments with more than one workspace until a multi-workspace restore
policy is designed and proved. It must not silently affect another tenant.
Runtime credentials cannot perform it. The database owner and external operator
configuration remain trusted; an acknowledgement is an operator assertion, not a
process scan or proof that an in-flight provider request has stopped.

## Explicit offline sequence

Keep writers stopped and rotate the external recovery epoch as described in
[WORKSPACE_DISASTER_RECOVERY.md](WORKSPACE_DISASTER_RECOVERY.md). Use a compatible
post15 archive and perform its original workspace quarantine first. Then, with
the same private owner connection, workspace ID, archive path, new epoch and
`LOOPLABS_RESTORE_ACK=WRITERS_STOPPED_AND_EPOCH_ROTATED`, run:

    node scripts/worker-restore-contain.mjs

This is opt-in candidate plumbing. Normal bootstrap, production and the existing
quarantine command do not invoke it automatically. Old build reactivation remains
forbidden: review and enroll a new artifact rather than editing an old identity.
An existing pinned history still needs current authority and provider readback;
draining alone neither authorizes execution nor permits deletion of its artifacts.

## Actual measured scope and limits

`reset-archive.test.mjs` uses real `pg_dump`/`pg_restore` against a dedicated isolated
schema containing the actual migrations. An older pre15 dump refuses atomically
when current FK-dependent optional tables remain; the current data stays intact.
The compatible post15 dump restores successfully, exposing the stale intent and
active build. Wrong archive evidence, missing acknowledgement, skipped workspace
quarantine, changed migration, runtime role and multi-workspace scope refuse.
After containment, direct reactivation and new-route admission refuse, reservations
remain unchanged and restored members/scopes remain quarantined.

This schema-level trial uses synthetic route/image/intent records. It does not
restore actual Temporal persistence, retained packaged worker bytes or provider
effects, or prove cluster/WAL/PITR, cryptographic backup provenance, remote retention,
RPO/RTO or enterprise service objectives. The local client is PostgreSQL17. CI uses
the same job's PostgreSQL17 service client rather than assuming its host client is
compatible. Full assembled named-approval/worker/provider/reset/archive proof is
still required before exposing operator reset or claiming enterprise acceptance.
