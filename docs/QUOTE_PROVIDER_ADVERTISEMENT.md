# Proposed quote-provider onboarding metadata probe

October 10, 2026. Implemented read-only LoopLabs helper; **the proposed provider
endpoint is not implemented or proved by FetchSandbox**. No quote workflow,
conditional write, approval, email dispatch or actual provider conformance is
established by this helper or its transport tests.

`lib/quotes/provider-contract.ts` exposes `probeQuoteContract(serverBinding,
serverCredentialLoader, timeoutMs)` and the pure
`inspectQuoteContractAdvertisement(metadata, serverBinding)`. They are unused by
runtime submission and cannot enroll or change authority. Supply bindings only
from administrator-reviewed server configuration; never browser or model input.
The probe snapshots configuration before awaiting its secret loader. It accepts
only the existing hosted connector origin allowlist, a sandbox ID, workspace and
quote ID, distinct quote/email binding hashes and an expected positive integer
advertisement version. Version changes require explicit server configuration and
fresh authority review; the helper never updates saved proposals.

The **proposed**, GET-only route is:

```text
/sandbox/<server-owned sandbox ID>/.well-known/looplabs-quote-contract
```

The response requires `application/json`, at most 16 KiB, and exactly:

```json
{
  "contract": "quote-provider-advertisement-1",
  "contractVersion": 3,
  "workspaceId": "company-a",
  "quoteId": "quote-42",
  "quoteBinding": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
  "emailBinding": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
  "quoteWrite": "quote-conditional-write-1",
  "quoteLookup": "quote-effect-lookup-1",
  "quoteReadback": "quote-effect-readback-1",
  "emailRequest": "quote-email-request-1"
}
```

These are illustrative bindings/version, not observed provider evidence. All
identity and version fields must equal the independently configured expectation.
The declaration describes requested contract versions; it does not assert that
atomic source checks, idempotency, durable readback or delivery were measured.
An extra `atomicSourceVersion: true` field does not establish conformance and is
refused by this exact metadata shape.

Results are deliberately limited:

- `advertised`: the authenticated metadata matches the expected declaration.
- `unsupported`: absent endpoint (404/405/501), missing/malformed identity or
  metadata, stale/mismatched version, contacts-only declaration or extra fields.
- `unavailable`: authentication/transport failure, redirect rejection, timeout,
  invalid response encoding or oversized/unreadable response. Do not infer the
  provider's capability from an unavailable observation.

**Every result** has `conformanceEstablished: false` and
`executionEligible: false`. No raw response, token or exception text is returned.
The shared bounded deadline covers secret acquisition, HTTP and body reading.
Requests omit browser credentials, disallow redirects, bypass caches and perform
no writes or automatic retries. Existing hosted contacts-only providers remain
unsupported; this helper must not synthesize an advertisement for them.

After matching metadata, independently run all actual conditional-write,
duplicate/changed-request, stale-source, lost-response, cross-workspace,
restart/persistence and exact-effect tests in
`FETCHSANDBOX_QUOTE_HANDOFF.md`. Those are necessary before a server-owned
conformance record can be considered. Later approval and dispatch must still
revalidate current policy, grants, versions, provider binding and recovery epoch.
Transport mocks in the helper's tests prove bounded refusal and secret handling;
they are explicitly not an actual FetchSandbox provider acceptance.
