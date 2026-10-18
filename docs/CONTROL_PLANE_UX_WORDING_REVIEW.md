# Control-plane wording and taxonomy review

Date: October 14, 2026. Source baseline: `69eba9e`. Local changes only; no deployment receipt is established by this document.

The immediate scope is wording and taxonomy. The owner explicitly deferred workflow-control and identity/query changes. No approval eligibility, request handler, API, policy, execution, database or worker source was changed in this pass. The earlier local discount approval explanation is retained as a presentation change; it does not add business justification to saved requests.

## Language contract

| Term | Meaning in the product | Avoid confusing it with |
| --- | --- | --- |
| Agent | An identified worker with an accountable owner and specific allowed actions | A human approver, a workflow, or an unrestricted model |
| Connection | The configured path to a business system or agent platform | Permission to execute every action, or a health check |
| Action | One exact proposed operation on a system | The complete workflow |
| Workflow | A sequence of actions and dependencies | An action-type dropdown |
| Workflow run | One instance of that sequence | The workflow definition or an editable agent |
| Policy | Rules that allow, require approval, or block a request | A model's confidence or an inferred IAM discount limit |
| Approval | A named person's time-limited decision on an unchanged action | Execution, scheduling or completion |
| Execution | An attempt to apply an authorized action | Proof that the external outcome succeeded |
| Reconciliation | Checking whether an uncertain action took effect before another attempt | Blind retry or automatic rollback |
| Containment | Stopping new work in the selected scope | Recalling an email or undoing an accepted effect |
| Output controls | Checks before information is released | A claim that general filtering/redaction is installed |

Navigation uses **Workflow runs** and **Decision history**. Actions uses **Action type**. Agent setup uses **Agent type (assigned)**, **Allowed system**, and **Lifetime request allowance**. Cloud platforms are **Coming soon** in this deployment; they do not lead to a sales form disguised as an import control.

Use Review for a human decision, Execute for applying a change, Verify for outcome checks, Refresh for reloading saved state, and View/Open for navigation. Advanced references may retain technical names and identifiers. Do not invent a business name, historical limit, owner, or justification when the record does not supply it.

## Screen review

| Surface | Finding | Wording work | Remaining outside this pass |
| --- | --- | --- | --- |
| Shared navigation, header and footer | Short names and internal phrases made the product model unclear | Workflow runs, Decision history, generic workspace-controls description | Account-name link still returns to the public homepage; navigation redesign is deferred |
| Quick guide | Help centered on the discount demonstration | Generic agent → action → workflow → reconciliation explanation | No generic workflow builder is implied |
| Overview | Internal control language and sample/provider terminology | Plain execution/outcome explanations and navigation verbs | Queue is limited, not a complete backlog |
| Workflows | Quote and handoff capability descriptions used internal language | Keep examples clearly labeled; explain separate actions and simulated systems | Workflow layout and automatic orchestration experience are deferred |
| Approvals | Requests lacked a clear reason and the queue lacked decision context | Clear review/execution distinction; Review request link; local discount decision brief | Persisted business justification, requester/owner presentation and self-approval button eligibility remain unfinished |
| Agents | Role was presented as editable-looking type; allowance meaning was unclear | Assigned agent type, allowed system, lifetime request allowance, unknown owner wording | Server-generated IDs, descriptions and AWS import belong to the next workflow plan |
| Connections | Policy state could be confused with health; cloud CTA implied onboarding existed | Simulated systems, capabilities/availability, explicit health limits, Coming soon | Real cloud import/enforcement is not shipped here |
| Policies & access | Runtime role implementation detail distracted from actual boundaries | Explain shared administrator permissions and retain self-approval/hard-limit restrictions | No new permissions or policy fields |
| Output controls | A generic title could imply general enforcement | Explain installed sample checks and unavailable general protections | Broader output enforcement is not enabled |
| Reconciliation | Dispatch/effect jargon made next steps hard to follow | Check whether the action reached its system; containment does not undo a change | No recovery algorithm changes |
| Decision history | Raw transition names were hard to read | Approval requested, Execution started, Change recorded, Change confirmed | UUID grouping and a cross-workflow history design are deferred; exported evidence is unchanged |
| Pricing actions | Atomic action was called a workflow; lost-response label unclear | Action type, Recorded changes, simulated lost response, Cancelled/Blocked labels | Existing control eligibility is unchanged |
| Customer actions | A template was called approved before review | Message template, allowed change/message description, readable state label | No automatic message observer or Slack callback is added |
| Customer handoff | Setup and final-check wording was technical or premature | Plain dependency explanation, Submit for approval, Verify the full run, technical-request disclosure label | Requester/paused write buttons and early final-check eligibility remain unchanged by the owner's instruction |
| Quote Conversation / Plan / Activity | Composer used internal configuration terminology | Describe the quote change; administrator-configured quote/rules; proposal is not approval | No arbitrary chat workflow generation |
| Staged discovery, owner review, records, enquiry, refund and prepared browser-local screens | Separate deployment/profile boundaries must stay visible | Included in source-text inventory and scope review | Not accepted as production journeys; no newly enabled route or live integration |

## Evidence and limits

- Source inventory covers 44 control-plane component/route TSX files and 989 JSX text entries. It also records code literals; the inventory is not proof that every conditional UI state was exercised.
- Production browser review covered the 10 sidebar destinations, pricing actions, quote planning and Quick guide. Loading and loaded views were distinguished.
- One pricing journey was exercised through two cases: 5% permitted execution, and 10% interrupted acknowledgement followed by outcome verification. The browser displayed one recorded change for each action. This is browser-observed evidence, not a new independent database proof.
- A customer-handoff review run was created, its CRM action submitted for independent approval, and that new run paused. It did not complete. The messaging policy was contained and was not re-enabled. No customer email was sent.
- Latest focused presentation run: 95 tests in 10 files passed, including unknown/malformed data, partial queues, loading-versus-unavailable messages, independent quote decisions, and uncertain versus verified presentation.
- Repository lint, TypeScript and production build passed after generated private fixture bundles were moved outside application source. No lint rule was relaxed. The first lint failure is preserved locally.
- The earlier full-quality attempt failed: 7 files / 39 tests, including installed source-closure drift and native provider/SQL fixture deadlines/cleanup. Those failures are not passes and do not establish a release. No full workflow suite was repeated for the later wording-only changes, following the owner's scoped-check instruction.
- Source-boundary check: 329 tracked API/engine/runtime files match the base commit; 11 changed presentation components retain the checked event handlers, disabled conditions, form contracts and fetch calls. This is a limited source comparison, not a runtime regression or release proof.
- Local Chrome preview uses actual presentation components with synthetic read-only responses. It does not establish authenticated production or cloud acceptance.

Design references: [Fluent field labels and helper text](https://fluent2.microsoft.design/components/web/react/core/field/usage/), [Fluent handoff wording](https://fluent2.microsoft.design/handoffs), [Cloudscape components and status feedback](https://cloudscape.design/components/). These inform the language review, not a claim of equivalent product maturity.
