# Staging runtime dependency identities

Complete private trial `37881876443` passed runtime acceptance and all 429
regression tests. Its actual receipt matches all 97 covered runtime files and
records three service-image bindings and six successful offline schema invocations.
Separate fresh-runner run `37883440083` also passed, with all five retrieval
sources matching. Public CI/release checks remain pending; production is unchanged.
The complete allocated Linux trial previously selected mutable PostgreSQL and Temporal tags even though its four custom images were retained.

`config/staging-runtime-images.json` records reviewed linux/amd64 manifests and
expected configuration IDs for PostgreSQL 16, Temporal server 1.31.0 and its
offline schema tool. Selection tags are documentary only. Runtime retrieval uses
only the recorded content references; wrong identity, registry, architecture,
missing evidence or retrieval failure refuses before service admission. There is
no tag fallback. Both database containers and the Temporal server must actually
use those IDs. Each of the six offline schema commands rechecks the schema image.

The typed receipt requires all three retrieved identities, three actual runtime
bindings and six successful schema invocations. Its source set adds the lock and
verifier. These are checksummed observations, not signed supply-chain provenance
or independent vulnerability assessment. Unrelated native local proof fixtures
remain outside this Linux dependency scope.

The previous custom-image trial is preserved byte-for-byte in
`evidence/staging-platform-browser-before-dependency-proof.json` (SHA-256
63bf8c574b473a056b6dd4f79f0280321c11c69106982d8d40a261eb40cb1a97).
The preserved earlier retrieval remains bound to that historical origin and
does not prove a new artifact. Dependency retrieval cleanup is implemented in
`scripts/staging-runtime-retrieval.mjs`. A successful initial inventory establishes
which reviewed IDs predate the check. It preserves those IDs and foreign images,
removes only newly acquired reviewed references, attempts the other owned removals
when one fails, and refuses success on pull, identity, inventory or cleanup failure.
No force, pruning or service-start operation is allowed. Unit tests cover partial
pulls, preexisting/foreign preservation, failed removal and missing inventory.
The actual fresh-runner receipt covers this additional source.

Both isolated acceptance records now pass. Current-source regression and freshness
gates require both actual runtime and retrieval receipts; the normal public
quality, pre-push and exact-head CI gates remain required before merge. Local full
quality passed 435 tests across 74 files and 52 rendered destinations after the
evidence increment. Promotion/rollback, long-term retention, persistent hosting
and enterprise operational acceptance remain open.


## Preserved candidate and refusal evidence

Initial candidate run `37881046708` also passed runtime and all 429 tests, retaining
artifact `11594977063`. Subsequent review found that its image-ID validation could
coerce an array to a string. The old verifier made two Docker calls for that
malformed input; the corrected verifier makes none. No application service was
started by the rejected input. The initial result remains private historical
evidence; its verifier hash differs from the corrected candidate and it is not
the current acceptance receipt.

Corrected run `37881876443` retained artifact `11594324205`; its archive is
2,399,602,688 bytes. The successful origin, head commit, manifest checksum and
archive checksum bind the next private download. Temporary model input was scoped
to the web planner; repository secrets were removed after input preparation and
absence was verified. No credentials or database/provider state are retained in
the custom-image artifact.


## Independent retrieval measured

Run `37883440083` used a separate fresh Linux runner with read-only GitHub
contents/actions permission and no model input. It verified the exact successful
origin and private artifact, the external manifest checksum and archive bytes,
then cold-loaded all four identical custom image IDs and worker build. It also
retrieved and inspected all three reviewed Linux/AMD64 dependency identities.
The validation images it added were removed; preexisting and unrelated images
were preserved. No application services were started, no credentials were
provisioned, and no database restore or ownership cutover occurred.

The receipt in `evidence/staging-artifact-retrieval-proof.json` binds that origin
and all five retrieval/verifier/configuration sources. The prior two-source
retrieval receipt is hash-preserved in
`evidence/staging-artifact-retrieval-before-dependency-proof.json`, SHA-256
29c6379ddfc04c54a3fbfd5f0752bce12e8cbc263b7d1f19748a39745b69185e.
Tests retain its historical origin association and additionally require the new
current artifact, dependency identities and five current source hashes.

This closes dependency pinning and measured retrieval for the disposable Linux
trial. It does not establish long-term registry availability, image vulnerability
acceptance, promotion/rollback, persistent staging, an enterprise production SLA
or live-provider guarantees.
