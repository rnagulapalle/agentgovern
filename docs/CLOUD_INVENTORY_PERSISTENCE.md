# Durable cloud discovery evidence candidate

October 9, 2026. Migration16 and `CloudInventoryStore` persist configured AWS
account/region scope, scans and normalized resource/version observations. This is
an optional candidate increment, not a deployed cloud connection or enforcement
service. It extends the existing PostgreSQL pool, workspace transaction lock,
invited member authority and recovery fence. No second execution engine exists.

## Behavior

`configureConnection` records the explicitly reviewed scope, creator and immutable
connection identity. Its status is **configured**, not connected. It performs no
cloud call and stores no credential. Configuring discovery does not enroll an
agent, issue a token, create a record grant, approve an action or admit a workflow.

A server-side collector can call `recordScan` with a stable scan UUID and its
minimized result. Exact repetitions return the existing scan; changed evidence
under the same UUID refuses. Connection account/region/tenant must match. Current
invited authority and deployment recovery state are checked inside the existing
workspace transaction. No public write route for raw discovery evidence is added.
Cloud transport and scheduled scanning are not wired to the application yet.

Every scan and resource observation is append-only. Normalized columns exclude
raw API bodies, environment values, descriptions, tool schemas and credentials.
Partial and complete-empty scans retain all earlier resource/version observations;
an empty traversal is not proof of deletion, revocation or permission removal.
Historical out-of-order observations are retained without replacing a later scan.
The latest view exposes per-record observation time, current-scan membership and
staleness, plus scan completeness/failures. The returned view is bounded to 2,000
resource/version rows and explicitly reports `historyTruncated`; full history is
retained in PostgreSQL. Paged history UX remains to be implemented. Fifteen minutes is an illustrative
stale-display threshold, not a revocation or collection SLA.

Ownership stays unmapped, activity unconnected and enforcement unverified.
Runtime identity gaps, unknown effective permissions and unknown declared tools
remain explicit even after a complete API traversal. Inventory does not feed the
execution authorizer. A customer IdP, owner mapping, reviewed enrollment and a
mandatory controlled-action path remain separate work.

## Migration and trust boundary

An offline migration-owner can apply the optional schema with:

```sh
node --env-file=.env.local --import tsx scripts/cloud-inventory-setup.ts
```

It requires exact applied digests for migrations1/3/10 and ownership of `ll_orgs`;
concurrent/repeated setup is serialized and digest drift refuses. It is not added
to normal bootstrap or production deployment. Existing migrations are unchanged.
An existing `ll_runtime` gets SELECT/INSERT on only the three new tables; UPDATE,
DELETE and TRUNCATE are not granted. Row triggers additionally reject rewrites,
wrong-member tenant, malformed account/resource references and foreign-account
identity substitution. Trusted migration owners retain database administration.

This does not solve compromised-service/row-level tenant isolation: the shared
runtime role still has access across workspace rows, and an authorized database
writer can insert observational evidence. Stored hashes are repeat-consistency
checks, not authenticated cloud attestations or signed audit receipts. Retention,
privacy deletion and recovery of collection credentials need an operator policy
before persistent customer use. Public UI/API must derive tenant from the current
session and connect only to administrator-reviewed transport/session bindings.

## Measured proof and remaining work

Nine focused tests passed using a required dedicated PostgreSQL database. They
exercise concurrent idempotence, changed replay refusal, partial/empty/out-of-order
preservation, fresh connection reads, current identity/recovery/tenant refusal,
raw/authority-bearing evidence rejection, immutable database boundaries, actual
restricted-role UPDATE/DELETE/TRUNCATE refusal and the real optional setup CLI's
concurrent application, actual non-owner refusal and digest refusal. A 2,001-row
database case proves explicit view truncation without history deletion. No test is skipped without PostgreSQL.
The test scans are fixtures, not AWS-account discovery evidence.

Before calling the cloud slice ready, wire the supporting signed transport to
server-owned scoped credentials, store actual results, add invited inventory and
reviewed enrollment UI, and prove it through a real enrolled account. Add enterprise
identity/RBAC/offboarding and one controlled action with actual direct-bypass,
revocation, stale-state, independent approval and failure/reconciliation tests.
Persistent staging/operator, artifact/history retention, live provider and service
objectives remain required by `ENTERPRISE_ACCEPTANCE.md`. Production is unchanged.
