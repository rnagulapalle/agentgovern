# Record-scoped connector foundation

Verified local foundation, October 7, 2026. Not deployed or enterprise accepted.

The private adapter now accepts an explicit server-enrolled `record-scope-1`:
workspace, CRM record ID and a single isolated `.test` recipient. The constructor
validates, copies and freezes it; chat, agent payloads and public proposal parsers
cannot supply it. The legacy record 1001 and `prepared-request-1` remain unchanged.

A scoped plan/action uses `prepared-request-2`. Both exact request snapshots carry
the same scope; the message recipient derives from that enrollment and the trusted
contact must match it. Scope, destination identity, method, resource, body and source
condition are bound into the saved approval hash. Database migration 11 preserves
these fields. Displaying saved scope is not permission to dispatch it.

The adapter verifies current scope before HTTP and checks record/resource in the
provider effect journal during readback. It sends the original request, stable action
ID and fixture-only record/workspace headers. The private fixture enrolls extra
records offline and atomically checks the current record's recipient at the write
boundary, in addition to CRM version enforcement. A previous read is insufficient
when the recipient can change between reading and sending. Lost responses still
require effect readback, never a new send inferred from a timeout.

## Explicit limits and next phase

This is a private fixture capability, not third-party API parity. Its owner-held
fixture credential can access provider state; fixture headers are not a production
tenant-authentication mechanism. Customer identity, per-agent record grants and
live connector credentials need separate reviewed enrollment/broker contracts.

The current factory/UI still selects the original sample adapter. The added scope
can be exercised through server-created controllers and saved manual workflows;
there is no public record selector or scope-registration endpoint. Hosted bindings
do not support this contract and refuse its requests. Only the fixed acknowledgement
message is supported; arbitrary recipients/messages are not authorized.

Record-scoped managed submission and Temporal ownership transfer are explicitly
refused while background routing remains v1. Existing v1 runs remain supported.
Do not route v2 requests through a v1 worker, relabel its pinned contract, edit
migration 9, or treat a successful manual run as background worker acceptance.
Next: persistent server enrollment, compatible per-run provider routing, pinned
worker representation and deployed invited UI proof. Then measure independent
record/tenant approved load, quotas/backpressure and operational objectives.

## Measured local evidence

The expanded actual connector harness enrolls three isolated test records offline.
Two same-workspace customer flows save plans, obtain independent approvals and
complete concurrently with separate CRM/message readback. It attempts wrong-record
and other-workspace use, injects a recipient change atomically at the write boundary,
checks refusal adds no provider effects, and restarts the real fixture process to
check unchanged effect journals and retained records. These are bounded correctness
checks, not a throughput, production availability or complete tenant isolation claim.

Final frozen source passed 33 actual connector checks, 7 hosted checks, 7 Temporal
crash/replay checks, 7 version checks, 6 dispatch checks, 10 packaged-service
checks, 17 fresh secure-container checks, 4 real application archive restore checks
and 12 real-model/browser checks. All nine proof records include the new scope
validator and match current source fingerprints. The fresh
`looplabs-temporal:record-proof` image was used for the secure-container drill.
Full quality passed 320 tests across 43 files, coverage thresholds, lint/types,
application/worker builds and 52 rendered destinations. No production deployment.

During harness development, Python import shadowing, an incorrect assertion of the
existing verification return type and a misplaced pre-fault conflict assertion
failed before being corrected. The completed run additionally detects the changed
recipient/version in CRM readback as a conflict. No gate was weakened or skipped.

Persistent enrollment and per-agent revocation are described in [PERSISTED_RECORD_GRANTS.md](PERSISTED_RECORD_GRANTS.md). Background routing remains unproved.

The subsequent local background-routing phase is in [SCOPED_TEMPORAL_ROUTING.md](SCOPED_TEMPORAL_ROUTING.md). It adds explicit compatible build pinning and an immutable saved route; the public record-selection UX and production cutover remain open.
