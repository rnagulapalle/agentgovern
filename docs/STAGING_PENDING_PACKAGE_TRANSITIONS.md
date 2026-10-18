# Pending-work application package transitions

October 9, 2026. **Disposable acceptance passed; production unchanged.**

Private CI [37893973887](https://github.com/rnagulapalle/sandbox/actions/runs/37893973887)
completed successfully on private commit `2c3c550058cc574959f76a763f3d702cbd5beb01`
using public source `80f0d7cf91f462cc7f17ca5a5d07fffb1771d9b7` and an independently
checked empty overlay. The runtime trial and following full regression gate passed.
Artifact `11600575554` contains the receipt only, retained for seven days. Its
JSON SHA-256 is `52a661efed6c97a463883ba75cc3f9c27c265c533ce874c4496e4f2d4c619cd1`.
See [the actual receipt](evidence/staging-package-proof.json). These are measured
checksummed observations, not cryptographic attestations or an independent audit.

## What actually ran

The fresh Linux/AMD64 runner verified both successful archive origins and cold-loaded
their exact four custom image IDs. Origin A is `37877500571`; B is `37881876443`.
All eight image IDs differ, but both releases have the **same content-bound worker
build**. No application image was rebuilt. PostgreSQL, Temporal and schema-tool
identities remained pinned to the reviewed dependency lock.

With a saved scoped plan and two unapproved held actions, the trial switched A→B,
then B→A. It stopped and replaced only web, worker and scheduler. Both databases,
Temporal, authorization and the provider twin retained their exact container IDs,
image IDs and configuration. The trial compared pending authority before stopping,
after stopping and after replacement; exact action IDs, payload hashes, grants,
policy snapshots, allowance reservations and run ownership remained unchanged.
Independent provider readback confirmed zero effects during the transitions.

Actual Chromium used trusted HTTPS and a named form sign-in at 390×844. The same
secure session reopened the saved held run before switching and after each switch.
The action hashes were unchanged; requester self-approval remained unavailable;
there was no horizontal overflow. This is a real UI observation, not a scripted
receipt fixture.

The unchanged parent acceptance then exercised runtime SIGKILL, independent exact
approvals, actual provider-twin effects, lost-response reconciliation, authenticated
Temporal history replay, real typed planning/clarification and approved-archive
restore containment. Exactly four intended effects remained. Loaded release images
were removed after the trial. The 104 source fingerprints and generated trial hash
match the retained receipt; consistency tests reject missing coverage or altered
sources. Those tests cannot substitute for another actual runtime trial.

## Failures retained and corrected

Earlier candidates failed and are not accepted evidence. Run `37888383459` exhausted
runner storage while loading the second archive. The loader now deletes only its
owned local archive after complete hash/byte/image/build validation and a second
file-identity check. It preserves remote artifacts, manifests and loaded layers.

Run `37890439330` refused application environment comparison. Independent actual
Compose metadata showed identical unique key/value entries in different order.
The comparison now sorts full entries, preserving every value; malformed or
duplicate keys still refuse. No field was exempted.

Run `37892334696` refused retained infrastructure. Twenty independent inspections
of the same Docker container demonstrated mount ordering variation. Mounts are
now compared by unique canonical destination with every attribute retained.
Changed source, write access, type, malformed/aliased or duplicate destinations
still refuse. The subsequent full successful trial supplies acceptance; the
metadata experiments alone did not prove the failed trial's complete cause.

## Reproduction and safety boundary

The private `.github/workflows/looplabs-package-proof.yml` verifies successful
origin/head/artifact metadata before downloading the retained archives. It invokes
`node --import tsx scripts/staging-package-proof.mjs` with explicit isolated Linux
admission and full typed/browser gates, then runs `pnpm quality`. Receipt upload
occurs only after both succeed. Temporary model authority goes only to the web
planner and is removed from the repository after preparation. A new run must check
artifact availability and obtain a fresh bounded expiring session; never reuse
expired credentials or fabricate a result from retained JSON.

This helper is internal to the disposable proof. It is not a production rollback
command. Failures contain all application writers; they do not automatically restart
old code, restore a database, rewind ownership/approvals or reset reservations.

## Still required

- A semantic worker-version change with measured old-history routing, replay,
  incompatibility refusal and drain/retention acceptance.
- Persistent staging admission, operator-owned promotion/reversion procedures,
  alert delivery, sustained tenant workload and agreed SLO/RPO/RTO drills.
- Real provider atomicity/idempotency/delivery guarantees and enterprise security
  review; hosted CRM remains blocked without atomic source-version enforcement.
- Standard release gates and explicit production ownership cutover. Production
  continues using the legacy runner.

The successful same-build package transition closes one measured release gap. It
does not establish enterprise production readiness or superiority over Temporal.
