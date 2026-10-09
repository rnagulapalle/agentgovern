# Isolated reset assembly bootstrap — candidate, not deployed

The accepted drain receipt predates reset-intent migration15. A new strict trial
extension prepares both actual packaged worker artifacts before the first
application archive. It preserves the original drain, semantic replay, typed UI,
resource admission and restore checks; the measured source files remain unchanged.

`scripts/staging-reset-bootstrap.mjs` inspects immutable Linux/AMD64 image IDs and
extracts four bounded regular files from uniquely labeled, never-started containers.
It checks content-distinct workflow bytes with identical authority service and lock
bytes, then mounts the extracted files read-only into the bounded offline owner.
The owner connection is outside runtime configuration; no worker token or model
credential is supplied. Owned extraction containers and private files are removed.

The opt-in owner `scripts/staging-reset-enroll.mjs` installs the unchanged optional
migrations14/15 using their existing prerequisite/digest gates. It rechecks artifacts,
enrolls both exact image identities and requires an empty initial reset-intent table.
This happens before application writers start. Failed enrollment aborts the trial;
it does not undo an already committed first enrollment or reactivate a draining
build. Recovery must inspect the isolated database rather than claim pair-wide
transactional enrollment. Installation grants no reset or action approval.

`staging-reset-source.mjs` derives its parent from the unchanged drain extension.
Missing/ambiguous source anchors refuse. This module is not yet the complete reset
trial entry point: actual completed-run reset, response-loss process restart,
independent provider readback and restoration of a pending reset intent still need
assembled acceptance. Do not infer them from successful enrollment or schema tests.

Dedicated PostgreSQL tests exercise the full schema and actual enrollment, including
missing reset boundary, changed migration, image replacement, duplicate enrollment,
missing opt-in and symlink refusal. These use generated artifact files, not actual
packaged Linux workers. The host extraction and the newly derived parent remain
unaccepted until a full isolated runtime run verifies them. Production bootstrap,
operator APIs and the legacy production runner remain unchanged.

## Completed-run reset checkpoints

The derived controller now prepares a reset intent from the actual completed old
execution and its captured history, task boundary, retained image identity and
external recovery epoch. The host waits for its prior admission owner to exit,
then uses that stopped role's reserved256MiB allocation for two successive reset
owner containers. Their environment has only the separate owner URL, recovery
fence and Temporal connection fields; no application worker token or AWS fields.
The owner remains trusted and the mounted private trial directory contains runtime
configuration; this is not tenant-level credential isolation.

The first process commits uncertainty and sends one actual reset RPC, deliberately
discarding its successful response before exiting. The second has a fresh pool and
connection; a duplicate claim must refuse dispatch. Only completed pinned history
with the exact persisted reset lineage can resolve uncertainty. Host-side provider
readback must match all four pre-reset effects, and the controller rechecks action
identity, payload hashes, independent named approver and unchanged reservations.
The original replay/provider and writer-stop checkpoints remain in place.

These are implemented trial checkpoints, not a recorded packaged-worker result.
The full entry-point/receipt validation and pending-intent archive restoration are
still incomplete. In particular, restoring an archive captured before the reset
intent is inserted cannot prove stale-intent recovery. Unavailable history stays
uncertain; do not retry the RPC to manufacture a passing outcome.

## Pending-intent archive and fresh runtime entry point

The host captures a genuine full PostgreSQL custom archive after the first reset
owner exits with committed uncertainty, before the second owner resolves it.
After both semantic workers stop, it rotates an independent external recovery
epoch and restores that archive into a newly created disposable database on the
same already bounded PostgreSQL service. No runtime receives the copy's URL.
The primary trial database, its Temporal service and providers are preserved.

The separate copy owner requires the archived uncertain intent to match the exact
operation, original execution, retained image and history metadata. Old-epoch
claims refuse; quarantine revokes restored members, sessions, tokens, agents,
scopes and approvals. Worker admission stays draining. New intent identities
cannot replace the original, reservations and action IDs/hashes remain unchanged,
and the old intent stays uncertain. The host independently checks provider effects
and removes only the database it just created. It does not restore Temporal
persistence or prove a coordinated application/provider backup.

The primary parent's earlier approved archive now contains the actual enrolled
builds and empty migration15 table. Following its original restore/quarantine
checks, the separate worker-containment command runs twice. No old optional table
or FK is removed to force archive compatibility.

`scripts/staging-reset-proof.mjs` is the new opt-in fresh Linux/AMD64 private-CI
entry point. It verifies all113 accepted drain source fingerprints unchanged,
adds the reset/restore sources, preserves the original typed UI, admission, worker
loss/recovery, replay and provider checks, and hashes generated modules before
retaining an exclusive private receipt. Runtime acceptance requires one reset RPC,
a new-process duplicate refusal, exact lineage, unchanged four lifecycle effects,
and pending-intent archive containment. A successful verifier is consistency
checking, not a signed certificate. No full packaged-worker reset receipt has yet
been recorded. Long-term retention, persistent operator evaluation, live providers,
sustained SLOs, complete retirement/deletion policy and cutover remain unproved.

The dedicated schema-level PostgreSQL archive test now invokes the same recovery
verification against a real restored pending intent and an approval-bearing fixture
with a reserved budget. It proves that bounded helper behavior using synthetic
metadata, not the full named-approval packaged-worker/provider assembly.

## October 9 assembled attempt: refused

Private trial `37924267547` tested public source
`ab4c6ab72b7155cdeb38f1b549e2d683791c4fa3`. It reached
`reset-owner-dispatch/reset-existing-approved-run` and failed there. The post-runtime
quality step and receipt upload were skipped; temporary-input cleanup succeeded.
This is a failed assembled acceptance, not a reset or archive pass. The initial
sanitized checkpoint did not establish whether the owner failed input validation,
intent insertion, Temporal connection, RPC or response verification.

The next candidate adds fixed owner-phase diagnostics and bounded numeric gRPC or
SQLSTATE codes. Exception messages, details, stacks, histories, URLs and credentials
remain excluded. The host retains at most 4 KiB of private child stderr and forwards
only the exact allowlisted diagnostic line; the top-level driver applies the same
parser. No permission, state, resource, effect or receipt acceptance condition changes.
A fresh complete runtime and regression run is required after exact-head CI.
