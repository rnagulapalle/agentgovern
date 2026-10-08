# Workspace restore containment

October 7, 2026. Isolated application-database acceptance, not enterprise production certification.

## Why restarting is different from restoring

An old application backup may contain an approved action that already took effect,
an active credential revoked after backup, or a pending workflow whose Temporal
history has already completed. Neither an old approval nor a completed Temporal
history can establish the current authority or provider outcome. Do not blindly
resume restored work.

PostgreSQL custom archives provide a consistent database snapshot, not an atomic
snapshot of third-party services. Temporal activities also require application-level
idempotency. These design references inform the containment boundary:
[PostgreSQL SQL dumps](https://www.postgresql.org/docs/17/backup-dump.html),
[Temporal architecture](https://github.com/temporalio/temporal/blob/main/docs/architecture/README.md).

## Implemented boundary

Migration 10 adds one deployment-owned recovery epoch per workspace and an
append-only recovery record. Enroll with a separate migration-owner connection:

```sh
pnpm workspace:recovery enroll
```

Requires migrations through 9, `LOOPLABS_MIGRATION_DATABASE_URL`,
`LOOPLABS_WORKSPACE_ID`, and a fresh UUID v4 `LOOPLABS_RECOVERY_EPOCH` supplied
privately by the operator. Apply the same epoch to every web, legacy-worker and
Temporal-worker deployment, stored outside the database backup. Enrollment cannot
silently rotate an existing fence. Runtime gets SELECT only on recovery tables.

When configured, authentication and delayed authorization both require the database
epoch to match deployment configuration. Missing migration, missing workspace row,
malformed/empty configuration or a restored older epoch refuse authority. Leaving
the variable unset preserves existing deployments; those deployments do not gain
this restore protection. Current production is not enrolled by this change.

The offline quarantine operation atomically:

- Revokes restored workload/agent/operator tokens and member sessions; disables
  members and agents. Fresh identities must be provisioned after incident review.
- Pauses active workflows and disables/increments connector policies.
- Clears all action approvals and execution leases. Pending historical actions
  become uncertain: a held action in the backup may have taken effect afterward.
- Preserves stable IDs, exact payloads, budget reservations and historical effect
  evidence. Historical succeeded/recovered states are retained for read-back review.
- Advances the database fence to the new deployment epoch and records archive hash
  and affected counts. Duplicate quarantine with the same epoch/archive is a no-op;
  changed archive for the same epoch is refused. Other workspaces are unchanged.

No API exposes this operation. It requires database-owner privileges, an archive
file whose SHA-256 is computed locally, and explicit restore acknowledgement.

## Required recovery order

1. Stop incoming mutations and every worker/scheduler. Drain or contain in-flight
   external requests; a database lock cannot recall a request already sent.
2. Generate a new epoch and deploy it to **all** processes before restoring. Never
   reuse a previous epoch. Keep the deployment configuration outside the archive.
3. Restore the verified database archive with the migration-owner account into the
   isolated recovery database. Keep application and connector writes stopped.
4. Set `LOOPLABS_RESTORE_ARCHIVE` to the verified archive, and set
   `LOOPLABS_RESTORE_ACK=WRITERS_STOPPED_AND_EPOCH_ROTATED`. Then run:

   ```sh
   pnpm workspace:recovery quarantine
   ```

5. Verify the recovery record, paused runs, revoked keys, absent approvals and
   disabled policies. Reissue operator credentials and member passwords through
   the private provisioning process. Do not reactivate old secrets or workload keys.
6. With a fresh recovery operator, read back existing effects using their original
   action IDs. Unknown evidence remains uncertain. Do not regenerate action IDs or
   resend an email to infer whether it happened. Compare Temporal history without
   treating it as authorization. Keep workloads disabled while reconciling.
7. Only enable new, reviewed work after policy/identity/connector verification.
   Current paused plans cannot resume; lost approvals require new reviewed work.
   Provider evidence and operator decisions must prevent reissuing an already
   completed business operation under a new plan ID.

The acknowledgement string is an operator attestation, not an automatic check of
all remote processes. An undeclared restore or a worker configured without the
new epoch is not automatically detected. This runbook is part of the safety boundary.

## Reproducible measured proof

```sh
pnpm workspace:restore-proof
pnpm quality
```

Requires dedicated `LOOPLABS_TEST_DATABASE_URL`, compatible `pg_dump`/`pg_restore`,
Temporal test runtime and the existing private HTTP twins. The proof enrolls through
the actual CLI, dumps held/approved work, completes one run through an actual Temporal
worker, revokes identities, rotates deployment configuration, and performs a real
`pg_restore`. Old approvals/revocations are observably rolled back; the new epoch
refuses resurrected authority **before** quarantine. The actual CLI requires the
restore acknowledgement, quarantines atomically, and is idempotent. A fresh operator
then reads back exactly the two original provider effects; unknown work stays held
as uncertain. Final provider effects stay at two.

Evidence: [workspace restore record](evidence/workspace-restore-proof.json). Fingerprint
tests reject stale source evidence. Unit/integration tests cover missing/malformed
fences, delayed authority, both authentication paths, peer-tenant isolation, stable
IDs/budgets, approval removal, append-only records and replay.

Still open: whole-database/WAL/PITR and remote restore, replicated failover, automated
backup retention/verification, encrypted off-host storage, delivered recovery alerts,
independent security review, multiple-workspace deployment configuration, real-provider
receipt retention and operator-agreed measured RPO/RTO. This one-laptop exercise does
not establish availability or production disaster recovery objectives.

The regression history is preserved in
[evidence/workspace-recovery-validation.json](evidence/workspace-recovery-validation.json).
One initial container recovery attempt timed out after its zero-effect containment check; its exact cause
was not captured. A diagnostic rerun passed unchanged readiness limits. The packaged
proof now deliberately starts both replacements with the database unavailable,
checks actual process termination and zero effects, then retries confirmed terminal
children with bounded attempts. A live unready process is never killed just because
an observation timed out. Remote supervisor/recovery acceptance remains open.
