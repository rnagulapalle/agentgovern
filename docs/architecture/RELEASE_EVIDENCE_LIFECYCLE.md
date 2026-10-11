# Release evidence lifecycle

Status: implementation and acceptance work in progress. No release is accepted.

## Observed dependency cycle

The retained accepted-artifact test associates retrieval with the current typed
runtime receipt. `verifyArtifactRequest` correctly requires that origin to be a
successful full CI run. The private platform workflow correctly retains an
accepted artifact only after `pnpm quality` passes. Therefore, replacing the
current typed receipt invalidates the old retrieval, while a new accepted
retrieval cannot exist before the same full gate passes.

The historical accepted-package receipt additionally measures 104 source files
from base `80f0d7cf91f462cc7f17ca5a5d07fffb1771d9b7`, using the verified empty overlay
`9ceffb7310338057cfe71a4ae1e2c98d2c485d81cdef906532a801f457a38d64`.
It cannot honestly establish acceptance of the current 99-file typed runtime plus
the additional package helpers. The current candidate trial independently proves
109 sources and pending A→B→A transitions but explicitly grants no release authority.

## Implemented additional release boundary

`scripts/staging-release-evidence.mjs` is now invoked after quality by the existing
clean/pushed-main release gate. It requires authenticated successful origin and
retrieval runs, complete observed job inventories, successful required quality,
retention and cleanup steps, exact artifact association, expiry checks, all 99
current typed runtime sources, all five current retrieval loaders, exact archive
and manifest bytes, matching worker/image identities and observed cold cleanup.
It additionally requires a current accepted-package envelope with two independently
successful accepted origins, all 106 runtime/helper source hashes, exact pending
authority and image transitions, the complete typed runtime result and independent
successful trial/quality/retention/cleanup observations. Candidate image transitions
do not satisfy this requirement.

The strict existing accepted-artifact validator is reused unchanged. Candidate
artifacts, partial origins and unsupported metadata do not gain release authority.
Four contract tests cover positive associations and 47 malformed/stale/partial refusal
cases. The actual authenticated current candidate is refused. These are eligibility
checks, not a substitute for runtime execution or enterprise readiness.

## Implemented separation and remaining execution

1. Historical receipt bytes are preserved and their complete original source
   identity is checked explicitly. An old receipt is never rehashed as current proof.
2. Keep current candidate runtime, browser, pending authority, rollback, worker
   versioning, drain and reset/source checks mandatory in quality.
3. The release-only boundary for current accepted-package promotion/reversion is
   implemented and its refusal cases tested. Current accepted runtime and cold
   retrieval alone do not prove rollback of those accepted image bytes.
4. Historical record integrity is now separate from current candidate acceptance.
   Historical artifacts retain their original origin IDs, raw byte pins, full
   runtime assertions and negative tests. Current candidate hashes and runtime
   checks remain mandatory; release requires the stronger current accepted envelope.
5. Run complete quality, produce a fresh successful origin and exact accepted artifact,
   cold-retrieve it independently, prove transitions using accepted images, and check
   the resulting release evidence against the actual checkout before deployment.

The October 10 historical source investigation reconstructed all 104 measured files
directly from the original Git base and verified every byte hash against the
preserved package receipt. The current pure trial transformation reproduces its
exact generated trial digest. The historical source snapshot is retained as
`docs/evidence/staging-package-historical-sources.json.gz`; its immutable byte pin,
original Git base, empty overlay and all 104 source hashes are checked. The historical
validator correctly retains its measured 97 runtime files plus seven helpers;
the current accepted-package validator requires 99 plus seven. The accepted package run
`37893973887` was independently observed as successful at commit
`2c3c550058cc574959f76a763f3d702cbd5beb01`.

Persistent staging, operator acceptance, live-provider guarantees and the quote
approval workflow remain independent outstanding requirements. No artifact
eligibility result proves capacity, HA, an enterprise SLA or superiority to Temporal.


Current accepted-package assembly now has a separate input loader. Historical and
candidate loaders/transforms remain unchanged. The accepted loader independently
queries authenticated origin run/artifact/jobs; current receipts and all 99 runtime
source bytes, complete successful quality/retention/cleanup, exact archive pins,
eight distinct images and a common worker build are mandatory. It reuses existing
owned archive validation and deletion. The generated trial retains full typed
HTTPS, pending A→B→A, actual effects, restore and cleanup gates without rebuilding.
Current accepted-package receipt coverage is 108 sources: 99 runtime files, seven
existing helpers, the accepted input loader and the strict artifact validator.
Synthetic refusal tests are only contract checks; actual successful accepted image
origins, cold retrieval and package execution remain required before release.

The original successful cold retrieval `37883440083` is now additionally preserved
as `staging-artifact-retrieval-before-chat-redesign-proof.json` with raw SHA256
`5266a30b1c9f666f0b3b97ff880cb8f364854359eb53e22b199a6afbdef442b5`.
Its exact origin association and all existing loader checks remain tested. The
current receipt filename can receive a newly measured retrieval without rewriting
historical evidence. The release-only boundary still demands current successful
accepted artifact/transition provenance; preserved historical evidence cannot
satisfy it.
