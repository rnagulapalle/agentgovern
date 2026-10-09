# Tested staging image retention

Custom image retention and independent retrieval passed isolated acceptance.
Public review and operational acceptance remain separate. Production is unchanged.
The prior complete trial removed all four images after recording their IDs; those
IDs alone could not supply a future deployment with the exact tested content.

## Implemented contract

An explicit `LOOPLABS_STAGING_IMAGE_ARTIFACT` absolute directory opts the isolated
Linux CI trial into image-only export after all runtime/browser/restore assertions.
Its parent must already be owned by the runner with no group/other access. The
output directory must not exist: a retry cannot overwrite another release.

The exporter inspects the web, worker, provider-twin and offline provisioner IDs,
then saves those immutable IDs rather than mutable tags. It exports no containers,
volumes, runtime environment files, database archives, mounted keys or model inputs.
Image content still depends on the reviewed Docker build contexts; this is not a
comprehensive secret scanner. Private provider code makes this a private artifact.

`manifest.json` binds four role IDs, the content-bound worker build ID, the archive
byte length and SHA-256. The result separately records the manifest SHA-256. This
is checksum evidence, not a signed provenance attestation. The accepted archive
limit is 8 GiB; output length is checked after Docker save, not a disk quota.

After ordinary trial cleanup, every original image must actually be absent. The
loader checks the separately retained manifest digest, strict manifest shape,
archive length/digest and regular-file/private-directory constraints before Docker
load. It inspects the loaded IDs and reads the packaged worker build manifest in a
bounded, network-disabled container. It never starts an application service,
provisions credentials, restores state or authorizes execution. The validation
images are removed afterward while the archive remains available for retention.

Private CI uploads only `images.tar` and `manifest.json`, for seven days, after the
complete runtime trial and unchanged full quality gate succeed. Failed trials or
regression gates do not publish a release artifact. GitHub artifact access remains
private; a downloaded archive is not automatically trusted or deployable.

## Offline verification

After retrieving a successful private artifact, extract into an owned mode-0700
directory. Obtain the manifest digest from the separately retained successful
trial receipt, not from the downloaded manifest itself. Then run:

```sh
LOOPLABS_STAGING_IMAGE_LOAD=isolated node scripts/staging-image-load.mjs /absolute/private/release EXPECTED_MANIFEST_SHA256
```

This loads and verifies images only. Operators must separately satisfy host
admission, configuration, credentials, schema, secure connectivity, provider,
old-run compatibility, observability and release/cutover requirements. The offline
provisioner image is an operator role and must never receive runtime deployment
access. Seven-day artifact retention is not a long-term registry or rollback policy.

## Measured evidence

Private run `37877500571` passed the complete eight-role runtime, typed HTTPS
browser journey, restore containment and unchanged full quality gate (421 tests).
Its four-image archive is 2,399,583,744 bytes; private GitHub artifact
`11593736628` was uploaded after those gates. All 95 runtime-source fingerprints
matched the candidate before the actual receipt was imported into
`docs/evidence/staging-platform-browser-proof.json`.

Independent run `37879011443` used a separate fresh runner with read-only
contents/actions permission and no model input. It refused incompatible provenance,
downloaded the exact retained artifact, verified the externally supplied manifest
digest and archive bytes, cold-loaded all four identical image IDs, checked the
same worker build and removed the validation images. No rebuild or application
service start occurred. Both retrieval-code hashes matched the candidate before
importing `docs/evidence/staging-artifact-retrieval-proof.json`. Its test binds the
retrieval to the originating runtime artifact and current code.

Local full quality passed 425 tests and 52 rendered internal destinations after
the evidence increment. Public merge still requires the normal pre-push gate and
exact-head CI. These receipts are measured records, not signed attestations.

## Preserved failure and historical evidence

Initial private run `37876267185` passed runtime/cold reload with a
2,399,579,648-byte archive, then failed full quality: the freshness test expected
94 source files instead of the new 95. No artifact was uploaded. Its complete
failed job and runtime receipt remain retained privately. The correction kept the
strict source set and added exact artifact assertions; it did not waive a gate.

Review also fixed partial-load cleanup and refusal when Docker inventory is
unavailable. The corrected full run above proves those changed sources. Tests
cover corrupt archives, wrong digests, unsafe directories, failed saves, wrong
loaded identities/builds, partial loads and failed/foreign/expired provenance.

The earlier restore receipt is hash-preserved in
`docs/evidence/staging-platform-browser-restored-before-artifact-proof.json`.
Its test enforces SHA-256
`dca64d6cbc34405ec4a100ca8fe7122cdd8be5c2d861457fb766f10fd0844c37`.
Historical prepared and typed-before-restore records remain unchanged.

## Open acceptance

This proves retention/retrieval of the four custom images only. PostgreSQL `16`
and Temporal `1.31.0` service tags still need content-digest pinning and verified
retrieval. Promotion/rollback with pending runs, longer retention, persistent
hosting, sustained load and operator/security/provider acceptance remain open.
No enterprise production, SLA, arbitrary workflow or Temporal-superiority claim
is supported. See `ENTERPRISE_ACCEPTANCE.md` for the remaining release boundary.
