# Isolated staging platform packaging

October 8, 2026. Prepared topology, **not a bootstrapped deployment or remote
enterprise acceptance**. Production and its legacy runner are unchanged.

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
`LOOPLABS_STAGING_TWIN_IMAGE`. A tag alone is not artifact attestation: retain image
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

## Verification and remaining work

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
