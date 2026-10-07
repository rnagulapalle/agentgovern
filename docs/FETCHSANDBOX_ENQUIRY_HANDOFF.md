# FetchSandbox integration handoff: customer enquiry

Start at https://looplabs.run/control-plane/work with an invited named member account. Use the example prompt, then clarify `customer@example.test`. Check connections, review the exact saved plan, and choose **Rehearse this plan**. A different invited member opens the saved enquiry and approves the CRM and acknowledgement cards. Progress and the verification receipt update automatically; neither account needs to click Execute.

Do not share founder passwords or tokens in Git, screenshots, chat or this document. Ask Raj to invite/provide an authorized test identity through a private channel. Reviewing a plan is not action approval.

## Interfaces already wired

All browser requests use the invited session cookie, same-origin POSTs, strict JSON fields and no-store responses. External integrations use separately scoped bearer identities; never use the worker credential as an agent or human credential.

| Interface | Meaning |
| --- | --- |
| POST `/api/workspace/enquiries` `{operation:"chat", id, turns:[{role:"user",text}]}` | Interpret a bounded request; return clarification or immutable saved sample plan. |
| POST same endpoint `{operation:"checkConnections"}` | Authorized provider read only; return atomic-version readiness and no-real-delivery boundary. |
| GET same endpoint | Saved plans, sanitized connection mode and worker heartbeat. No keys. |
| POST same endpoint `{operation:"rehearse",id,planHash}` | Named owner submits reviewed plan; assign scoped assistants and persist held actions. Stable ID is replay-safe. Hosted CRM binding currently returns 409 before submitting actions. |
| GET `/api/durable/workflows?run=ID` | Exact step IDs, states, proposed requests and recorded effects. |
| POST `/api/durable/connectors` `{operation:"approve",actionId,payloadHash}` | Different named member approves the exact payload for 15 minutes. Self-approval fails. |
| POST same `{operation:"reject",actionId,payloadHash}` | Decline the exact action. Downstream remains held. |
| POST `/api/durable/workflows` `{operation:"pause",runId}` | Stop new dispatches. Does not recall in-flight effects; no resume in this release. |

The runner uses the same execution/verification service contracts as the existing connector API. It does not bypass approval checks or supply caller-invented evidence.

## Provider contract to resolve

For CRM, the write must atomically compare the approved source version **at the provider effect boundary**. A preflight GET followed by an unconditional PATCH is insufficient: another writer can change the record between those operations. No weakening to last-write-wins or pretending a matching final value proves the specific action is acceptable.

The binding needs stable action idempotency, workspace isolation, an atomic expected-version conditional write, action-correlated accepted/effect evidence, and independent read-back. The current private twin uses an If-Match conditional PATCH and action-specific `/proof/effects/{actionId}` evidence. Hosted HubSpot/Resend paths are different and must implement/document a real capability rather than assuming private fixture extensions exist in hosted or live HubSpot.

Hosted email proof already uses Idempotency-Key and X-Flow-Run-Id, a correlated request archive and a returned email-ID read. The provider acceptance is not an inbox delivery receipt. `scripts/hosted-connector-proof.ts` verifies response loss, duplicate suppression, unauthorized archive access and wrong/extra acceptance conflicts through actual isolated FetchSandbox HTTP.

## Acceptance before enabling hosted managed rehearsal

1. Normal completion: actual typed UI request → saved plan → independently approved actions → one conditional CRM write → one email acceptance → independent verification receipt.
2. Duplicate plan/submission/worker tick: identical immutable IDs and exactly one effect per action.
3. Lost response: accepted effect with transport timeout, application and worker restart, read-back recovery, no repeated CRM write or email send.
4. Customer changed after approval: atomic conflict, no stale overwrite, no downstream email; include a concurrent writer between source-read and effect.
5. Revoked agent, policy change, expired approval, inactive reviewer, pause: fail closed at dispatch and recheck during verification.
6. Wrong body, recipient, additional acceptance, incomplete evidence: conflict or uncertainty, never green.
7. Hosted cross-owner/session scope and provider restart: isolation and durable receipts verified, not inferred.
8. Mobile UI: recipient, exact action, decision and uncertainty readable without scrolling horizontally.

Run `pnpm quality` and both recorded connector proof scripts after any covered change. Keep the hosted readiness gate until the contract and these observations pass. Local scripted fixtures alone do not establish the chat experience, hosted parity or live-provider readiness.
