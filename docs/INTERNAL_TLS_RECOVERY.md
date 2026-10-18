# Installed internal TLS recovery

The October 14 sign-in outage was caused by expired internal database and quote-provider certificate chains. Disposable one-day certificates had been retained in the persistent evaluation installation. A healthy process or Unix-socket PostgreSQL health check did not establish that application TLS remained usable. The application correctly refused expired CA trust. The front-end JSON parsing error was a secondary presentation symptom.

The source-owned `scripts/persistent-internal-tls-renewal.mjs` is a bounded **first recovery** for the existing isolated control-demo authority. It does not provision tenants, recreate the database, rotate member passwords, grant roles, change policy/approval/execution authority, or repeat provider effects. It explicitly refuses a second selected internal-TLS successor. Automatic recurring internal TLS renewal is not implemented.

## Recovery contract

1. Prepare one exclusive additive private generation. Issue three separate 90-day CA/server chains for the existing fixed database/native-quote/email identities. Retain offline CA keys in purpose-separated private directories; never mount these keys into application processes.
2. Verify the exact retained CA bytes, sealed readiness hashes and current deployed service identities. Clone only scoped runtime publications. Preserve URL credentials, provider tokens, workspace/role/schema/database OIDs, recovery epochs, budgets and effect/pin identities. Update only CA paths/hashes, linked successor paths and server certificate/key/readiness hashes.
3. Serialize under the existing release/Temporal-renewal lock. Stop application writers and provider listeners. Observe existing PostgreSQL major version, nonempty `PG_VERSION` and HBA before any restart. The successor database startup has **no `initdb` fallback** and retains the same writable data mount and verified TLS flags.
4. Capture source-owned read-only continuity digests before the database restart, after it, and after provider startup plus the original installed continuation observer. Require equality before restarting writers. Digests cover database system identity, all application relations, sequence values, role/password digests, memberships, schemas, functions and grants, views, default privileges, role configuration and persisted provider files. No raw rows or credentials enter receipts.
5. Restart the same scoped client/web images and preserve the active web image, profile, IPs and unrelated services. Recheck retained/successor file hashes before selecting the new composition and continuation receipts. A failed or interrupted attempt contains clients and retains the old expired generation as forensic evidence; it never describes expired rollback as healthy.
6. Perform fresh named-member sign-in and mounted UI acceptance separately after continuity evidence is captured. Those checks create sessions and must not be conflated with read-only before/after database equality.

Preparation is not activation. Local issuer/publication tests are not proof of production repair. Production application requires reviewed source, the full repository gate, standard push/hosted checks, private preparation/activation evidence and actual founder access checks. Existing production receipts from before the certificate expiry remain historical; they do not prove current access.

## Remaining lifecycle work

This recovery does not renew Temporal certificates or public-origin certificates. Temporal CA, server and client certificates in the affected installation were observed to expire October 20, 2026 at 18:30:47 UTC. The current Temporal JWT renewal job does not renew those certificates. A separate reviewed recurring transport lifecycle implementation and expiry-aware health/alerting is required before that deadline and before the new internal chains approach expiry. No recurring-renewal or production-readiness claim follows from the bounded first recovery.
