# Multi-agent and parallel-workflow expansion

Date: October 14, 2026. Status: future design only; no implementation, deployment, or acceptance claim. Explicitly deferred while the single AWS connector and pricing workflow are proved. Active execution plan: AWS_CONNECTOR_MICRO_MILESTONES.md.

## Intended scope

Support one agent making multiple calls, multiple agents sharing a run, sequential dependencies, independent parallel branches, explicit joins and bounded delegation. The external runtime must expose supported tool boundaries and continuation/correlation hooks. Opaque internal dependencies remain unknown; telemetry alone does not enforce actions.

## Required contracts

- Authenticate each acting principal separately. Link workspace/run/branch/step/parent/action/attempt references for causality; correlation IDs grant no authority.
- Model joins explicitly: all required verified outcomes, selected branches, or a reviewed quorum. Do not infer business dependencies from arrival order.
- Gate each sensitive action independently, with current delegated scope, exact approvals, policy/source versions and tool revision. A parent cannot delegate authority it does not possess.
- Reserve shared budgets atomically across concurrent branches. Bound concurrency, outstanding approvals, loop iterations, delegation depth and deadlines.
- Use expected-version writes for shared records and stable idempotency identities for logical actions; retries are new attempts of the same action, not new effects.
- Persist branch state and external continuation information. Reconcile unknown writes before replay; deliver continuation idempotently without assuming arbitrary runtime memory survives.
- Define cancellation and containment scope. Stop future dispatch while tracking in-flight effects; compensation is a separately authorized operation, not an assumed rollback.
- Separate internal/branch outputs from approved external release. Validate content/schema and authorization at each configured release boundary.

## Later micro milestones

| ID | Expansion | Required proof |
| --- | --- | --- |
| F1 | Parallel read-only branches + explicit join | Reordered/duplicated results, missing branch and timeout cannot start dependent writes prematurely |
| F2 | Conflicting writers | Concurrent actions against one source version cannot silently overwrite; stale work requires fresh evaluation |
| F3 | Shared budgets and concurrency | Simultaneous branches cannot each spend the same available allowance |
| F4 | Delegated child agent | Forged parent, widened capability, expired delegation and cross-workspace access denied |
| F5 | Branch approvals/restart | Holding one branch preserves dependent waits and explicitly permitted independent progress across restarts |
| F6 | Containment and output release | No new dispatch after stop; unknown in-flight effects retained; dependent output withheld until its requirements pass |
| F7 | External framework adapter | Native framework acceptance demonstrates durable pause/resume, not merely a locally simulated graph |

Each expansion ships separately behind its own supported-contract declaration and pilot checks. Neither using Temporal nor passing one sequential example establishes these guarantees.

Primary references: [Temporal parent/child workflow semantics](https://docs.temporal.io/child-workflows), [AWS Step Functions parallel branches](https://docs.aws.amazon.com/step-functions/latest/dg/state-parallel.html). These inform design only and are not LoopLabs proof receipts.
