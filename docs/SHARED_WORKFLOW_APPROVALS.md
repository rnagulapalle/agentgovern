
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

The current inspected quote source has a pending-only atomic decision operation,
but only a development decision endpoint; that endpoint is NOT used by this
patch. Review artifacts for AWS runtime version14 are not treated as permission
to overwrite a separate active workflow checkout. Its canonical source needs
confirmation before the native authority integration is patched.

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
