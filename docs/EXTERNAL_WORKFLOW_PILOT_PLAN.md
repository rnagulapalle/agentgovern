# One external email workflow: integration and acceptance plan

November 4, 2026. Target design and execution plan under existing issues136,139,140and147. No customer/prospect details or credentials belong here. The full architecture diagram is a target, not current implementation coverage.

## Choose one owner, not a second workflow

A builder that already owns a draft/approval/execution loop should retain its native workflow, approval record and provider credentials. LoopLabs can expose the same reviewed approval through the existing `ExternalApprovalBridge`/native `Receiver` protocol. The native executor must revalidate the exact decision at its tool boundary. An observed approval or an MCP discovery connection is insufficient. The current reviewed binding accepts specific AWS endpoints; arbitrary customer hosting is not supported by relaxing an origin check. Endpoint identity, OAuth/workload mapping, signer rotation and deployment need a separately reviewed adapter contract. Do not create another approval queue or run the same effect through LoopLabs and the native runner.

The separate LoopLabs-owned connector lane uses the existing `LoopLabsToolCheckpoint` and trusted server executor over bounded sample contracts. Its versioned resume ticket is a client-consumption reference, not a replacement native engine or approval federation. It does not add arbitrary emails/recipients or general LangGraph/MCP/AgentCore support. The builder's exact runner and sending provider remain inputs to choose the lane.

## Architecture responsibilities

| Existing or proposed block | Responsibility and boundary |
| --- | --- |
| Customer data plane / native runner | Planning, durable continuation and one effect owner. Preserve its existing approval record. |
| Mandatory tool interceptor / native adapter | Check exact immutable request and current authority immediately before dispatch. Prevent alternate credential/tool routes; outage holds writes. |
| Policy/decision boundary | Deterministic identity, tenant, grant, recipient, policy/source-version, expiry and revocation checks. An LLM score cannot waive a hard deny. |
| Approval bridge | Authenticated independent reviewer, exact revision and decision idempotency; a decision is not an execution receipt. |
| Existing PostgreSQL/native durable authority | Persist intent before dispatch, same-action claims/leases, approval invalidation, uncertainty and recovery history. A new process must not lose this authority. |
| Provider adapter + verification | Provider-specific idempotency/retention and independent effect lookup. Do not equate timeout with failure or acceptance with delivery. |
| API/client and operational controls | Bounded documented contracts, current credentials, redacted errors, version compatibility, scoped status reads and containment/manual resolution. A voluntary SDK is not bypass prevention. |

No extra AWS runtime/database is provisioned by this plan or the resume extension. Use existing isolated test resources and scoped sample records; production capacity, backup/restore objectives, service alerts and load/soak acceptance remain separate work. Do not use the existing shared database as evidence of durable native customer state.

## Exact synthetic acceptance sequence

1. Create draftA with a stable logical action ID, exact recipient/body/subject, offer/source revision and policy/grant versions. Independent reviewer approvesA.
2. Change the offer toB before dispatch. AttemptingA must be refused or held without an unauthorized effect; show the actual provider count. Old approval cannot be edited intoB.
3. PrepareB as a distinct freshly reviewed intent linked toA's supersession, only after verifyingA produced no effect. Independent reviewer approvesB. Never use a new ID to hide an unresolvedA.
4. PersistB dispatch intent before the provider call. Provider acceptsB; deliberately lose its response. Record uncertain, not failed, and stop blind retries.
5. Restart the actual executor with retained state. Independently correlate acceptance and read back the exactB message. Record verified acceptance only when the contract supports it; demonstrate exactly one effect in this controlled run. Keep delivery unestablished.
6. Repeat the original logical request and recovery read. No second provider send. If lookup is missing/contradictory, preserve uncertainty/conflict and require resolution rather than inventing a success.

These are separate fault paths joined by a fresh approval; it is invalid to demand both refusal and provider acceptance for the same unchanged stale authorization. Repeat wrong-recipient/record, expired/revoked/self-review/foreign-tenant, outage, lease/crash and concurrent dispatch checks using the existing harness. Do not weaken an assertion or replace the native workflow with a twin to obtain a pass.

## Milestones and gates

| Milestone | Concrete deliverable | Acceptance and present status |
| --- | --- | --- |
| 1 Contract and ownership | Selected runner/provider, identities, exact request/version and sole executor; supported/unsupported matrix | This plan and existing source audit prepared. Customer-specific contract inputs remain unknown. |
| 2 Restart consumption | Versioned bounded reference in existing scoped client; fresh credential resolution and same-action GET on resume | Candidate implemented;14existing HTTP/client checks before,25after. Real runner durable-checkpoint acceptance is not established. |
| 3 Native enforcement adapter | Reuse signed bridge/native Receiver and native queue; map actual authenticated reviewers; no bypass credentials | Existing bounded AWS protocol is a starting point, not compatibility with another deployment. Source/config/native acceptance still required. |
| 4 Combined execution evidence | Extend existing native-quote-mail/provider harness with the exact sequence above and a sanitized trace | Existing tests separately cover changed source, response loss/restart and receipt parsing. The combined customer scenario remains unproved. |
| 5 Guided hosted pilot | Existing invitation mechanism, isolated tenant/records, quotas, setup docs, support owner and rollback/containment drill | No account provisioned, invitation sent or live provider connected by this increment. Need approved identity and exact provider contract first. |

Freeze and locally verify the selected functional candidate, then run full quality once in CI. Do not deploy experimental pieces individually. Production release uses existing deploy.sh only after exact candidate CI/release gates and hosted acceptance prerequisites; no new cloud infrastructure by default. Passing a client test does not complete these milestones.

## Evidence and support matrix

| Surface | What exists | What remains unproved |
| --- | --- | --- |
| Scoped tool client/checkpoint | Propose/read supported prepared CRM/email contracts, exact reference pinning, no approve/execute methods | Published standalone package, arbitrary business requests, customer runner durability and mandatory enforcement |
| Hosted FetchSandbox binding | Correlated simulated Resend acceptance + independent exact message readback; original15sresponse-loss trace records one write after reconciliation | Real mailbox delivery, generic Gmail/Outlook/SMTP compatibility, current customer scenario |
| Native quote/mail reference | Source-version refusal, exact native fence, pending resolution and retained verification receipts in existing integration tests | Customer provider conditional-write semantics and hosted deployment parity |
| External approval bridge | Signed scoped list/decide, exact revision and independent reviewer checks | Customer OAuth/workload mapping, non-AWS hosting, its native durable adapter and bypass denial |

Use docs/evidence/hosted-connector-proof.json and its original fingerprints as dated bounded evidence, not a fresh run. Keep those receipts separate from native quote/CI and future customer results. Export request/approval/dispatch/transport/provider-readback phases with exact source/contract versions, timestamps and one-effect count; redact customer content and credentials. Never hand a buyer invented JSON as an observed execution trace.

Provider semantics constrain recovery. [Resend documents24-hour idempotency retention](https://resend.com/docs/dashboard/emails/idempotency-keys); a stable UUID alone is not an unlimited exactly-once guarantee. Establish actual lookup/retention for the selected sender; if the provider cannot resolve acceptance ambiguity, hold/manual resolution is the reliable outcome. Do not infer that every SMTP/Gmail/Outlook path can support the same contract.
