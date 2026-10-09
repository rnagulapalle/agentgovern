# Isolated staging platform packaging

October 8, 2026. The complete disposable eight-service API/runtime trial has
passed. This is **not persistent remote staging or enterprise acceptance**.
Production and its legacy runner are unchanged.

`docker-compose.temporal-platform.yml` describes the complete eight-role footprint:
web, application PostgreSQL, Temporal PostgreSQL, Temporal service, public-key
authorization endpoint, worker, scheduler and private FetchSandbox CRM/email twin.
Use a separate Compose project; databases/provider state are project-scoped volumes,
not existing production volumes. Application and orchestration networks are internal;
only the web joins an egress network for the bounded planner. The web publishes an
explicit loopback port; all data/service ports remain unpublished. The future HTTPS
proxy must connect only to that web port and preserve the configured origin.

Every service declares memory, CPU and PID limits and bounded logs. Non-database
services use a read-only root. PostgreSQL retains only the initialization capabilities
listed in the file. These declarations are not load measurements or proof of actual
enforcement for the complete stack. CPU limits can sum above host cores; measure
contention and choose budgets before admitting the workload. This does not establish
isolation from a compromised host or container runtime.

## Private configuration and bootstrap requirements

Set `LOOPLABS_STAGING_PRIVATE_DIR`, `LOOPLABS_STAGING_WEB_PORT` and the reviewed
`LOOPLABS_STAGING_WEB_IMAGE`, `LOOPLABS_STAGING_WORKER_IMAGE` and
`LOOPLABS_STAGING_TWIN_IMAGE`. The Linux/AMD64 dependency increment also requires
`LOOPLABS_STAGING_POSTGRES_IMAGE` and `LOOPLABS_STAGING_TEMPORAL_IMAGE` from the
reviewed content references in `config/staging-runtime-images.json`; the complete
trial supplies these through the strict lock verifier. See
[STAGING_RUNTIME_DEPENDENCIES.md](STAGING_RUNTIME_DEPENDENCIES.md) for validation
status, offline schema identity and separate retrieval requirements. A tag alone is not artifact attestation: retain image
digests and verify the worker's content-bound manifest and matching record build pin.
Render `docker compose -p <dedicated-project> -f docker-compose.temporal-platform.yml
config` privately: resolved environment output may contain credentials.

The directory must be private and contain separately scoped inputs:

- `application-db.env` and `temporal-db.env`: distinct database credentials and
  databases. Never point these services at production data.
- `web.env`: restricted runtime database URL, staging origin, isolated record catalog,
  private twin binding and bounded planner settings. No migration-owner credential or
  Temporal administrator key.
- `worker.env`: restricted database URL, scoped workload token, staging namespace,
  task queue, matching content-bound build IDs, namespace-scoped JWT and client TLS
  paths under `/run/temporal-tls`. No migration-owner or administrator credential.
- `server.yaml`: explicit Temporal SQL persistence/visibility, TLS and default
  authorizer/claim mapper configuration. Reference `/run/server-tls` for server keys
  and `http://authorization:8080/jwks` for public verification material. Do not use
  unauthenticated auto-setup or disable certificate/hostname verification.
- `server-tls/` and `client-tls/`: separately mounted server/client credentials and
  trusted CA material, with reviewed expiry and rotation procedures.
- `jwks.json`: only strong public RSA keys with unique `kid`, `alg: RS256` and
  `use: sig`. Keep the private signer and administrator JWT outside all runtime
  mounts. The endpoint reloads this file per request and returns 503 for malformed,
  weak or private-key-containing input. Rotation must retain the old public key
  until old workload credentials are intentionally drained or revoked.

Before normal startup, explicit provisioning still has to initialize Temporal SQL
schemas and the isolated namespace, apply the current immutable application
migrations via their existing provisioners, create restricted runtime grants and
independent named members, and seed the provider volume with its private credential
and enrolled test records (fixture UID 1000). Do not start workers against an empty
or partially initialized database. Do not automatically approve, enroll or execute
customer work as part of infrastructure setup. The existing worker-only staging file
remains supported; this file does not silently replace it.

## Application database bootstrap

`scripts/staging-database-bootstrap.mjs` now wraps the existing twelve application
provisioners in their required order. Run it from the reviewed repository with
installed dependencies using `node --import tsx scripts/staging-database-bootstrap.mjs
<new-private-installation-directory>`. Supply `LOOPLABS_STAGING_BOOTSTRAP=isolated`
and `LOOPLABS_STAGING_OWNER_URL` through private operator configuration. Also supply
a fresh, externally held UUID v4 `LOOPLABS_RECOVERY_EPOCH`; retries must use the
same epoch. Bootstrap enrolls migration 10 before exporting runtime configuration, and
assembled web, worker and scheduler configuration must match it. Existing-directory
retries check the fence before any provisioner can issue another workload key. The owner
must be `ll_stage_owner`, database `looplabs_staging`, host `application-db`, without
connection query overrides. Execute inside the isolated network when that service
name is used. A disposable local proof alone may explicitly enable
`LOOPLABS_STAGING_LOOPBACK_PROOF=true` and use `127.0.0.1`.

First bootstrap requires an empty dedicated database/cluster and a new output
directory. The target-name guard prevents accidental defaults; it does not attest
that a host is genuinely isolated. Provisioners preserve their released migration
digests and transactions. Repeat provisioning uses the same private credentials;
existing workload credentials are loaded before retry rather than silently rotated.
An altered migration, retargeted runtime connection or privileged/incomplete runtime
stops provisioning. Partial failure leaves private state for inspection; do not
delete it and adopt/reset an existing database blindly.

The directory's `.env.local` and `.local/` contain owner/member/setup credentials;
keep them offline and **never mount the entire directory into web/workers**. Only
`runtime-db.env` and `workload.env` are separated for composing restricted runtime
inputs. The script adds read-only SELECT on the migration ledger for the existing
preflight, then verifies the actual runtime connection against that preflight.
It does not enroll records, grant record authority, approve actions, start workers
or configure Temporal/provider/TLS. Offline restore review and quarantine remain required before restoring authority.
An existing installation with a missing or different database fence refuses before
any provisioner runs, including after a partially completed initial installation.
Do not delete its private directory to bypass that refusal.

The actual disposable PostgreSQL proof applies migrations 1–5 and 7–13,
checks restricted privileges and independent members/workload, repeats without
credential/token changes, refuses a retargeted runtime, and stops on a corrupted
retained migration. It creates no scoped grants/actions/runs, then removes its own
database container, network and private temporary installation. This proof now runs
as a required step in `pnpm quality`; unavailable Docker or proof failure is fatal.
Reproduce with `node --import tsx scripts/staging-database-proof.mjs`.

### Offline provisioner container

`Dockerfile.staging-provisioner` separately packages the bootstrap sources and
dependencies. It copies no repository `.env`, private installation, web build or
member credential. It is an offline migration role, never a runtime web/worker
image. Mount its private output directory and scoped owner input only while
explicitly provisioning the isolated database; remove the owner-bearing container
before normal application operation. The existing bootstrap refuses other target
names and preserves released migration digests and repeat credentials.

`node scripts/staging-database-container-proof.mjs` builds a disposable image,
starts private PostgreSQL on an internal network without a published port, and
runs the actual bootstrap inside a read-only provisioner as the private-file
owner UID/GID. Database initialization uses the same bounded capabilities as the
staging topology. The trial verifies restricted runtime/schema/workload/member
inspection, member-write refusal and identical repeat credentials. It does not
enroll records, grant agents or create actions. Only the generated containers,
network, image and private directory are removed. Failure output names the stage
without dumping credentials or raw Docker errors.

The separate `staging-database-container` CI job continuously executes this path.
Its success covers internal-network provisioning, not complete eight-service
startup, credential rotation, web/worker integration or remote acceptance. Actual
trial image identity and source fingerprints are retained in
`docs/evidence/staging-database-container-proof.json` once the trial passes.

## Temporal credentials and namespace preparation

`node scripts/staging-temporal-config.mjs <new-private-directory>
looplabs-staging-<installation-name>` exclusively creates the separate Temporal
configuration. It refuses an existing directory instead of silently rotating an
issuer or overwriting credentials. A partial failure leaves private output for
inspection. Do not delete/recreate the issuer for an already running installation.

The generator creates a dedicated persistence password, public JWKS, client/server
certificates, explicit mTLS/default-authorizer server configuration, and a signed
namespace-scoped workload JWT. Default JWT lifetime is one hour; certificates last
seven days. This is intentionally bounded staging material, not a production key
lifecycle or automated rotation service. Expiry stops bootstrap/authorized access;
reviewed refresh, overlap/drain and revocation procedures are still required.

Mount only `server.yaml`, `server-tls`, `client-tls`, and `jwks.json` into the exact
services described by Compose. Never mount `offline/`, which contains the CA private
key, JWT signer, administrator credential and schema-tool password. `temporal-auth.env`
contains only the scoped Temporal workload credential/TLS paths and must be combined
with the separate database/workload outputs and required build/record configuration;
it is not a complete worker environment. Runtime key/config files are readable by
their non-root containers inside a 0700 installation parent; do not expose that
parent to other host users or containers. File permission choices do not protect
against compromise of the authorized runtime or host.

Initialize the two isolated Temporal SQL schemas using the reviewed 1.31.0 schema
tool and offline schema credential before starting the service. This initialization
is not performed by the generator. Once authenticated Temporal is available, run
`node scripts/staging-namespace-bootstrap.mjs <private-directory>` from inside the
isolated network with `LOOPLABS_STAGING_BOOTSTRAP=isolated`. The command targets only
`temporal:7233`, verifies the retained CA fingerprint and credential expiry, and
creates the named namespace only on an actual NotFound response. Repeats require a
registered namespace with the same one-day retention; changed policy or permission
failure refuses rather than updating or recreating it. It does not start workers or
approve/execute workflow actions.

Tests generate actual certificates and verify a real mutual-TLS exchange (including
missing certificate and wrong-host refusal), signed workload JWT scope and private
file separation. Namespace RPC behavior currently has **mock** contract tests;
these do not prove the new configuration against a running Temporal service. The
prior secure-container engine proof remains separate. Full service configuration,
namespace authorization/rotation and packaged execution must still be exercised
together on the allocated staging deployment.

## Verification and remaining work

### Combined platform trial — disposable integration passed

`LOOPLABS_STAGING_PLATFORM_PROOF=isolated FETCHSANDBOX_BACKEND_PATH=<prepared-backend>
node --import tsx scripts/staging-platform-proof.mjs` completed in private CI run
`37841114978` on October 8. The exact reviewed overlay on public base `a00e942`
passed `pnpm quality` (393 tests), built all four images, started the complete
isolated eight-service topology and completed the actual API/runtime assertions.
Sanitized artifact identities, admission measurements, checks and explicit limits
are retained in `docs/evidence/staging-platform-proof.json`. The run uses a private
FetchSandbox commit plus a digest-pinned reviewed spec; it exposes no source,
credentials, customer data or raw provider journal in public artifacts.

The prior diagnostic run `37840765706` reached enrollment and reported a provider
`PermissionError`. The prepared spec retained mode `0600` but the image had copied
it as root before running the provider as UID 1000. The fix assigns copied private
inputs to UID 1000 and requires the required inputs to be readable as that user
during image construction. Host file modes, non-root execution, read-only runtime,
exact approvals and all original trial assertions remain intact. The earlier
sparse-checkout fetch problem was also resolved without changing source pins.
 It reuses the existing
Compose topology, immutable database provisioners, Temporal configuration and
namespace bootstrap, role-input assembler, private fixture and packaged workers.
It builds all four images, checks fresh host admission for all eight services,
creates only a random dedicated project and removes only that project's resources.
Migration-owner and administrator material are mounted into temporary offline
controllers, not application roles. The normal runtime uses the restricted database.

The trial targets actual session/API enrollment, agent grants, saved-plan submission,
duplicate refusal, self-approval refusal, held-work SIGKILL/restart, named approval,
an injected lost CRM response, independent provider-journal readback, and replay
of the real authenticated Temporal history. Its controller uses prepared fixture
plans and manually handled cookies over the private application network; it is
**not browser HTTPS, a typed chat experience, fresh model-planning proof, persistent
remote staging, restore, sustained load or designated operator alert acceptance**.
Those acceptance gates remain separate. No success is implied by this harness's
presence, its refusal test, existing separate component proofs or green static CI.

Use a fresh allocated runner with sufficient disk and memory. The local Docker VM
cannot admit the full stack, and shared live workloads must not be resized/stopped
to bypass host admission. Keep private source, specs, runtime credentials and raw
provider state out of public CI artifacts. Preserve failed stages and fix actual integration defects rather than narrowing
assertions. A successful disposable trial does not authorize production cutover.

### Reproducible private fixture inputs

A clean FetchSandbox checkout currently omits the ignored HubSpot OpenAPI file
used by the local fixture. Its presence in a developer checkout is not CI proof.
`node scripts/staging-fixture-source.mjs <private-repository> <exact-commit>
<reviewed-hubspot-spec> <sha256> <new-private-output>` assembles only the committed
application, HubSpot/Resend configuration and committed Resend spec, plus the
explicitly reviewed HubSpot file. It refuses mutable refs, changed spec content,
committed links/special files and existing output directories. Dirty/untracked
source and root environment/data stores are excluded. Partial output is retained
on refusal for inspection; source preparation does not authorize execution.

The manifest records both the exact Git commit and source-archive/spec digests.
Keep the prepared backend and any image private; do not upload FetchSandbox
source or credentials to this public repository or public artifacts. Private CI
must obtain that exact reviewed HubSpot input separately and verify its digest.
Do not substitute a downloaded current spec or silently copy a dirty backend.
The image trial and complete runtime proof remain required after preparation.

The image's separate `dependencies` target and fixture startup import the actual runtime symbols
and verifies each direct pinned distribution against its installed wheel RECORD
hashes and sizes. It refuses empty/changed files, missing metadata or records and
version mismatches. A disk-full diagnostic found a zero-byte FastAPI package in
a locally cached layer; a successful cached install step was insufficient proof.
The public container CI job can build this dependency-only target without any
private backend context and check the exported image in an actual read-only,
network-disabled container. The local diagnostic passed during build but failed
after image export, so a build-only check is insufficient. Startup refuses before
opening the provider listener. This detects damaged installation contents; it is not
publisher authentication, an SBOM audit or full private fixture acceptance.

### Actual private provider container proof

The Compose twin now explicitly sets `LOOPLABS_TWIN_CONTAINER=1`. Without this
setting the fixture listened only on its own loopback, so other application
containers could not reach it. The topology test preserves this setting.

`Dockerfile.connector-twin` uses an explicit named `fetchsandbox` backend build
context and copies application source plus HubSpot/Resend config/spec directories.
It never copies the backend root, private stores, `.env` or its dependency runtime;
it installs the recorded direct Python versions and runs as fixture UID 1000.
It is a private two-provider fixture, not a FetchSandbox production service or
provider API parity. Dependency/image identity is recorded, not independently
attested; transitive dependency resolution and external source review remain
operator responsibilities.

Reproduce from a reviewed local FetchSandbox backend using
`FETCHSANDBOX_BACKEND_PATH=<backend-source> node scripts/staging-twin-proof.mjs`.
The trial builds its own image, seeds a dedicated private state directory, starts
an internal network without published ports, and issues requests from a separate
controller container. It checks credential/workspace refusal, changed retry
refusal, duplicate CRM/email effect identity and readback across a twin SIGKILL.
It removes only its generated containers, network, image and temporary directory.
No existing provider process or volume is used. A build/proof failure refuses
acceptance and prints only its stage, never credentials or raw command output.

The October 8 actual local trial passed. Sanitized image identity and LoopLabs
source fingerprints are retained in `docs/evidence/staging-twin-container-proof.json`.
This closes fixture packaging/reachability/restart evidence only. It does not
exercise application approvals, Temporal workers, the complete stack or remote
staging. Public CI does not have the private FetchSandbox backend source;
its topology/regression checks do not replace this actual image trial.

The real Compose renderer passes topology tests for all eight services, project-local
networks/volumes, resource declarations, secret-mount separation and absence of public
database/provider/Temporal ports. Actual HTTP tests verify public key replacement and
failure closure. Reproduce the separate container check with:

```
LOOPLABS_STAGING_WORKER_IMAGE=<reviewed-image> node scripts/staging-authorization-proof.mjs
```

That check starts only a disposable bounded authorization container, verifies actual
HTTP reload/refusal/recovery and inspects its effective limits/capabilities. It removes
its own container and temporary public-key file. It neither bootstraps the stack nor
proves that Temporal uses the endpoint. No private signer is persisted by the check.

Next: complete reviewed configuration/bootstrap, enforce the host admission gate,
start the isolated stack on its allocated host, verify actual limits/networks and
image identities, run `temporal:staging-preflight`, then repeat real browser approval,
restart, lost-response, replay, restore and operator-alert drills. Full remote proof
and deployment/release authorization remain prerequisites; neither green topology
tests nor this authorization-container check satisfies them.

## Actual service configuration integration gate

### Role input assembly

The reviewed database and Temporal bootstrap outputs can now be assembled with
`LOOPLABS_STAGING_BOOTSTRAP=isolated node --import tsx
scripts/staging-runtime-inputs.mjs <database-directory> <temporal-directory>
<private-settings.json> <new-runtime-directory>`. The settings object must contain
exactly `origin` (HTTPS staging origin), `buildId` (reviewed content-bound worker
build), `taskQueue`, `records` (existing isolated catalog scope objects) and
`connectorToken` (the separately seeded private twin credential).

This exclusively creates 0600 `web.env` and `worker.env` under a 0700 directory;
it never replaces existing runtime authority. Only reviewed fields are copied.
The web receives neither the Temporal workload JWT nor the database workload
token; migration-owner, named-member and signer material are excluded from both
files. The output refuses a non-runtime/non-isolated database target, insecure
origin, incompatible build or absent isolated records. The private twin address
is fixed to the unpublished Compose service. A failed assembly leaves any partial
directory for inspection, rather than silently resetting it.

This is input preparation, not provisioning or acceptance: it does not verify the
JWT signature/expiry, actual database grants, image contents, provider seed,
record enrollment or permission grants. Those checks and full stack startup remain
mandatory. Mount individual role files and runtime TLS/public-key inputs, never
the bootstrap directory or offline signer directory. Planner configuration remains
a separate reviewed web-only input; this command does not inherit cloud secrets
from the invoking shell.

The separate `staging-temporal-service` CI job runs
`node scripts/staging-temporal-service-proof.mjs` on a disposable runner. It uses
the generated configuration unchanged, real PostgreSQL schemas, the public JWKS
container and the pinned Temporal 1.31.0 service. The verification controller runs
inside the internal network as the private-file owner UID/GID, with dropped
capabilities and temporary administrator material; no service port
is published to the host. Docker does not publish ports for internal networks, so
a host-side client is not a valid test of this topology. It must prove namespace creation
and repeat, scoped workload acceptance, invalid/expired/tampered and cross-namespace
refusal, reader write refusal and namespace persistence across service/database
SIGKILL. Credentials are temporary, errors are sanitized, and only owned resources
are removed. A Docker memory floor refuses undersized hosts; do not change shared
services to make the proof fit. Existing quality gates remain required.

The initial actual trial found that starting the default service set omitted the
internal frontend required by the secure single-service configuration. Both the
Compose definition and trial now explicitly start frontend, matching, history,
worker and internal frontend; a topology assertion preserves that selection.

The actual service gate passed on commit `e29ab43` in CI run
`37808859411`, job `113420185335`. The sanitized image identities, checks and
source fingerprints are retained in
`docs/evidence/staging-temporal-service-proof.json`. The trial also exposed and
fixed controller file-owner access without changing private permissions. Existing
quality gates and the final PR checks remain required before merging. It does not exercise application workers, the browser or the complete
eight-service platform and cannot replace allocated remote staging acceptance.


### Provider readiness increment — disposable trial passed

The private provider healthcheck issues an authenticated GET to its configured
first test record (or the legacy prepared sample when no extra records are
configured). It requires a matching record, recipient and nonempty source version,
refuses redirects and bounds timeout/response size. It does not mutate business
records, create approvals, deliver messages or disclose response/credential data;
ordinary provider request-archive entries may still be written for a health GET.
The combined trial now waits for provider health before enrollment and after the
runtime SIGKILL/restart. Private CI run `37844156496` passed the complete updated trial and the full
quality gate (394 tests), with provider health required before enrollment and
after runtime restart. `docs/evidence/staging-platform-readiness-proof.json`
records the exact overlay, worker/provider identities and observed health states.
The earlier successful trial record above remains preserved for its earlier source.
This is a disposable fixture initialization/readback check, not provider write
availability, live API parity or persistent enterprise operational acceptance.

## Prepared-plan HTTPS browser trial — disposable acceptance passed

`LOOPLABS_STAGING_BROWSER_PROOF=isolated` extends the disposable Linux CI trial
with real Chromium. It raises the host reserve from 1 to 2 GiB for the browser,
temporary loopback TLS relay and control processes; this is an admission allowance,
not enforced process memory or a capacity result. The eight application services
retain their existing limits and isolation. Install Chromium with Playwright and
`libnss3-tools` on that fresh runner. This option refuses non-CI use before trust
setup; it is not a production ingress configuration.

The relay serves only one fixed authority and forwards to the published loopback
web port. It refuses forward-proxy targets, unknown hosts/methods and oversized
bodies before forwarding; it preserves Origin/Cookie and removes caller-controlled
proxy headers. A new short-lived private CA signs only the test hostname. Chromium
must first reject the untrusted CA, then validate it through a temporary named NSS
trust entry. No certificate-error bypass flags are used. The entry is removed when
the browser closes; private keys and installation files are removed with the trial.
Chromium's current NSS path rules are documented in its
[Linux certificate guide](https://chromium.googlesource.com/chromium/src/+/main/docs/linux/cert_management.md).

The browser checks are two real form sign-ins, Secure/HttpOnly/Strict
cookies, anonymous and requester approval refusal, a real hostile-origin request
using the reviewer's cookie, exact-plan review/scoped-agent selection/submission,
independent approval buttons, verified completion and a 390px saved-outcome reload.
The successful trial below produced exactly two additional private-twin effects,
read from the actual provider journal. Preparation uses the existing fixture API;
this increment does **not** prove fresh typed chat/model interpretation. The full quality gate and actual combined trial below passed these checks. Persistent staging, live delivery, sustained tenant load and remote
restore/operator acceptance remain open.

### Image-builder lifecycle — disposable trial passed

Browser trial runs `37853700287` and `37856164794` passed the full quality gate
but refused runtime host admission before any browser actions. The second run
measured 6,484,697,088 available bytes against 4,697,620,480 service bytes plus
2,147,483,648 reserve bytes. Its post-refusal diagnostics found Docker to be the
largest resident process (494,665,728 bytes); no test containers remained. These
measurements establish insufficient capacity, not the exact cause of every retained
byte or a successful browser journey.

The trial now uses an explicitly named, random disposable `docker-container`
BuildKit builder with 3 GiB memory and swap limits. It inspects the actual limits,
loads the four completed images into Docker, removes only that builder, and requires
its container to be absent before the unchanged runtime admission check. It never
selects a shared builder, prunes shared caches, restarts Docker or changes the eight
runtime service budgets or 2 GiB browser reserve. Failure to initialize, build or
remove the owned builder refuses the trial; teardown retries only owned cleanup.
[Docker documents this driver's memory controls and lifecycle](https://docs.docker.com/build/builders/drivers/docker-container/).

The successful trial below verified the actual image builds, capacity measurement
and complete browser/runtime journey. Command-contract tests alone prove
refusal/cleanup decisions only; they do not prove Docker enforcement or available
host capacity. Persistent staging and the broader enterprise gates remain open.

### Earlier bounded-builder runtime observation — browser trial failed

Private CI run `37857322795` passed the full quality gate (400 tests), built
the images using the owned builder, verified its limits/removal, admitted the
unchanged eight-service budget, completed the preceding API/runtime assertions
and reached the real HTTPS browser trial. The overall trial failed at
`browser-https` / `review-submit`; no full browser acceptance is claimed.

A separate real Chromium DOM check reproduced a selector defect: an exact
`CRM agent` label matched zero controls because the wrapped select's option text
contributes to the label. The existing prefix selector matched one. The proof now
reuses the earlier chat proof's prefix selectors and separates record-opening,
agent-selection and review/submission checkpoints. This fixes a known harness
defect without bypassing exact approval, held-state or effect assertions. It is
not evidence that the corrected full browser journey passed; the later trial below
records that result.

A separate actual Chromium networking probe also confirmed that a CORS-blocked
403 can suppress Playwright's response event. The browser attack remains a real
credentialed hostile-origin POST. Its assertion now uses the fixed TLS relay to
passively observe the actual backend status, whether the origin is the expected
hostile test origin, a digest matching the reviewer's HttpOnly session, and the
exact same-origin refusal. It exports no raw cookie, origin, headers or body;
the actual TLS regression checks this evidence boundary. Held-state assertions
still follow the attack. No CORS permission, certificate bypass or approval
authority is introduced. At that diagnostic checkpoint, corrected combined browser
acceptance remained pending; the later trial below passed.

### Combined HTTPS browser acceptance — October 8

Private CI run `37859172131` passed the full quality gate (400 tests) and the
complete corrected trial on public source `fefcf32`. The owned builder's actual
3 GiB memory/swap limits and removal passed; all eight runtime roles were admitted
with the unchanged 2 GiB browser reserve. The measured available memory was
7,027,818,496 bytes against 6,845,104,128 required bytes. This is one admission
observation, not a sustained capacity or availability claim.

Actual Chromium first rejected the untrusted CA, then validated the temporary
trusted CA without certificate bypasses. Separate form sign-ins established
Secure/HttpOnly/Strict sessions. Anonymous access, requester self-approval and
a real hostile-origin POST carrying the reviewer's session were refused. The
backend's exact same-origin denial was observed through the bounded passive relay;
no CORS permission was added. Held actions remained held after the attack.

The owner reviewed the exact saved plan, selected explicitly granted agents and
submitted through the UI; another member approved both actions through the UI.
Verified completion and the exact recipient survived a 390px saved-outcome reload
without horizontal overflow. Actual plain-HTTP navigation received no authenticated
session. The independent provider journal contained exactly four effects: two
from the original crash/lost-response/replay API trial and two from the browser
run, with both browser action IDs present. The complete trial returned success.
Owned-builder absence was explicitly checked; this receipt does not independently
inventory every final project resource.

The sanitized artifact and runtime source fingerprints are retained in
[evidence/staging-platform-browser-proof.json](evidence/staging-platform-browser-proof.json).
Earlier failures above remain historical records. The implemented lifecycle and
corrected browser checks are now verified in this disposable environment; this
supersedes their earlier awaiting-trial status. Preparation still uses the fixture
API, so fresh typed model planning is not established by this proof. Persistent
remote staging, live delivery, sustained independent-tenant load, remote restore,
operator alerts/security acceptance and production cutover remain open.


## Fresh typed planning increment

The historical prepared-plan result above is preserved. Actual CI run
`37863416303` now passed a fresh typed HTTPS request and recipient clarification
against the real bounded model, followed by the same exact scoped-plan, independent
approval, effect-verification and mobile-reload journey. Only the actual web
container received the temporary STS session; all seven other roles carried no
AWS/model fields. The API trial retained crash recovery, lost-response readback and
history replay, with exactly four provider effects across both runs. The full
quality gate passed. See `STAGING_TYPED_JOURNEY.md` and the current measured
`docs/evidence/staging-platform-browser-proof.json`.

The measured receipt retains all previously covered sources and adds the planner
input, web-only attachment and recorder. The prior receipt is hash-preserved; no
source-freshness gate is waived. Public merge still requires local quality, the
normal pre-push gate and exact-head CI. Temporary repository/local credential
inputs were removed and verified. Persistent hosting, sustained load, remote
restore/alerts/operator acceptance, live-provider safety and production cutover
remain unproved; this is not an enterprise production acceptance.

## Recovery-fence increment under validation

October 8: the actual component database archive drill passed after exposing and
fixing a bootstrap defect. A retry previously issued a fresh workload token before
recovery enrollment checked a changed fence. The token-count assertion failed
(7 versus 6); the earlier failure is retained privately. Existing-installation
bootstrap now checks its configured and database epoch before any provisioner.
The corrected actual `pg_dump`/`pg_restore` trial preserved token count, refused
restored authority, and verified idempotent offline quarantine.

The new assembled-runtime approved-archive drill is implemented but **not yet
measured**. It must freeze independently approved work while workers are stopped,
complete the original effects, rotate configuration outside the archive, restore
only the application database, refuse old sessions and approvals, prove packaged
worker/scheduler termination, quarantine twice, and retain the same independent
provider effects. Earlier browser receipts do not prove this new source state.
See [STAGING_RESTORE_FENCE.md](STAGING_RESTORE_FENCE.md).


The current restore increment is documented in `STAGING_RESTORE_FENCE.md`.
Actual runtime run `37873330354` passed the restored authority and provider-effect
checks; its subsequent quality failure was two unenrolled staging fixtures, not
an overall CI pass. The corrected fixtures and current candidate passed local
full quality (414 tests). The current measured receipt covers 94 runtime sources;
historical prepared/typed receipts remain retained. Exact-head CI and persistent
operational acceptance are still required; production remains unchanged.


## Exact custom image retention

The opt-in private retention path now passed full runtime and quality in run
`37877500571`, then independent retrieval/cold-load in `37879011443`. See
`STAGING_IMAGE_RETENTION.md` and the two current evidence records. The four custom
images are retained after checksum verification; runtime credentials, volumes and
state are never exported. Third-party image digest pinning, promotion/rollback and
persistent operational acceptance remain separate open gates.


## Reviewed runtime dependency identities

Actual corrected run `37881876443` passed complete typed/runtime/restore acceptance
and all 429 tests with reviewed Linux/AMD64 PostgreSQL, Temporal server and schema
tool references. Three actual container IDs and six schema invocations match the
lock. All 97 covered source hashes match. The first candidate result is retained
privately and cannot substitute for its later verifier correction. Separate
fresh-runner retrieval `37883440083` passed for that exact artifact and reviewed
dependencies, with all five verifier/configuration sources matching. Normal public
release gates remain pending; see `STAGING_RUNTIME_DEPENDENCIES.md`. Production
is unchanged.
