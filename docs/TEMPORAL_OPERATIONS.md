# Temporal staging operations

October 7, 2026. Phase 3B local acceptance; production remains on the existing
worker. Read `TEMPORAL_ADOPTION_PLAN.md` for ownership and open release gates.

## Packages and transport

`pnpm temporal:build` produces `.worker/temporal-service.cjs`, the deterministic
workflow bundle and a manifest. The deployment build ID is a SHA-256 digest bound
to the service, workflow and lockfile bytes. Both roles verify it before connecting.
Never reuse a build ID for changed code or substitute files in an existing image.

`Dockerfile.temporal` uses a separate glibc Node image for the native Temporal SDK.
It does not change the Alpine web/legacy-worker image. The separate staging
Compose file starts neither role through the production deploy script. It uses
non-root, read-only containers, removed capabilities, private TLS mounts, bounded
memory and graceful shutdown. No credentials are baked into images.

The service requires explicit address, namespace, task queue and artifact build
ID. Remote connections require TLS with a Temporal API key or client certificate
pair. Certificate paths are read privately; errors do not print credentials.
Insecure transport is allowed only for credential-free localhost/127.0.0.1 proof,
with an explicit override. This local acceptance does not prove a remote TLS
handshake, namespace ACLs or a deployed authenticated Temporal cluster.

## Bring up a dedicated staging environment

1. Provision a dedicated Temporal namespace with retention, namespace-scoped
   credentials and a dedicated PostgreSQL environment. Apply the existing managed
   migrations and migration 9 using `pnpm temporal:setup`; use a separate database
   owner for migration and the runtime role for execution. Keep production data
   and credentials out of this environment.
2. Build: `docker build -f Dockerfile.temporal -t <immutable-staging-image> .`.
   Read its build ID with `docker run --rm --entrypoint node <image> -p
   "require('./.worker/temporal-manifest.json').buildId"`. Set that exact value in
   the private environment file. A locally built artifact can have a different
   hash from the container artifact; use the manifest from the deployed image.
3. Create `.local/temporal-staging.env` privately (0600). Supply
   `LOOPLABS_DATABASE_URL`, the separate `LOOPLABS_TEMPORAL_WORKER_TOKEN`, Temporal
   address/namespace/task queue/build ID and API key or certificate/key paths.
   Configure only the approved private connector binding. For mounted mTLS,
   certificate/key paths are under `/run/temporal-tls`. Never commit the file.
4. Set `LOOPLABS_TEMPORAL_IMAGE` to the immutable image and
   `LOOPLABS_TEMPORAL_TLS_DIR` to the private mount directory. Start only the worker:
   `docker compose -f docker-compose.temporal-staging.yml up -d temporal-worker`.
5. After pollers register, use Temporal's deployment API or CLI to promote the
   manifest build ID under deployment `looplabs-acknowledgement`. Check namespace,
   queue coverage and pollers; do not bypass missing-poller protection. Retain old
   pinned builds while their runs or retained queries need them.
6. Start the scheduler through the same explicit Compose file. Transfer only
   dedicated staging rehearsals through the existing `TemporalOutbox.transfer`
   service boundary. There is no new self-service UI switch. Transfer does not
   authorize execution; each action still needs exact independent approval.

For local packaged-process proof, `pnpm temporal:build` then
`pnpm temporal:load-proof` creates and cleans its own schema, namespace service,
credentials and twins. It does not call `temporal:setup` against production.

## Health, limits and monitoring

Each process listens on 127.0.0.1 only: worker 9320, scheduler 9321 by default.
`GET /health/live` distinguishes process liveness from dependency failure;
`GET /health/ready` returns 503 until current workload credentials, database and
Temporal namespace checks pass, or when checks are stale/shutdown begins.
Dependency RPC deadlines and database query timeouts bound checks. A backlog is
an alert, not a restart trigger. Health does not prove every queue is processing
or substitute for Temporal server/SDK task latency metrics.

Health returns only role, readiness, shutdown state, consecutive failures,
process-local scheduled count, durable pending-intent count and oldest pending
age. It includes no tokens, payloads or customer records. Monitoring should alert
on dependency failure/stale checks and `dispatch_backlog_older_than_60s`; these
signals are exposed, not connected to an external notification service yet.
Use container-local checks or an authorized tunnel; never expose these ports as
public product APIs. Process-local counts reset on restart.

Activity slots default to 5 (allowed 1–20), workflow-task slots 10 (1–40), scheduler
polling 5 seconds (250ms–30s). The outbox claims at most ten intents per tick with
30-second leases. Existing workspace transaction serialization is retained.
These defaults bound work; they are not measured enterprise capacity or tenant
quotas. Configure them deliberately after a representative load test.

SIGTERM marks readiness false, stops scheduling and drains the worker with a
20-second grace. The staging supervisor allows 30 seconds and restarts exited
processes. On dependency outage, health is degraded and saved intents remain;
restart does not create replacement action IDs. Worker revocation fails health
and existing authorization checks prevent execution. A revoked in-flight request
may still have affected the provider; uncertainty requires read-back.

## Local measurement and limits

`docs/evidence/temporal-load-proof.json` records actual process SIGKILL/restart,
25 held runs, 50 concurrent transfer calls, one history start per run, backlog
recovery through natural lease expiry and one independently approved completion.
The TCP fault boundary cuts existing worker/scheduler database connections and
refuses new ones, while an independent assertion connection inspects persisted
state. Both roles become unready. Restoration plus explicit supervisor replacement
preserves all 25 histories and exact action IDs; held work stays effect-free. This
is a connection-outage drill, not PostgreSQL crash, replica failover or backup
restore evidence. Only that one run completes two provider-twin effects. Remaining plans share the
same customer/version and are deliberately contained; this is not 25 independent
customer workflows or a throughput benchmark. Measurements are a single laptop
sample, not percentile latency, availability, RPO or RTO commitments.

Before production cutover, prove remote authenticated connectivity/ACLs, operation
under representative independent-customer load, alert delivery and rollback.
Resolve the hosted atomic CRM source-version guarantee and prove provider-specific
idempotency/read-back. Keep existing ownership on every run: stopping Temporal
must never reassign a transferred run back to the legacy dispatcher. Restore the
same worker build or contain the run until a reviewed recovery decision exists.
No production migration, worker launch, UI cutover or HA/failover is performed here.

Sources:
- https://docs.temporal.io/develop/typescript/workers
- https://docs.temporal.io/worker-versioning
- https://docs.temporal.io/develop/worker-performance

### Container verification blocker

The local October 7 container build passed dependency installation and artifact
compilation, then failed to export/unpack the image because Docker's local image
store returned a read-only filesystem error. Compose syntax was validated with an
empty private fixture environment. Container startup/native-runtime smoke remains
**unverified**; do not use these templates as an accepted deployment until the
Docker store is healthy and that smoke/secure-connection test passes. No daemon
restart, pruning or production change was attempted. Status and source hashes are
recorded in `docs/evidence/temporal-container-status.json`.


## Current acceptance boundary

Read `ENTERPRISE_ACCEPTANCE.md` before using an enterprise-readiness claim. Local
fault/replay evidence is necessary but does not qualify the deployed product.
Staging operations and representative workload acceptance must use explicit
infrastructure and measured outcomes rather than extrapolating laptop timings.
