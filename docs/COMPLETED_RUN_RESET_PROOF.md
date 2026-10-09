# Completed-run reset: measured refusal, not production support

October 9 local calibration used Temporal CLI 1.9.1 / server 1.32.0 and the
installed TypeScript SDK. It ran the exact retained baseline workflow bundle on
an explicitly versioned worker with an inert activity. This local bundle has
build `ack-696ab7761b0bc72d20d4a62bedc980fd423869753ffedbf35c9d0d913d91aa21`;
it is not the Linux image from the accepted full drain trial. It did not connect
PostgreSQL, FetchSandbox, production or an operator reset endpoint.

The original execution completed. A reset to its first actual completed workflow
task created a distinct execution, completed and preserved the original content
build pin. Repeating the same request ID against the same original execution,
after the first reset completed, created another distinct execution. All three
executions actually invoked the inert activity. Therefore server request IDs alone
did not establish the required application reset idempotency for this sequence.
This is one measured server/version/sequence, not a claim about every Temporal
reset configuration or its general workflow guarantees.

The sanitized observation is [evidence/local-reset-refusal.json](evidence/local-reset-refusal.json),
SHA-256 `922f9036e0630162e2c3a238580ff7d4cc8fe27aeaa2dc3023bd78aa0cf713a7`.
Its `passed:false` is intentional: the idempotency requirement failed. Original
and first-reset histories contain 11 and 14 events. The three actual activity calls
are inert calls, not three business-system effects. No raw history is published.

`temporal-completed-reset.mjs` is a disposable proof helper, never a public reset
API. It requires an explicit isolated invocation and validates the original
completed history and actual worker deployment pin before reset. It excludes
signal/update/Nexus reapplication and makes no post-reset version move. It rejects
missing pins, malformed identifiers, incomplete histories, missing actual task
boundaries, auto-upgrade and a duplicate reset returning a different execution.
The diagnostic calibration records `passed:false` and the specific blocker when
this measured duplicate-execution refusal occurs. A successfully collected failure
observation is not successful reset acceptance.

## Next implementation and acceptance

Before exposing reset, persist a separate reset intent with immutable original
execution, history hash, task boundary, approved artifact/build and operation ID.
Serialize attempts at the database boundary. A completed intent returns its saved
result; concurrent or uncertain intents cannot send another reset blindly.
Write intent before RPC. A lost response remains uncertain until independent
Temporal history/readback binds the resulting execution to that exact intent.
Do not reset action IDs, reservations, approvals, scopes or current authority.

The next actual assembled proof must exercise this protocol with restricted
application credentials, migration14 still draining, exact retained worker bytes
and independent provider readback. Require one reset execution per intent,
unchanged completed application actions and reservations, no repeated provider
effects, current permission revalidation, lost-response containment and restart
recovery. Archive/restore must not revive reset intent authority or reactivate a
draining build. Retained image/history retrieval remains a separate acceptance.

The previously accepted 113-source drain receipt remains unchanged. This local
calibration neither replaces that runtime proof nor closes its reset/archive,
retention, persistent operator or enterprise service-objective gaps. Production
continues using its existing runner; no cutover or deployment is authorized here.
