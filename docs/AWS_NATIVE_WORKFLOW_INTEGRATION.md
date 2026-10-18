# Existing AWS workflow: history, checkpoint and outcome integration

Status: observation implementation staged; not deployed. Native execution enforcement remains future work.
Owner: LoopLabs engineering. Customer-specific additional guards are a later extension.

## Observation-first onboarding contract

Observe available AWS telemetry through reviewed source access and supported format
mappings. Do not require every workflow builder to emit LoopLabs-specific events
before inventory discovery. AWS-compatible storage is not a universal event schema;
missing source access, unsupported formats, missing tool events and unverified
enforcement must remain distinct capability gaps. Preserve usable observations.
A telemetry gap must not turn a successfully discovered agent into a failed
connection. Do not advertise full OTEL ingestion or continuous history before it is
implemented and measured.

Onboarding must show evidence coverage and recommendations for the workflow builder.
The downloadable contract is `public/guides/aws-agent-integration.txt`; it describes
optional instrumentation, event correlation, privacy, durable operational state and
mandatory checkpoint/bypass requirements for enforcement. The staged discovery UI
links it and distinguishes the invocation reader from the staged business-event history mapping. This guidance changes no
execution authority and does not enable an unsupported telemetry format.

CloudWatch telemetry can retain observed history independently of the agent's
`/runs` database. The SQLite finding below therefore blocks claims about durable
native continuation/state, not all possible observation through AWS telemetry.

## Agreed behavior

The customer's agent and workflow remain in AWS. Keep existing discount policy,
manager authorization and Slack approval interface. Observe existing runs in LoopLabs.
Add mandatory execution checkpoints around protected tool effects; do not create a
second pricing workflow or a second approval prompt. Existing workflow denials can
never be overridden by a LoopLabs permit. Approval is a decision, not evidence that
an action executed or an output was delivered.

For the first integration the existing workflow remains the source of business
approval. Before LoopLabs can accept that approval as evidence it needs a reviewed,
authenticated integration and verified mapping of its manager identity. An agent's
unverified `approved` field is insufficient. Current LoopLabs connector authorization
must not be bypassed or relabeled to accommodate an external approval.

## Measured source and runtime baseline, October 15

Customer account 342206308838, us-west-2; AgentCore runtime
`quote_agent_demo_20261015-P3t39c2UvD`, version 9. Local deployment receipt image:
`sha256:a8194c22240c0138fb024b970aed90cd4d68547701bad6f42d3580bd24a68bb4`.
Five modified source files matched that image's recorded source hashes. These are
local deployment-record checks, not an independent extraction of the image.

The source orchestrator directly calls HubSpot and Gmail/Slack. There is no LoopLabs
checkpoint in those inspected paths. `resolve_customer` can create a contact before
the discount policy check; enforcement inventory must include this write, not only
`record_crm` and `send_quote`. A discount block does not establish zero earlier effects.

Native authenticated `GET /runs?limit=50` returned zero runs from the recorded
session. Lambda ingress configuration references that same runtime/session. This is
an empty current snapshot, not proof that past runs did not exist. Configured storage
is SQLite under `/tmp`; runtime metadata specifies 900 seconds idle, 3600 seconds
maximum lifetime, and no mounted filesystem. Retention across runtime replacement
is not established. Do not restore an old snapshot or replay customer messages to
make a history screen appear populated.

The observed secret has no explicit discount threshold overrides. The inspected
source defaults are approval at >=20%, block above 70%, not a measured 75% policy.
Confirm effective policy through the native adapter before showing thresholds as
current control-plane authority. Do not silently change them to a demo example.

Sanitized diagnostics stay outside public Git in
`.local/aws-native-onboarding-review/` in Raj's primary checkout. No native request,
provider credential, customer message or customer identity is committed here.

## Observation increments and measured boundaries

| ID | Increment | Measured evidence | Remaining acceptance |
| --- | --- | --- | --- |
| O1 | Renewable server identity | Server-local official Roles Anywhere helper minted a 15-minute session and STS returned the infrastructure broker account; leaf private key remained on server | Web container attachment, certificate rotation and production customer role |
| O2 | Connect and discover | Reviewed CloudFormation template, exact principal/ExternalId/region, restrictive read-only STS session policy; mounted browser fixtures and SDK contract tests | Real customer grant through production Chrome and discovery through that role |
| O3 | Onboard owner and source | Dedicated PostgreSQL tests: tenant isolation, immutable/idempotent enrollment, inactive owner refusal, exact recovery epoch and source review | Production migration and saved enrollment through deployed UI |
| O4 | Read workflow history | Native local read: runtime version 10, 288 accepted business events across 13 runs, zero unsupported records in that read; no invocation or provider mutation | Deployed server read and fresh native permitted/approval/blocked Slack cases |
| O5 | Release and dogfood | Development checks only; no release acceptance yet | Full quality, CI, controlled deployment, production browser verification and recording |
| E1 | Execution checkpoint | Not built or proved for this external agent | Authenticated decision binding, mandatory protected calls, bypass denial, continuation and effect verification |

The current source advanced independently to runtime version 10, image
`sha256:42d2e3071a053ad17dbbbe6e24e5ab834c851fc340f10bfb3c5f58a98e50b0fe`.
It already exports structured business events through an SQS-backed collector to
CloudWatch. LoopLabs does not need to deploy a replacement exporter. The measured
log source retained events for 30 days. The read result is one window, not proof
that all workflow effects were exported or verified. Native source-reported failures
and rejections remain failures and rejections in the display.

`workflow-telemetry.ts` maps schema 1.0, with bounded pagination, microsecond event
ordering, duplicate/conflict handling and an allowlisted projection. Raw customer
messages, credentials and unrestricted provider responses are omitted. No observed
approval becomes LoopLabs authorization. `external-run-history.ts` is a separate
bounded adapter for saved `/runs` responses; it is not the CloudWatch transport.

Migration 28 adds append-only observation enrollment and scoped web SELECT/INSERT
only. It does not grant execution, mutate existing action states or migrate the
external workflow. The production upgrade uses a one-shot owner process with
verified database TLS and exact existing web-role/workspace binding. Worker and
scheduler roles receive no new observation privileges. A rollback retains an
already-applied additive table; it does not delete historical enrollment.

The pilot broker can assume only dedicated `LoopLabsObservation-*` roles in the
reviewed customer account. Further customer accounts need a separate administrator
review of that broker policy. Customer connection remains a reviewed AWS grant,
not ordinary OAuth. Source identity propagation is included in the role trust for
the certificate-authenticated broker chain; it grants no provider tool operation.
The broker identity certificate expires November 14, 2026 and needs operational
renewal before expiry. Automated certificate rotation is not yet proved.

The intended observation demo is connect account → discover existing runtime →
review owner/log source → onboard for observation → send an authorized test quote
in the existing Slack app → refresh history. Show permitted, held/approved and
blocked source paths separately. Existing workflow decisions stay in AWS. Claims
about checkpoint enforcement or independently verified effects are excluded from
this observation demo.

## Execution checkpoint contract to implement, not a shipped API

Bind an external action to enrolled tenant/workload, AWS deployment identity, run
and immutable step/action ID, reviewed tool operation, exact target and payload
hash, source precondition, policy version, applicable verified manager decision and
expiry. Read-only discovery cannot issue this authority. A changed payload, stale
source, revoked membership/workload, restored epoch, expired decision or missing
evidence denies execution. Replays reuse the action ID and inspect outcome.

Use one decision authority for the business rule. Keep Slack signed interactions
and the existing manager allowlist, but validate their decision evidence at the
checkpoint. LoopLabs may further restrict an existing approval; it may not loosen an
existing block. Later customer-specific policies intersect with these limits.

A cooperative SDK hook is not bypass prevention while the agent retains usable
provider credentials. Native enforcement acceptance additionally requires a reviewed
credential/egress boundary around protected calls, or an explicit limited claim that
only instrumented paths are controlled. Do not label the whole agent controlled
from discovery, traces or a successful cooperative happy path.

## Later enforcement dogfood script after E1 acceptance

1. Connect the correct AWS account, discover the exact deployed agent, review its
   owner and tools, then explicitly enable only supported protected operations.
2. Send a normal quote/allowed discount through the existing Slack intake; find its
   run, policy decision, tool steps and confirmed effects in LoopLabs.
3. Send an above-threshold request via Gmail. Show the same run held before the
   protected quote change and customer quote send. Review the existing Slack card.
4. Approve in Slack as an authorized manager. Confirm automatic AWS continuation,
   one CRM effect and the dependent customer response. Repeat approval/delivery
   without another effect. Reject another request and confirm no protected effect.
5. Exercise a source-policy block, stale record and response-loss case. Distinguish
   blocked/rejected from uncertain; verify uncertain effects before retry.
6. Revoke the enrolled execution path and attempt a direct protected call. Capture
   actual denial and retained history. If bypass succeeds, enforcement stays partial.

Use only reviewed test records, test channels and authorized recipients. No public
or third-party outreach is authorized by this plan. Preserve existing sample demos.

## Validation boundary

Focused unit/adversarial tests cover projection, identity pinning, privacy,
malformed/oversized data, duplicate rows, bounded transport and honest evidence
labels. Native read receipts remain separate. `pnpm quality` and release checks are
still required before commit/deploy; focused tests do not satisfy the release gate.
