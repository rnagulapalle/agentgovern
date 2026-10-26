# Booking receiver candidate — October 20

This source is a recovery candidate, not a deployed booking measurement feature.
The actual Next POST entry at `/api/booking-events` calls the raw-body verifier,
server-owned configuration reader, configured sales-workspace resolver and app
transactional store. Both installed capability profiles still deny this endpoint.
Absent configuration fails closed. No provider webhook has been created.

The accepted inquiry reference is the existing strict UUIDv4 receipt, not the old
private rehearsal's 64-hex reference. Signatures bind the complete raw body; the
configured version, event type and organizer must match before tenant selection.
Only minimized booking state is passed to storage, never raw attendee input.
Configuration classification distinguishes test events from external reservations;
neither constitutes qualification, attendance or pilot acceptance.

Proposed additive migration 32 (`lib/workspace/booking-schema.sql`) is deliberately
not in `install-order.json`. It defines tenant-keyed delivery dedupe/reservation
projection with FORCE RLS. Before installation, review the current migration
inventory, source/restore catalogs, explicit web column grants and default worker/
scheduler denial. Do not edit released SQL or add broad read/write grants. The
normal installer must recognize the optional schema before it can be deployed.
The candidate store uses the existing registered web pool and revalidates the
acquired client. No browser field selects a tenant, and the webhook resolver reuses existing sales admission. Signed deliveries and
public sales intake share the existing ten-per-five-minute budget; saturation
returns429 before booking writes. Native provider retry behavior is untested.

Measured: actual route tests with real owned config files and mocked tenant/store
interfaces; store control-flow tests with a query double; normalizer and capability
refusal checks. These do not prove PostgreSQL transactions, FORCE RLS, durable
concurrent replay, installed role grants or native Cal delivery. The local Docker
command did not respond and native Docker Desktop access was blocked by the locked
Mac. No database proof was skipped and counted as a pass.

Next acceptance: genuine installed-role PostgreSQL proof covering parallel replay,
foreign-tenant correlation, terminal cancellation ordering, requested versus
confirmed state, reschedule chains/conflicts/cycles, rollback/commit uncertainty,
worker/scheduler/future-column denial, then actual HTTP/schema/source inventory
regressions. Only after one candidate quality gate and the standard release may
an operator configure the exact HTTPS webhook and capture separate native
create/reschedule/cancel receipts. Never replay external side effects blindly.

Provider contract checked October 20: https://cal.com/docs/developing/guides/automation/webhooks
supports raw-body HMAC, the webhook version header and predecessor UID. Only the
configured 2021-10-20 contract is accepted here; other versions remain denied.


## October21 acceptance update — actual handler to PostgreSQL

The October20 Mac-unlock requirement is obsolete for the recovered database substeps. The watchdog's10actual store tests passed with installed roles and fixture-applied schema/grants. October21 adds9actual Next Request/Response POST tests through owned signature configuration, the real configured sales-tenant resolver and real PostgreSQL store, without mocked tenant or persistence modules. Signed creation,8parallel replays, foreign-reference rollback, invalid signature, pending/cancel/reschedule, injected SQL failure/retry and absent configuration passed. The actual current installation verifier refuses the fixture-added booking tables; that refusal is a containment pass, not installer support. Typecheck, changed-test lint and diff checks passed. Owned native PostgreSQL17 used SCRAM host authentication over loopback plaintext fixture transport; cluster stopped/removed.

These tests do NOT establish normal installer/migration inventory, source/restore acceptance, real network/TLS transport, production profile admission or native Cal delivery. Candidate tables/grants are still manually applied inside the fixture. Endpoint remains profile-denied and no calendar account was changed. Separate receipts: /Users/raj/.codex/looplabs-research/2026-10-20-watchdog/receipt.json and /Users/raj/.codex/looplabs-research/2026-10-21-watchdog/database-proof-result.json. Candidate remains uncommitted and undeployed.


## October22 optional installation substep

Reconciled the existing candidate onto main14ee612 without changing frozen install-order or global table/recovery catalogs. The new owner-only installBookingMeasurement helper verifies released prerequisite digests, exact installed restricted web-role/workspace/database binding, migration32 digest, owner/table column inventory, forced tenant RLS and exact policies before granting reviewed columns. It rejects broad table/PUBLIC grants and does not enable the route or grant workflow execution. Six actual PostgreSQL tests cover wrong-tenant binding with no created tables, first/repeated/concurrent installation, worker/scheduler/peer denial, owner-only admission, cross-tenant writes, altered digest/future column/policy and broad ACL refusal.

The nine actual POST/configured-context/PostgreSQL tests now call this helper instead of manually applying schema/grants. The final15-test run supersedes the initial6-test observation; do not sum them. Dedicated PostgreSQL17 fixture was stopped and removed. These establish only this optional extension and direct-handler composition. Frozen-base/composed source catalog admission, recovery capture/restore/regrant, profiles, network/TLS/native calendar and candidate CI/release remain unproved. The existing inventory refusal check remains in place; endpoint remains denied. Initial changed-test lint found an unused readFile import; removed and rechecked. No public or account mutation.

## October22 watchdog CI recovery

The first candidate CI failed three retained source-proof checks because the new
TenantContext.booking method changed the shared source closure. Removed that new
method and reused the existing server-configured sales resolver and admission
control, preserving tenant-context.ts byte-for-byte against released main. No
receipt hashes, proof gates or limits were rewritten. Signed delivery admission
now shares the existing sales budget (10 per five minutes);429 makes no booking
write and must be retried. Dedicated webhook admission is not implemented and
native provider retry/delivery acceptance remains unproved.

## October23 optional inventory checker

`verifyBookingTenantInventory` composes the independently reviewed base ledger
with exactly the two booking tables and the source digest of migration32. The
base verifier and frozen read allowlists remain unchanged. Actual installed-role
tests accept the catalog after repeated optional installation and refuse extra,
missing or renamed columns, missing tables/ledger, altered digest, disabled RLS,
disabled FORCE RLS and an unrelated table. Supplying the observed extended ledger
as the reviewed base is refused.

This checker is an offline composition primitive. It is not yet wired into
normal installer admission, restore/regrant or runtime capability profiles. It
does not independently verify column types, constraints or policy expressions;
the existing owner helper separately checks the exact tenant policy and broad
grants. Native HTTPS/provider delivery remains untested; the endpoint remains
denied. See the separate October23 watchdog receipts for tests and quality status.
