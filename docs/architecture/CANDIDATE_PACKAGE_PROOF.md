# Candidate package trial contract

This is a candidate proof path, not release acceptance. The cold-retrieval
step has measured evidence; pending-work package transitions remain unexecuted
for the current candidate. It addresses the
dependency between fresh retained package inputs and a full gate that itself needs
current package-transition evidence. Existing accepted-release retrieval and the
production deployment gate remain unchanged.

## Input boundary

Two independently completed assembled-platform CI trials must have passed the real
typed browser/runtime trial, receipt generation, candidate image retention and owned
cleanup. The full regression stage may be their only failure. An unrelated failure,
cancelled run, incomplete job inventory, expired artifact, changed source, mismatched
worker build or substituted archive refuses the input. Even inputs from a fully
successful run retain `releaseAccepted: false` on this path.

The owned private request file contains exactly two entries, each with `directory`
and `request`. The request pins `runId`, `artifactId`, `workflowCommit`,
`publicBaseCommit`, `overlaySha256`, `manifestSha256`, `archiveSha256` and
`receiptSha256`. Run, job and artifact metadata are fetched using authenticated
`gh api` calls to the fixed private repository, not supplied by the file or archive.
No private account credential is passed to a workload as part of these observations.
Both origins must pass observation before downloading or reading either receipt.
The prepared private CI workflow uses exact artifact IDs and run IDs with the
existing GitHub download action; metadata is observed again before image loading.

Each directory contains `images.tar`, `manifest.json` and
`staging-platform-browser-proof.json` downloaded from the exact pinned artifact.
The existing exact-byte loader verifies the manifest, archive, immutable image IDs
and isolated worker-manifest read. The receipt must bind the current repository
source list from `typedSourceFiles`, including the orchestration admission files.
Directories are owned and mode 0700; request and receipt files are owned, bounded
regular files with mode 0600. Symlinks and changes during receipt reads refuse.
Validated initially absent image IDs alone become caller-owned cleanup targets;
there is no Docker prune or deletion of remote artifacts.

## Trial and output boundary

`scripts/staging-candidate-package-proof.mjs` runs only in fresh isolated Linux/AMD64
CI with explicit candidate/package/typed/browser opt-ins. Its source transformation
reuses `retainedPackageTrial`: pending API authority checks, the same named HTTPS
390px session, A→B→A package transitions, independent approvals, actual effect
readback, crash recovery, history replay and archive containment remain required.
The trial retrieves the measured images; it cannot rebuild or export replacements.

The host must supply `LOOPLABS_STAGING_CANDIDATE_PACKAGE_REQUESTS` and a separate
`LOOPLABS_STAGING_CANDIDATE_PACKAGE_RECEIPT` under its owned `RUNNER_TEMP`, along with
the existing scoped planner input and exact source metadata. The output is created
exclusively and records both non-release origins, transitions, complete typed runtime
result, current source hashes and generated trial digest. It never replaces the
historical accepted package receipt or authorizes deployment.

The runtime `sourceCommit` identifies the reviewed private FetchSandbox fixture
(`08372aadbaa6fb8f37368c6900323b8619c10f2c`), not the LoopLabs application base.
The latter is separately bound by `executionEvidence.publicBaseCommit`, the exact
overlay digest and the current application source fingerprints. Substituting one
commit for the other refuses candidate receipt validation.

## Current evidence and remaining work

Contract tests cover authenticated metadata association, bounded complete job lists,
malformed and supplied origin data, duplicate origins, source/build/image mismatch,
archive substitution, local-invocation refusal and preservation of the original
runtime checks. Generated module syntax is checked. These tests use synthetic
metadata and archives; they do not prove an actual CI retrieval or transition.

Two fresh assembled candidate packages must be independently verified and retrieved,
and the actual package trial must run with its scoped planner session. Its result then needs
review alongside the full unchanged regression gate and the other current-source
browser, semantic-version, drain and reset/archive proofs. Persistent enterprise
staging, operator acceptance, live-provider guarantees and production cutover remain
outside this disposable proof.

On October 9, 2026, private CI run `38030935009` passed the actual typed HTTPS
browser/runtime trial and retained candidate artifact `11662595630`. Its receipt
matches all 99 reviewed application source fingerprints and reports four
provider-twin effects. It is a non-release input: the CI full quality gate failed.
The independent second measurement, run `38031707988`, also passed the runtime
trial and retained candidate artifact `11663336608`; its full quality gate failed.
Both authenticated origins and current source hashes are verified. They have the
same reviewed build and eight distinct image IDs. The archives have not yet been
retrieved for an actual package transition trial. The current local unchanged quality run has 665 passing
tests and five failing evidence checks: accepted artifact retrieval, semantic
versioning, drain, reset/archive and package promotion/reversion. No application
release or production deployment follows from these partial results.

## October 10 observations

Private CI run `38060784131` successfully retrieved the two October 10
pre-redesign candidate archives from their authenticated pinned origins and
verified exact archive/manifest bytes, immutable custom/dependency image
identities and worker manifests. The loader removed only images it owned.
No services were started and no release acceptance was granted.

Those origins (`38030935009` and `38031707988`) predate the latest chat layout
and independent discount-approval correction. Their successful retrieval does
not prove current-source package promotion or rollback. Current typed UI trial
`38063579096` completed its actual runtime and browser checks; fresh origins and the actual pending-work
transition trial are still required. The accepted-release retrieval checker
continues to require a successful full-gate origin and is not relaxed by
these candidate observations.


### Current redesigned UI packages, October 10

Run `38063579096` and independent run `38065228354` both completed the actual
assembled typed HTTPS workflow and retained candidate artifacts `11674286233`
and `11675048098`. The authenticated completed jobs confirm successful measured
receipt retention and owned fixture/model-input cleanup. Only the unchanged full
quality step failed in either origin; the second reported 661 passing tests and
13 retained-evidence failures. Neither package is accepted for release.

Exact receipt bytes, current 99 runtime source fingerprints, compatible worker
build, manifest/archive pins and eight distinct immutable custom-image identities
were verified before preparing the paired requests. No candidate archive was
downloaded onto the shared laptop.

Actual transition attempt `38066371377` retrieved both pinned artifacts and
validated the owned download files, then stopped during exact fixture preparation.
No model input or runtime trial started; owned-input cleanup passed. The isolated
workflow now retains read-only Git credentials solely for lazy blob retrieval of
the pinned fixture archive. Only backend paths enter the fixture output, and
checkout cleanup removes Git credentials. The pending-work browser driver was
also corrected to open the redesigned Connections disclosure before selecting a
record; its action/session/approval/effect assertions remain unchanged.

Corrected attempt `38066572459` completed successfully. Both exact archives were
retrieved from authenticated origins. The actual A→B→A trial preserved held action
identities, approval hashes, the same named secure HTTPS mobile session and three
pending-work reloads. No self-approval was offered; independent approval later
completed the original full typed runtime with four observed provider-twin effects.
History replay, archive-containment checks and owned-input/image cleanup passed.
The downloaded receipt matches 109 current source fingerprints and the exact
reviewed generated trial. The new retained candidate-evidence check and twenty
contract tests passed. This does not replace historical accepted-release checks
or authorize deployment; `releaseAccepted` remains false. No application deployment
occurred.
