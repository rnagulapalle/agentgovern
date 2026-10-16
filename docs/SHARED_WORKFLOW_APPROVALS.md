
## Shared AWS workflow approvals — local patch, October 16

The `codex/aws-shared-approval-bridge` patch adds a separate approval connection.
It does not expand the read-only AWS observation role or enable approvals from
CloudWatch events. It is not deployed or connected to the current quote runtime.
The three acceptance targets remain partial until native tests below pass.

The agent history screen can display the existing workflow's pending and decided
requests with the reason, exact proposed action/system, before/after values,
requester, policy version, deadline and saved decision identity. A named reviewer
confirms approval or rejection. Visible pages check the shared authority every
15 seconds; changed decisions refresh history. This is polling, not a push or
instant synchronization guarantee. Failed reads remove actionable controls.

`POST /api/workspace/discovery/approvals` requires the existing invited session,
same origin, current observation enrollment, recovery epoch and throttling.
Only server-configured reviewers who also appear in the workflow's reviewer list
can decide; self-review is refused. Each decision rereads the current immutable
review hash, checks expiry and current membership/enrollment, and sends one
idempotent decision command. An uncertain response removes controls and requires
readback; there is no automatic mutation retry. Approval and execution outcome
are separate states.

### Customer hook contract

The workflow remains the only approval authority. Both its Slack handler and
`Authority.decide_exact` must compare-and-set the SAME saved approval, enforce
current policy/identity/deadline and exact request revision, and arrange durable
continuation once. Do not create a second approval database in the adapter.
Slack message update and workflow event emission remain the workflow's job.
`integrations/shared-approvals/receiver.py` is a signed HTTP protocol helper;
its authority interface is deliberately NOT a native quote-agent adapter.
Its fixture tests do not prove native database concurrency or continuation.

The current production baseline is AWS runtime version14. After Raj selected
that version, a read-only runtime command verified that the local app,
orchestrator, store and configuration hashes match its running source. A
separate customer-workflow patch now adds the native authority integration;
it is deliberately not copied into the LoopLabs product. Its source changes
are prepared privately against that measured baseline, not applied to AWS.
The development decision endpoint is NOT used by either patch.

The native patch freezes reviewed details, quote bytes, policy and connection/
recovery scope in the EXISTING approval record. Both Slack and the signed hook
enter the existing orchestrator; one conditional source-table update checks
pending state, unchanged quote bytes and held run state. The native manager
mapping, self-review, expiry, policy and recovery checks apply to both surfaces.
Existing old pending requests are not silently enrolled; they require a fresh
source review. SQLite/source integration tests and a cross-language client-to-
ASGI test passed with simulated providers. This is not live AWS acceptance.

The existing source architecture still has a crash window between claiming a
decision and continuation. The patch reports a claimed-but-still-held run as
uncertain and never repeats it blindly. A transactional continuation outbox,
PostgreSQL concurrency/restore tests and production HA remain separate work;
local duplicate tests do not establish those properties.

The reviewed API Gateway endpoint is exactly
`https://<api-id>.execute-api.<region>.amazonaws.com/looplabs/approval-bridge`.
No redirect, arbitrary customer URL, AWS secret read, general invocation or
provider-write authority is granted by this patch. Server configuration
`LOOPLABS_EXTERNAL_APPROVAL_BRIDGES` contains an array of exact tenantId,
connectionId, resourceArn, version, epoch, endpoint, secretPath and reviewers.
The secret is a mounted owner-readable-only `/run/` file containing 64–128 hex
characters, never a browser value or a Git file. Bindings do not survive an
epoch/version mismatch automatically. An absent binding shows disconnected.

Requests use JSON with contract `looplabs-shared-approval-1`, exact scope, random
nonce, Unix-second timestamp and operation `list` or `decide`. Sign the original
bytes using HMAC-SHA256 over `request\n<body>` in `x-looplabs-signature`.
The receiver rejects envelopes outside five minutes and unknown fields.
Decision commands additionally contain id, revision, policyVersion, decision,
reviewer and decisionId. Reviewer comes from the authenticated LoopLabs session.
The workflow must independently map that trusted reviewer to its own manager
identity/authority; an email string alone is not that proof.

Replies are `{nonce,requests}`. Sign `response\n<sha256(original-request)>\n<body>`
in `x-looplabs-response-signature`. Responses are bounded to100 requests and
128KiB. Approval records use the fields in `ExternalApproval`; their revision
is the SHA256 of the JSON array constructed by `approvalHash`, including all
human-reviewed details, policy, requester, reviewers, deadline and trigger.
This hash is integrity binding, not a public cryptographic audit receipt.
Remote status is authoritative; approval does not assert successful execution.

### Required native acceptance before enabling

1. Trigger a new approval-required request from Slack; display the SAME approval
   in LoopLabs with its reason and exact changes, without another request.
2. Decide in Slack; LoopLabs polling displays its saved reviewer/decision and the
   execution history. Measure delay and distinguish logs lag from source state.
3. Decide another request in LoopLabs; the existing AWS workflow resumes, its
   original Slack card loses decision controls and shows the same saved outcome.
4. Race Slack versus LoopLabs and replay both commands: one decision and one
   continuation. Separately test rejection, expired/changed policy/payload,
   revoked reviewer, self-approval, recovery mismatch and lost acknowledgement.
5. Verify actual provider effects independently. A protocol fixture or signed
   acknowledgement is not native continuation, delivery or bypass-prevention proof.

Focused synthetic server/browser/helper checks are recorded separately in the
local patch receipt. No full quality/CI or production/native acceptance has been
claimed for this patch.

### AgentCore transport patch

`integrations/shared-approvals/agentcore_relay.py` prepares a fixed-target API
Gateway/Lambda relay. It accepts only POST to the approval-hook path, forwards
original signed bytes into the existing generic AgentCore HTTP envelope, and
unwraps the signed response body. The native hook has an opt-in response envelope
so correctness does not depend on propagation of arbitrary AgentCore response
headers. The relay cannot choose a runtime/session/native path from browser input,
read business credentials or decide an approval. Its AWS client uses one attempt;
a timeout returns uncertain. Deployment must pin the existing workflow session,
restrict the Lambda invocation role to its exact runtime, apply API Gateway
throttling and verify the full signed round trip. No relay, IAM grant, signing
secret or API Gateway endpoint has been created by this patch.

AgentCore version14 remains unchanged; activation of changed source creates a new
version. Update the reviewed enrollment/version binding deliberately. Runtime-
local SQLite is not durable across session destruction; do not start an unrelated
empty session and call it the workflow history. Preserve existing state during
any later deployment and record that separately from application correctness.

### Explicit quote-demo exception and deployment attachment

Raj selected preserving requester self-approval in this demo on October16. Both
native authority and LoopLabs require explicit `allowSelfReview: true` for this
exact configured connection; the default remains independent reviewer required.
Native policy version binds that option. The UI identifies the demo exception.
Named reviewer membership, exact revision, policy, expiry and source CAS checks
remain required. This is not a general enterprise self-approval policy.

Current-host attachment: `control-demo` reads an optional owner-only directory
through `/srv/looplabs-production/config/shared-approvals-current`. Binding
metadata becomes the bridge environment setting and signing files are mounted
read-only at `/run/looplabs-approvals`. Exact prior environment and mounts are
retained for rollback; unrelated host security and services remain checked.


### October 16 release candidate and measured evidence

The customer workflow was subsequently activated as AgentCore version 15. Its
signed API Gateway read returned HTTP 200 with a verified response signature and
nonce. An expired approval remained held; it was not approved or retried. The
version-15 observation enrollment is saved in LoopLabs. These reads do not prove
live decision continuation. The LoopLabs web release remains pending until PR
#102 passes CI and the authenticated production approval route is verified.

The changed source closure has a new, separately retained installed discovery
receipt: `docs/evidence/discovery-installed-browser-v3-20261016-shared-approvals-proof.json`.
All 30 discovery assertions were measured against a fresh compiled app and an
owned TLS PostgreSQL instance, which was removed afterward. This uses provider
fixtures and does not establish native AWS approval acceptance. The CI fixture
archive preserves all provider bytes and replaces only the three measured
compiled discovery files. A fresh Slack request and its actual LoopLabs decision,
continuation and provider-effect readback remain the native acceptance task.

The source-registry provenance test exceeded its former five-second deadline
in CI (5.108 seconds). Its bounded timeout now matches the discovery evidence
suite at 30 seconds; all dependency-drift refusal assertions remain in place.
The two affected evidence/registry files passed 83 focused tests locally. This
is separate from the full candidate CI result and the production release.

The next CI attempt stopped before application tests because the fixture loader
referenced the preceding receipt filename. The loader now uses the measured
shared-approvals receipt. A direct restore verified all 299 files, the provider
Git commit and all three compiled hashes; its four focused unit tests passed.
