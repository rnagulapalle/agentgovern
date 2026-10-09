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
