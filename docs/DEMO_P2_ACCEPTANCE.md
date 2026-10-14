# P2 demo safety: engineering and recording boundaries

This checklist covers the P2 rows in the October 13 demo-gap table. The narration
and final edited recording are separate deliverables. No deployment or production
browser acceptance is established by the local tests below.

## Changed request and approval expiry

The discount request is immutable. After independent approval of 25%, attempting
to reuse its request ID for 26% is rejected. A new 26% request has a new ID and
needs its own approval; the original 25% approval remains scoped to the original
request. Do not say that preparing a separate request automatically cancels the
original. Changing the applicable policy cancels pending old-policy work.

Local proof: `lib/workspace/demo-safety.integration.test.ts` checks changed payload
rejection after approval, rejection of the old approval hash on the new request,
zero effects before fresh approval, and policy-change cancellation. It also
checks the issued 15-minute interval and expired approval refusal both before a
lease and after a lease but before a write. The expiry test uses an explicitly
labelled test-owner timestamp fixture. It does not demonstrate a real 15-minute
wait in a browser. The UI/API exposes no expiry-editing or force-pass control.

Recording steps using the existing product:

1. Request 25% and have the other named member approve it. Show the request
   reference, exact amount and expiry time. Do not execute it yet.
2. Choose New request and request 26% against the same current record. Show that
   it waits for its own independent approval. The old approval did not transfer.
3. For explicit invalidation, change the applicable approval rule and refresh.
   Show the old pending action cancelled, and the record/version unchanged.
4. In a separate expiry take, approve an exception, show its actual expiry time,
   and wait until that time has passed. Then execute: the server cancels it and
   records no effect. Preserve timestamps if cutting out the wait. Do not change
   production database timestamps or shorten the policy for the recording.

## Containment while work is in progress or uncertain

A containment event now records per-action `authorization_invalidated` evidence.
It covers already-uncertain work as well as queued and leased work. Re-enabling
connector access does not restore a contained action's authority. Reconciliation
can verify an existing effect; if no effect exists, the invalidated action is
cancelled and a new request is required. Previously shipped containment reasons
are also refused when old rows have no new invalidation event.

Local proof: real installed roles and a controlled PostgreSQL sample connector
exercise a lease before its write, a committed write before acknowledgement,
uncertain work, queued work, connector-only containment, workspace agent
containment, policy change, controller reload, stale lease reuse and repeated
execution. Both delegated and independently approved amounts are covered.
Unrelated CRM agent access is checked for connector-only containment. This is not
remote-provider cancellation, rollback of an email, or a process-kill test.

Recording steps using the existing product:

1. Execute an allowed sample discount with Execute · lose response. Show Outcome
   uncertain and one recorded effect; do not click Verify outcome yet.
2. Submit another allowed action against the current record version and leave it
   queued. Click Contain this connector.
3. Show the queued action cancelled, the earlier uncertain action still uncertain,
   and the discount/record version unchanged by containment.
4. Click Verify outcome on the uncertain action. Show that it confirms the one
   existing effect. It did not undo the write or repeat it.
5. Re-enable the connector and show that cancelled work stays cancelled. Any new
   change must be a new request, subject to current policy.

Say: “We stop new work and preserve uncertain outcomes for verification. A change
that already happened is not undone by the stop button.” This browser sequence
demonstrates uncertain-outcome containment. The pre-write leased-worker boundary
is established separately by the integration test; do not claim the recording
shows a remote operation being interrupted mid-flight.

## Still needed after engineering

- Deploy the reviewed changes and repeat the relevant production browser checks.
- Record these visible beats, then add narration and readable pauses.
- Have Raj or Pratibha independently run the full script (the separate P1 item).
- Keep the mandatory scope: sample pricing agent, supported connected action
  paths, simulated systems; no native Foundry/Salesforce or universal interception.
