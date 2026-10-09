# Isolated staging restore fence

October 8, 2026. Component and assembled runtime proofs passed; full release gate pending. Production unchanged.

## Required invariant

Restoring an approved application backup must not restore authority to execute it.
Every staged web, worker and scheduler receives the same externally held recovery
epoch. Bootstrap enrolls migration 10 and refuses existing-installation retries
when the database fence differs or is missing, before creating any workload key.
Runtime roles cannot change the recovery fence or erase its journal.

## Evidence and regression

The actual disposable PostgreSQL component trial restores a previously revoked
workload token, verifies authentication and delayed authorization refuse it under
a rotated epoch, runs offline quarantine twice, checks a single recovery record,
and preserves identity/token counts. The first post-restore bootstrap check failed
because one new key was created. The corrected early check passes the same actual
archive assertion; no assertion or threshold was removed.

The assembled trial must separately prove:

1. Independently approved actions are actually included in the archive before
   execution; workers and scheduler remain stopped during that snapshot.
2. The original workflow completes with exact provider effects and real history
   replay, including lost-response reconciliation and typed HTTPS browser review.
3. All application writers actually stop; deployment epoch changes outside the
   backup. Temporal and provider state remain ahead of the restored application.
4. Restored session and approval requests refuse before quarantine without
   modifying saved action state. Both actual packaged execution roles exit with
   the expected startup-refusal status, not a timeout or OOM.
5. Offline quarantine revokes restored authority, preserves action IDs, payload
   hashes and reservations, removes approvals, and is idempotent for that archive.
6. Remove the epoch from actual staged web/worker configuration. The restored
   session/approval checks and both packaged workload roles must still refuse;
   omission cannot silently opt the staged runtime out of containment.
7. A stale bootstrap cannot create replacement tokens. Old sessions and disabled
   password accounts refuse after quarantine. Independent provider effects remain
   exactly four; restoring the application must not repeat a CRM write or email.

The receipt recorder requires every containment field and its exact effect count.
It binds the measured source set including the restore controller and offline CLI.
Synthetic recorder tests check refusal only; they are not runtime acceptance.
The existing retained browser receipt remains historical until a fresh successful
assembled run replaces it. Freshness failures are expected while sources change.

## Explicit limits

This proves no remote RPO/RTO, replicated failover, PITR/WAL recovery, delivered
alerts, operator acceptance, sustained tenant capacity or live-provider delivery.
Password sign-in before quarantine is not asserted blocked: execution authority
is fenced; offline quarantine then disables the restored accounts. A missing
epoch in legacy production is not made safe by this isolated staging change.
No automatic re-enrollment, reservation reset or restored approval resumption is
allowed. Fresh identities and external-effect reconciliation require operator
review under [WORKSPACE_DISASTER_RECOVERY.md](WORKSPACE_DISASTER_RECOVERY.md).

A direct runtime check additionally found that missing epoch configuration could
disable a staging fence. The new adversarial database test reproduced that failure
and passes after staging explicitly requires the epoch. Tenant fixtures now enroll
the same externally held deployment epoch for both workspaces and retain the
actual least-privilege provisioning grants. Fresh packaged/browser/tenant proof is
required; earlier measurements do not prove these new runtime sources.

## Preserved assembled failure

Private CI run `37868632655`, candidate `3d1810abafe41b1a92b96884e22fdff1981b8195`,
failed at `archive-restore-containment` after reaching that parent checkpoint.
The diagnostic exposed no more specific cause; none is inferred. No full receipt
was retained and no regression gate was bypassed. The reviewed follow-up adds
known subcheckpoints for archive restore, restored HTTP authority, packaged role
refusal, missing-epoch refusal, offline quarantine and stale-bootstrap refusal.
Controller diagnostics can retain only predefined checkpoint names; raw database
errors, cookies, passwords and action payloads remain private. This is diagnosis
work, not a passed assembled restore claim. Production remains unchanged.


The next exact candidate (`37871421835`, private commit `7e122e4d`) reached
`restored-http-before-quarantine` and failed its `old-session-http` assertion.
An actual profile-route regression reproduced HTTP 200 under a rotated external
epoch: `memberSession` was invoked directly without the action-authentication
fence. The corrected shared member-session and delayed member-authority checks
refuse mismatched and omitted staging epochs. The regression also verifies normal
enrolled access, legacy unenrolled compatibility and post-quarantine HTTP 401.
The failed assembled run remains retained; this correction requires fresh runtime
proof and unchanged quality gates before acceptance.


## Measured assembled runtime result

Private run `37873330354` passed the complete runtime trial and recorded 94
source fingerprints, four retained provider effects, restored session/approval
refusal, actual packaged-role startup refusal (including omitted epoch), offline
quarantine/replay and stale-bootstrap refusal. Its following quality gate failed
two fixtures that opted into staging without enrolling the recovery epoch (412
other tests passed). Those fixtures now preserve their original permission and
malformed-request assertions under valid enrollment and separately assert missing
epoch refusal; their 52 focused tests pass. The measured runtime receipt is retained
without claiming overall CI success. Local full quality and exact-head CI remain
required before the public commit/release.
