# Agent-pattern demonstration execution plan

Status: planned; no implementation or deployment authorized by this document alone beyond the user's existing scoped requests. Created October20,2026 from Raj's architecture/taxonomy discussion. Canonical repository path: docs/AGENT_PATTERN_DEMO_EXECUTION_PLAN.md. Update this file as evidence changes; do not create a parallel roadmap or demo pipeline.

## Objective

Demonstrate how one business workflow can contain model-driven agents, declared roles, skills, deterministic code, tools, human approvals and deployments. Let a CIO understand purpose/ownership/outcome and let an engineer inspect actual actor and action evidence. Reuse LoopLabs' existing catalog, source reader, Activity timeline, approval correlation and UI. Do not implement a new orchestrator or treat telemetry as execution authority.

## Decisions preserved from the discussion

- Agent purpose, coordination pattern, framework/harness, capabilities and hosting are separate dimensions. A support agent can use a supervisor pattern with a Deep Agents harness in a managed runtime.
- LangChain supplies an agent construction layer; LangGraph supplies explicit state/control-flow primitives; Deep Agents is a more assembled harness; Managed Deep Agents adds operated runtime services. Confirm actual installed versions when building, because current docs may evolve.
- A node, role, tool, skill, model, deployment and agent are different entities. Four declared roles do not establish four independent agents, models or services.
- Supervisor is a coordinating role; subagents receive delegated tasks. Handoffs can switch distinct agents or one agent's configuration. Skills load specialized instructions without necessarily creating another agent.
- Deep does not establish intelligence, judgment, authority or safety; shallow is not a formal opposite in the cited current guides. Do not use shallow/deep as inventory quality tiers.
- Managed describes operating responsibility, not automatic human supervision. A managed badge requires verified hosting evidence, not a dropdown label.
- An action proposed, a policy result reported, an authorized approval, an execution attempted and an independently verified provider effect are separate facts.
- Record only sanitized identifiers/configuration references, not hidden reasoning, raw prompts/customer messages, credential values or arbitrary source payloads. Prompt/skill hashes identify versions; they do not establish safety.

## Inspected baseline and existing proof

Source baseline inspected: released f8edceeb1af53698e10b2140c5a9aa73a00c29ea, October20. Recheck HEAD, live activation, worktree ownership and pending changes before implementation. Primary checkout is stale/dirty and must not be reset or deployed.

1. Cancellation/refund native rehearsal: private /private/tmp/looplabs-agent-attribution-20261020/final-receipt.json. One Slack-triggered cancellation, original-payment continuation, independently read-back500minor USD Stripe TEST refund; no real money. Cancellation17displaysteps/23uniquesourceevents,4reportedlogicalroles/13genericfallbacksteps; same sequence before/after attribution change. This does not prove four independent model agents, allbranches, concurrency, SoD or general framework integration. Raw logs/messages/IDs remain private.
2. Current attribution uses lib/workspace/workflow-telemetry-view.ts and existing AWS execution browser. Missing/conflicting actor metadata stays generic. Legacy quote history retains fallback; no actor inferred from adjacent events.
3. lib/workspace/workflow-telemetry.ts projects a bounded business-events1.0 contract into minimized source-reported events. It explicitly sets effectVerified:false, approvalIdentityVerified:false and enforcement:not-established. Do not flip these flags because another system separately has a receipt.
4. lib/workspace/workflow-catalog.ts imports version-bound company declarations through the current company profile. It separates workflow/operator runtimes and declared roles. Company labels are not authority grants.
5. components/control-plane/coding-agents-workspace.tsx and lib/coding-agents/demo.ts are illustrative browser-session controls. No coding client/model provider is connected; reload resets changes. Existing model names do not establish routed model use or actual token spend.
6. docs/CONTROL_PLANE.md describes exact approval-reference/version/run correlation and missing historical approval records. Keep unknown reviewer evidence unknown; do not substitute owner or eligible reviewer.
7. Blog research saved in docs/research/2026-10-20-langchain-agent-taxonomy-editorial.md in candidate15fa9f1. Publication remains blocked on GitHub sign-in; not a deployed article. Its sanitized summary is not raw audit evidence.

## Architecture reuse map

| Concern | Existing location | Allowed extension | Must not introduce |
|---|---|---|---|
| Company/workflow catalog | company-profile-contract.ts; workflow-catalog.ts; workflow-catalog-view.tsx | Add reviewed optional descriptive declarations only if current contract lacks them | Second agent registry, hardcoded parallel inventory, new permission source |
| AWS history | workflow-telemetry.ts; current reviewed history enrollment/read path | Add an explicitly versioned producer mapping only when native evidence needs it | Second CloudWatch poller, universal arbitrary-JSON importer, event-name-based authority |
| Timeline | workflow-telemetry-view.ts; aws-execution-browser.tsx | Add compact actor/delegation/skill context using the same execution grouping | New demo-only Activity app, invented events, hidden changes to historical sequence |
| Approvals | Existing exact run/version/approval reference and signed bridge | Correlate actual record and show gaps | New approval queue, alternate approver identity, auto-grants, replaying completed decisions |
| Coding controls | Existing coding-agents workspace/demo module | Retain simulation disclosure; add links to separately accepted native evidence later | Silent conversion of sample budgets into live gateway, separate policy service |
| External framework execution | Existing workflow repository/native runtime | Instrument selected framework's real run into reviewed shared observation contract | LoopLabs implementing a second orchestrator or running the same job in two executors |
| Release/proof | Existing focused tests, installed-source proof, CI and deploy.sh | Add meaningful cases and current-source receipts under existing process | Bypass/skip gates, stale evidence relabeled as current, alternate deploy script |

These are inspected paths and intended reuse boundaries, not a finalized schema design. Inspect their callers/nearest AGENTS and runtime installation contracts before edits. Do not repurpose lib/control-plane/model.ts browser-local simulation as the native execution authority.

## Demonstration portfolio and order

| Order | Demonstration | Existing starting point | Actual new behavior needed | Acceptance boundary |
|---|---|---|---|---|
| 1 | Cancellation/refund: actors, rules and approval | Recorded native case and current timeline | Evidence audit/compact presentation only where a demonstrated gap exists | Same-request screen correlation; declared roles vs actor evidence; reviewed rule and person; TEST refund readback |
| 2 | Support escalation: supervisor/delegation/handoff | Deployed support-escalation workflow from existing inventory | First inspect producer/source. Instrument real existing coordination; add bounded implementation only if absent | Actual parent-child invocation or configuration handoff; failure path; no authority expansion |
| 3 | Engineering change: Deep Agent | Current illustrative coding-controls page plus a dedicated test repository | Real bounded Deep Agents invocation with files, one skill, delegated review and test command | Actual harness/version and observed events; restricted writes; no production deploy; approval/retry tests |
| 4, optional | Managed-hosting comparison | Same accepted engineering task | A separately configured Managed Deep Agents deployment, only if useful/access permitted | Native deployment/run correlation, same acceptance contract, no extra production effects |

Keep the recorded cancellation baseline unchanged while Raj records. Do not relabel it as LangChain/LangGraph/Deep Agents without verifying the actual producer implementation. Do not create a live workflow merely to populate every taxonomy badge. Multiple patterns can be demonstrated within one workflow.

## Phase0 — freeze evidence and inventory gaps (first execution item)

Read current release receipt, relevant source and native workflow code/configuration. Build one evidence table per selected workflow: purpose, owner, roles, actual model invocations, tools, approval boundary, framework/version, runtime/version, history enrollment, and evidence missing. Choose one exact safe test case and receipt location. No external action during this audit.

Deliverable: update this document's checklist with observed facts and links. Stop if the current code contradicts the planned architecture; adapt the plan rather than relabeling the code. Do not repeat the already-completed refund or send another email for presentation validation.

## Phase1 — optional taxonomy and provenance in current UI

Design one backward-compatible extension to the current catalog declaration contract. Candidate concepts: framework/harness name+version, coordination patterns (multiple), declared capabilities, hosting provider/service, declaration source and evidence reference. Each field can be unknown. Do not infer a pattern from workflow title or hosting from a model name.

Use three evidence labels where justified: Company declared; Observed in this run; Independently verified for this specific fact. Keep missing and conflicting explicit. A source-reported framework field alone remains reported, not independently verified.

Show concise business purpose/owner on existing workflow list/drawer. Put architecture details behind an expandable technical section. Preserve existing ownership/reviewer/on-call distinctions. Do not add a new left-nav page for taxonomy.

Acceptance: old catalog imports and histories still parse; unchanged role/runtime totals; missing/unknown/new values handled explicitly; no authority or enrollment created from metadata; existing tenant/version identity boundaries preserved. Purely presentational stage must not require a new data ingestion service.

## Phase2 — producer evidence contract, only where missing

Before adding fields, inspect actual native producer events and map existing trace/span/action identifiers. The current minimized1.0 projection lacks explicit parent-agent/delegation/skill events; do not invent them from action names. Specify one versioned additive contract or versioned adapter through the existing reader. Keep old source semantics intact.

Candidate observations, only where producers can supply them safely: stable agent definition/version reference, per-invocation actor ID, parent invocation, delegated task relationship, active-actor/configuration transition, loaded skill/version reference and model/tool usage. No raw prompts, chain-of-thought, secrets, PII or arbitrary extension passthrough. Tokens/cost require reported provenance; estimate/actual/unknown remain distinct.

Bind each observation to existing tenant/connection/runtime/version/run/action/attempt/trace context. Reject malformed/oversized/conflicting metadata, cross-tenant or cross-version joins; retain visible gap rather than losing legacy valid events silently. Establish parent-child validation and bounded cycle/depth behavior before visual nesting.

If schema/storage changes are truly necessary, review current migration inventory and deployed grants first. Do NOT reserve migration32: the separate booking receiver candidate already proposes it. Add only a properly assigned migration through existing installer/inventory/least-privilege/restore gates; never edit released migrations.

Acceptance: legacy events/cases unchanged; unsupported schema reported as coverage gap; duplicates deduped; conflicting identities remain untrusted; retries/parallel children not collapsed by friendly name; no event changes execution permissions.

## Phase3 — support coordination proof

Inspect actual support-escalation code before choosing supervisor, router or handoff claim. For a real delegation, observe coordinator invocation, specialist invocation and result return; for a handoff, observe active configuration/agent transition. Use an isolated seeded case and permitted internal destinations. Specialist/tool access cannot exceed configured scope through delegation.

Tests: happy path, unavailable specialist, unknown route, rejected approval, replay, interruption/resume and unrelated child isolation. Prove external effect separately if one is necessary; otherwise use read-only or draft output. Do not force writes merely to make the demo look complex.

## Phase4 — bounded native engineering demonstration

Choose one small change in an owned disposable test repository, such as correcting a validation bug and its failing test. One approved working directory/branch, one skill version, explicit command/tool allowlist and bounded iteration/resource limits. No access to production credentials or deployment. Reuse existing native execution tooling and the shared observation contract.

Record actual configured harness/model identifiers, plan summary (not hidden reasoning), skill load, delegated review if used, file diff, test command/result and final patch. Pause before applying a consequential change when the chosen native design requires review; the coding sample UI does not itself establish that runtime pause or approval enforcement.

Tests: allowed task, unauthorized path/tool attempt, rejected review, changed proposal invalidating review, repeated invocation not duplicating effects, failed test remaining failed, cancellation/resource limit stopping the appropriate run. Missing usage remains unknown; sample budgets are not actual enforced reservations. Native coding-client/model gateway integration remains separate and must not be implied.

## Phase5 — optional managed comparison

Only after the native coding demo passes: assess whether hosted managed execution adds useful evidence. Use the same task and acceptance cases. A vendor runtime is a different execution target, not a second production executor for the same case. Do not dual-submit one action or run both pipelines on the same effects.

New account access, paid deployment, changed legal terms or broadened security permissions require their applicable explicit approval at action time. Observe deployment identity and correlate the native run through a reviewed adapter using the same timeline model. Unknown managed telemetry/approval support is a gap, not a successful integration.

## Shared acceptance matrix

| Area | Required observation | Failure check |
|---|---|---|
| Legacy compatibility | Existing quote/cancellation histories keep sequence/count and generic fallback | Missing or conflicting actor remains unknown |
| Framework/pattern attribution | Actual definition/version plus run relationship | Labels/config declarations alone cannot become verified |
| Tenant/version correlation | Actor/run/action/approval belong to exact enrolled scope | Cross-tenant, old-version and mismatched references rejected |
| Approval | Exact proposed action, authorized person, decision and resume | Changed/rejected/expired proposal cannot execute |
| Effect | Separate readback for the exact resource/action | Timeout stays uncertain until reconciled |
| Idempotency | Same intended action has no duplicate effect | Parallel/replayed events preserve correct grouping |
| Coding | Actual patch and meaningful command result | Failed tests stay failed; out-of-scope write blocked |
| Privacy | Bounded minimized metadata; no sensitive payloads | Malformed/oversized/secret-shaped input refused |
| UX | Desktop/mobile, keyboard focus/close, readable labels, useful empty/partial/error state | No horizontal overflow, invented actor or duplicated timeline |
| Release | Focused checks; full quality in CI per actual repo policy; clean exact main; deploy.sh | Gate failure stops release; no alternate deployment |

Fixture/setup, pure parser tests, installed application, native agent behavior and provider readback are separate receipts. Passing one is partial. Revalidate after final source edits; do not combine old receipts into current proof. Inspect exact repository policy before committing; no test is skipped to satisfy the plan.

## Recording sequence after acceptance

Cancellation: same request in Slack -> acknowledgment -> LoopLabs execution -> reported agent/rule details -> exact approval/reviewer if retained -> original-payment TEST refund readback/final message. Describe it as an already executed rehearsal. If a historical approval record is absent, show unavailable and omit unsupported reviewer narration.

Support: trigger or show explicitly recorded case -> coordinator/specialists/handoff -> relevant approval -> bounded result/evidence. Distinguish a live run from a saved walkthrough.

Coding: show illustrative controls disclosure if included -> actual dedicated task/run -> skill/delegation/diff/test evidence -> approval if implemented -> exact result. Never imply sample engineer budget toggles controlled the native invocation unless separately proved.

## Work packaging and ownership

Keep changes small and reviewable, in order:

1. Evidence audit and taxonomy design; no producer/runtime mutation.
2. Backward-compatible catalog/drawer presentation, only after inspected schema decision.
3. Shared producer projection and support proof, if actual gap warrants it.
4. Bounded engineering producer/demo acceptance using same reader/model.
5. Optional managed target, independently justified.

Use the existing repository/worktree and release workflow; preserve unrelated changes. Workflow producer changes belong in fetchsandbox/playground and require that repository's instructions/tests. LoopLabs changes belong in agentgovern. Record source revisions and receipts for both sides. Do not create another agent service, approval store, ingestion worker, analytics stream or navigation area for these demos.

Raj owns scope and recording; engineering owns implementation/native acceptance; product review checks CIO language and evidence labels. This allocation does not assign authority to specific existing agents or authorize messaging other tasks.

## Progress and unresolved decisions

- [x] Research/taxonomy and no-duplicate-architecture constraints captured.
- [x] Current source paths, existing simulated coding page and narrow cancellation receipt identified.
- [ ] Phase0: verify actual support and cancellation producer implementations/frameworks.
- [ ] Confirm which architecture fields already exist or need an optional reviewed catalog extension.
- [ ] Define smallest required shared metadata contract with native producer evidence.
- [ ] Implement/test first presentation change; do not disturb recording baseline.
- [ ] Prove actual support coordination and one bounded native coding task.
- [ ] Decide whether managed hosting warrants separate setup.
- [ ] Complete release gates and exact production/native acceptance for each shipped increment.

No new product changes deployed by this plan. Existing timeline release f8edcee is a baseline, not completion of these phases. Do not mark overall work complete from documentation, fixture proof, a vendor capability or a single successful demo.

## Primary research references

Reviewed October20; refresh before implementation/version-sensitive decisions:

- https://docs.langchain.com/oss/python/langchain/agents
- https://docs.langchain.com/oss/python/langgraph/graph-api
- https://docs.langchain.com/oss/python/langgraph/workflows-agents
- https://docs.langchain.com/oss/python/langchain/multi-agent
- https://docs.langchain.com/oss/python/langchain/multi-agent/subagents
- https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs
- https://docs.langchain.com/oss/python/langchain/multi-agent/skills
- https://docs.langchain.com/oss/python/deepagents/overview
- https://docs.langchain.com/langsmith/python/managed-deep-agents-overview
- https://docs.langchain.com/oss/python/langchain/human-in-the-loop
- https://docs.langchain.com/oss/python/langgraph/persistence

Related repository docs: CONTROL_PLANE.md, WORKSPACE_ACCESS.md, LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md. Check current versions rather than relying on older prototype descriptions as deployment evidence.
