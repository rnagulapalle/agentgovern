# FetchSandbox quote provider contract for the bounded distributor pilot

October 10, 2026. Requested contract; not implemented provider parity or end-to-end acceptance.

Read-only inspection of the current local FetchSandbox HubSpot specification found ten contact paths and a contacts-only resource configuration. It does not expose quote/deal operations or an atomic quote-discount write. The existing LoopLabs private connector twin separately adds contact If-Match and action-effect lookup. Those extensions do not establish hosted HubSpot guarantees. The hosted CRM path must continue to refuse missing atomic guarantees.

## Smallest useful provider increment

Provide one isolated commercial quote fixture with a versioned quote-read, conditional discount-update and action-effect lookup contract. Do not require broad CRM parity or replace existing contact/email behavior. The proposed LoopLabs application-facing abstraction is `quote-conditional-write-1`; it is deliberately not represented as a native HubSpot endpoint.

- Read a quote scoped to the enrolled workspace and quote ID. Return exact distributor identity, recipient, USD currency, integer minor-unit line prices/quantities/subtotal, current discount/total and opaque source version.
- Conditional update accepts the exact saved quote request: workspace, quote, action idempotency key, expected source version, distributor, currency, subtotal, discount basis points and total minor units. Validate the approved source condition and effect atomically; a preflight GET followed by unconditional update does not satisfy the contract.
- Identical action retries return the original accepted/effect identity. Reusing an action ID with different request bytes or scope refuses. Source conflict refuses without changing the quote. Cross-workspace quote/action access refuses.
- Persist effect and action correlation durably before reporting acceptance. Lost response after a committed write must be discoverable by action ID without resending. Read-back includes quote/workspace, action ID, approved request identity, source-before/source-after and exact resulting quote values. Matching final values alone cannot prove which action occurred.
- Retain state and effect evidence across provider restart. Uncertain or failed persistence cannot be represented as a durable successful effect. Error and effect lookup must not expose other customers.
- Reuse the existing isolated email provider where its action-idempotency and observation guarantees are proved. Email eligibility is enforced by LoopLabs against the verified matching quote effect; provider setup never grants plan or action approval.

Provider capability metadata must identify the exact binding and contract version. Declare unsupported capability explicitly; no fabricated `atomicSourceVersion: true` based only on an OpenAPI schema or a passing HTTP status.

## Exact proposed write snapshot

`lib/quotes/plan.ts` prepares this logical application request. `/quotes/quote-42` is a proposed adapter resource, not a claim that native HubSpot or the hosted FetchSandbox API exposes this path. The transport, credentials, provider lookup route and actual atomic semantics still need implementation and conformance.

```json
{
  "contract": "quote-conditional-write-1",
  "binding": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "method": "PATCH",
  "resource": "/quotes/quote-42",
  "workspaceId": "company-a",
  "sourceVersion": "v3",
  "idempotencyKey": "00000000-0000-4000-8000-000000000002",
  "body": {
    "distributorId": "distributor-7",
    "currency": "USD",
    "subtotalMinor": 100000,
    "discountBps": 1400,
    "totalMinor": 86000
  }
}
```

The provider must check the workspace, enrolled quote, binding, expected source version and exact body in the same atomic operation that records the effect. A source conflict must write neither the quote nor a committed effect. An identical already-committed action retry must resolve to its original action/effect identity rather than applying a second update, even though that original write advanced the quote version. A changed workspace, source condition, binding, resource or body under the same action ID must refuse; do not replace the original request or create another effect. A later conflicting current quote still prevents downstream verification; returning the original retained action does not authorize another write.

The proposal's trusted quote source separately binds distributor recipient and line items. Prices are positive safe integers in USD minor units; quantities are integers from 1 through 1,000,000, with 1–100 uniquely identified lines whose sum equals the subtotal. The current validator permits no implicit rounding: `subtotalMinor × (10000 − discountBps) = totalMinor × 10000` must hold exactly. Other currencies, taxes/fees, fractional discounted cents and general pricing rules are unsupported by this narrow contract. The prepared message explicitly excludes taxes and fees.

## Exact proposed readback envelope

`lib/quotes/effect.ts` defines `QuoteEffectLookup` and checks it with `observeQuoteEffect(exactSavedRequest, lookup)`. An authenticated, workspace-scoped provider adapter must supply the envelope; a browser or model-generated object is not provider evidence.

```json
{
  "contract": "quote-effect-lookup-1",
  "status": "available",
  "effects": [
    {
      "contract": "quote-effect-readback-1",
      "binding": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      "workspaceId": "company-a",
      "quoteId": "quote-42",
      "actionId": "00000000-0000-4000-8000-000000000002",
      "requestIdentity": "<quoteRequestIdentity(exact saved write snapshot)>",
      "effectId": "00000000-0000-4000-8000-000000000009",
      "state": "committed",
      "sourceBefore": "v3",
      "sourceAfter": "v4",
      "result": {
        "distributorId": "distributor-7",
        "currency": "USD",
        "subtotalMinor": 100000,
        "discountBps": 1400,
        "totalMinor": 86000
      }
    }
  ],
  "current": {
    "workspaceId": "company-a",
    "quoteId": "quote-42",
    "sourceVersion": "v4",
    "distributorId": "distributor-7",
    "currency": "USD",
    "subtotalMinor": 100000,
    "discountBps": 1400,
    "totalMinor": 86000
  }
}
```

The placeholder `requestIdentity` above must be replaced with the actual lowercase SHA-256 digest; it is deliberately not fabricated example evidence. The existing helper computes `quotePlanDigest(exactSavedRequest)`: recursively sort JSON object keys, preserve array order, serialize without whitespace, then hash UTF-8 `looplabs-quote-proposal-1`, one newline, and that canonical JSON. Changing any saved request field changes its identity. This is correlation data, not a signature, certificate or independently authenticated receipt.

`state: committed` means the provider durably retained the effect and its action/request correlation. Do not synthesize it from HTTP 200, matching quote values, volatile memory, pending work or failed persistence. `sourceBefore` must equal the approved saved request's source version; `sourceAfter` must be a different opaque version. The current quote must have exactly that `sourceAfter` and the same commercial result. A later write invalidates this current-state verification even if it restores identical discount and price values.

Objects require exactly the fields shown; extra or missing fields refuse. Workspace, quote and distributor IDs use 1–64 ASCII letters, digits, underscores or hyphens. Source versions use 1–128 ASCII letters, digits, dots, underscores, colons or hyphens. Action/effect IDs are UUID v4; binding and request identity are 64 lowercase hexadecimal characters. Numeric amounts are safe integers; discount basis points are 0–10,000, and the exact discount equation above also applies to results. Available verification requires a dense array of 1–16 valid effect entries. Return one entry normally; exact duplicate entries are tolerated but must identify the same physical effect.

| Observation | Required treatment |
| --- | --- |
| One exact correlated committed effect and matching current quote | `verified`, retaining that effect ID as the observation reference; no approval or downstream dispatch authority is granted |
| Repeated identical effect entries | Same verified effect ID; duplicates do not establish multiple writes or authorize a retry |
| Different effect entries, including a second effect ID with identical values | `conflict`; contain the workflow |
| Valid evidence with wrong workspace/quote/action/binding/request identity, wrong approved source, unchanged source version, different result or later current source | `conflict`; keep the message held |
| Missing effect, final values alone, absent current readback, malformed fields, noncommitted state, unavailable provider or unsupported saved request | `unknown`; keep the message held and do not resend based on missing evidence |

An unavailable lookup should return `status: unavailable`, `effects: []` and `current: null`; unavailable responses cannot verify even if they contain apparent effects. Unknown and conflict outcomes deliberately carry no successful effect reference. This helper does not retry, call a provider, prove durability by itself or verify live delivery.

## Bound plan and email destination

The new `distributor-quote-plan-2` proposal retains the immutable quote request
above and adds an exact server-owned `quote-authority-1` snapshot: enrolled scope
ID/version, independent manager grant version, policy association, recovery epoch,
quote binding and separate email binding. Migration 20 supplies those grants;
additive migration 21 binds them at proposal insertion. The application rechecks
current authority before insertion and duplicate return. Historical v1 proposals
remain readable and cannot pass the bound-plan contract check.

The separately proposed email request now has contract `quote-email-request-1`,
its own enrolled `binding`, `workspaceId` and `quoteId`, alongside the existing
exact method/resource/idempotency key/body. Sender and recipient must match the
same bound quote authority. These are logical application snapshots, not newly
implemented provider endpoints. The email adapter still needs observed conformance
for the exact retained request and action identity. Provider availability,
capability metadata and plan review never authorize sending.

The application contract check establishes binding only. Actual manager approval,
quote dispatch and downstream email dispatch must independently revalidate the
current scope, manager, policy, identity and recovery epoch. They remain integration
work and are not enabled by the proposal migration.

## Required conformance before integration acceptance

1. Read enrolled quote and source version; refuse other workspace and missing scope.
2. Apply one exact conditional discount update and observe its correlated effect.
3. Submit duplicate request; observe one effect and the same action identity.
4. Change payload under the same action ID; refuse with no second effect.
5. Change quote after approval; stale expected version refuses atomically.
6. Lose response after accepted write; effect lookup finds exactly one committed effect.
7. Restart provider; read quote and the same retained action effect.
8. Exercise unavailable provider and failed persistence; no invented acceptance.
9. Keep original contact and email regression proofs passing.
10. Return exact action/request/source correlation and current readback; matching values without that correlation must remain unknown. A later quote write, even with identical values, must contain the dependent message.
11. Refuse conflicting multiple effect identities for one action, malformed or foreign evidence, and unsupported capability/binding declarations. Preserve the same effect identity across duplicates and provider restart.

Use disposable records and offline fault injection, with actual connector requests and observed effect evidence. Do not weaken existing approval, source-version, idempotency or workspace checks to call the workflow complete.

## LoopLabs-owned integration

The retained pricing validator is in `lib/quotes/plan.ts`; `lib/quotes/plan-v2.ts` wraps it with exact authority and independent email binding. The separate optional proposal store is in `lib/quotes/store.ts` with migrations 19–21. The store saves immutable owner/workspace-scoped proposals and hashes, rechecks current named requester/reviewer membership, and contains older recovery epochs. It does not create approvals, enroll capability grants, call providers or start workflow execution. Migration 19 is not evidence of production deployment. The deterministic readback validator in `lib/quotes/effect.ts` is likewise separate from connector execution. Unit and dedicated PostgreSQL checks for these contracts do not prove provider conformance.

The server-owned context loader still needs an actual quote source, current explicit manager capability grants, enrolled agent scopes and a verified provider binding/capability contract. Membership alone must not make someone an eligible manager. Capability changes must follow the workspace lock/version discipline, and actual approval/dispatch must revalidate current authority independently of the saved plan. The quote connector, approval/lease integration, distinct persisted workflow/worker contract, dependent message enforcement and typed-request UI remain integration work. Reuse existing connector approvals, leases, immutable snapshots and orchestration admission; preserve existing acknowledgement histories.

The actual demonstration remains: typed 14% distributor request against 10% delegation, independently eligible manager review, exact conditional quote write, lost-response read-back, independently approved quote email held until verification, duplicate/stale/revoked/cross-workspace refusal and restart recovery. Full quality and release gates remain required. No live customer email or commercial write is authorized by this document.
