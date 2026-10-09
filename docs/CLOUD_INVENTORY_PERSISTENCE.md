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
Manual read-only scanning is wired to the candidate API through an explicit private server binding. Scheduled scanning remains unsupported.

The candidate `/control-plane/discovery` page inherits the existing invited
workspace gate. `/api/workspace/discovery` additionally authenticates each request
and the store rechecks current invited membership, tenant and recovery state.
GET lists at most 100 tenant-owned scopes (with explicit truncation) or reads one
saved inventory. POST accepts `configure` with connection name, account and commercial region, or
`scan` with only a saved connection name; it derives tenant from authenticated identity. Browser
credentials, endpoints, raw observations, extra tenant selectors
and ambiguous connection selectors are refused. Mutations require the existing
same-origin check and successful responses forbid caching.

The screen uses shared workspace typography and form components. It asks for no
secrets, separates configured scope from saved observation, shows partial/stale
and retained history, and keeps owner mapping, activity and enforcement explicitly
unverified. Technical identity references are expandable rather than raw JSON.
A scan button appears only for a matching current private server binding. There is no import button or automatic enrollment. Azure and Google
remain unsupported. The direct candidate route is not added to production or the
shared navigation; real account discovery and browser acceptance remain open.

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

Eleven focused persistence/setup tests passed using a required dedicated PostgreSQL database. They
exercise concurrent idempotence, changed replay refusal, partial/empty/out-of-order
preservation, fresh connection reads, current identity/recovery/tenant refusal,
raw/authority-bearing evidence rejection, immutable database boundaries, actual
restricted-role UPDATE/DELETE/TRUNCATE refusal and the real optional setup CLI's
concurrent application, actual non-owner refusal and digest refusal. A 2,001-row
database case proves explicit view truncation without history deletion. No test is skipped without PostgreSQL.
The test scans are fixtures, not AWS-account discovery evidence. Five API boundary
tests also exercise current authentication, same-origin rejection, session-derived
tenant, invalid/raw/credential-bearing input, duplicate selectors and sanitized
failure responses. A server-rendered screen contract check verifies binding-required
scanning and secret-free configuration are explicit; it is not an authenticated
browser or actual cloud scan proof.
An additional in-process HTTP-route integration test uses real cookie sessions,
the actual authenticator and dedicated PostgreSQL. It proves repeated configuration
persists once, tenant-derived listing, cross-company 404, saved partial-scan reads,
scope-change refusal, revoked/expired session denial and zero new execution
agents/actions/tokens. This is a route/database proof, not a remote browser journey.

Before calling the cloud slice ready, configure reviewed server-owned scoped
credentials, store actual cloud results, add reviewed enrollment UI, and prove it
through a real enrolled account. The invited inventory and manual scan path are
candidate code; they are not deployed or real-account proof. Add enterprise
identity/RBAC/offboarding and one controlled action with actual direct-bypass,
revocation, stale-state, independent approval and failure/reconciliation tests.
Persistent staging/operator, artifact/history retention, live provider and service
objectives remain required by `ENTERPRISE_ACCEPTANCE.md`. Production is unchanged.

## Reviewed manual scan binding

The server alone may set `LOOPLABS_CLOUD_DISCOVERY_BINDING_FILE` to an absolute
path to a mode-0600 regular file owned by the service user, with one hard link.
Symlinks, broad permissions, oversized data and malformed JSON refuse. The file
contains exactly `scope`, `executable` and `session`; scope contains tenant ID,
connection ID, account ID and region matching the saved connection. Executable
is an administrator-reviewed absolute AWS CLI v2 path supporting AgentCore.
Session contains only short-lived access key ID, secret access key, session token
and expiry (30 seconds to one hour remaining). Never put this file in Git, a
browser input or chat. The server rereads it before each cloud request; changed
scope or executable and expired credentials stop the request. No planner or
ambient AWS credential/config fallback exists. One reviewed binding per deployment
is a bounded pilot mechanism, not a secret manager or enterprise federation.

The AWS CLI performs only STS caller identity, AgentCore runtime listing and exact
version details. STS account must match before listing. The server derives scope
from the authenticated member's saved connection, admits at most three scans per
connection per minute using existing persistent throttling, releases the database
lock before cloud reads and rechecks authority/recovery before saving. Each CLI
child has a 15-second kill limit; no new read begins without 15 seconds remaining
in a 45-second collection budget. Budget exhaustion retains partial observations.
An HTTP retry may create another read-only scan; it cannot create execution effects.
Failed caller verification saves no scan. Partial list/detail failure saves only
minimized observations and error codes, preserving earlier evidence.

Binding readiness means local configuration checks passed, not that IAM privileges,
issuer, effective permissions, live resource coverage or CLI signing are proved.
An administrator must separately review the session issuer and least-privilege
policy (only these reads, scoped where AWS supports resource restrictions). We
have not created IAM grants or scanned a real account. Fixtures prove routing,
binding substitution/expiry refusal, deadlines, scan throttling, normalized results
and delayed authority refusal; actual customer cloud and browser proof remains
required. No automatic owner mapping, enrollment or action enforcement follows.

The route/database integration additionally loads a temporary private binding and
launches a real local CLI fixture for caller/list/detail. It saves the resulting
runtime version through the actual collector and store, then returns it through
the authenticated route. Missing binding refuses; no agent/action/token is created.
This proves actual local process-to-API-to-PostgreSQL plumbing, not AWS signing,
network access, live discovery or an authenticated remote browser journey.
