# Employee work experience: implementation and next decisions

October 5, 2026. This implements the first bounded interaction from the PRD, not its complete MVP.

## Current slice

The newer enquiry entry now replaces the prepared text composer at `/control-plane/work`. See [ENQUIRY_WORKFLOW.md](ENQUIRY_WORKFLOW.md) for saved plans, trusted contact checks and actual HTTP/provider-twin proof. The original prepared composer remains a component for its existing regression tests; it is not the default work page.

Invited members open `/control-plane/work` from Work with agents. A prepared request produces an explicit customer-handoff plan. Unsupported or extended requests are refused rather than silently mapped to a different job. This is deterministic request admission, not natural-language understanding or model execution. Request text is kept only in React memory; private workspace analytics exclusions still apply.

After reviewing the plan, the member chooses registered CRM and messaging identities and creates a saved workflow through the existing authenticated API. Reviewing the plan does not approve either action. The server still owns exact payloads and stable action IDs. Existing independent approvals, dispatch-time authority checks, dependency gates, outcome verification and pause controls remain authoritative. The original workflow-runs entry remains available.

The only effects are one sample contact lifecycle update and one fixed acknowledgement to the sample recipient through private FetchSandbox twins. No live CRM, real email or general workflow builder is connected. Enrolling agents restricts standalone work and is not reversible in this version. Paused runs cannot resume. A stopped later step does not imply earlier effects were undone.

## Path to the PRD experience

1. Confirm one pilot team, job, CRM and email provider. Keep enterprise and mid-size acceptance requirements separate. Validate one complete job before adding five starter agents.
2. Add a server-side conversational planner with a structured, validated output contract and bounded capabilities. Treat retrieved content and chat memory as untrusted context, never permission. Show exact recipients, changed fields and scope before accepting a plan. Unsupported and ambiguous requests must stop or ask.
3. Save immutable reviewed plan versions and bind dispatched actions to the plan, source evidence and current authority. Editing the plan invalidates its review; conversational confirmation cannot replace independent approval.
4. Add provider-specific delegated access, trusted credential storage, authoritative lookup and bypass prevention. Test real provider test accounts separately from twins. Chat ownership alone does not prevent agents bypassing controls.
5. Add durable schedules or event intake for the selected job, cancellation on changed customer state, limits and resolution owners. Prove duplicates, timeouts, concurrent changes, expired approvals, permission loss and worker restarts.
6. Add member access boundaries, owner-only visibility, administrator controls and tested organisation isolation before customer self-service. Existing invited founders have operator authority; a new employee role is not introduced by this UI.
7. Add structured policy authoring with preview/counterexamples and authorised versioned activation. Successful runs do not independently grant new autonomy. Security pack, SSO, member lifecycle, monitoring and operational recovery objectives require explicit pilot acceptance.

## Verification

Request admission tests reject malformed input, extra actions, approval bypass requests and oversized text. Outcome explanations distinguish undispatched, in-flight, uncertain and partially completed work. Presentation tests keep creation hidden before review and preserve the existing entry. Existing PostgreSQL and connector failure-path suites remain required by `pnpm quality`.
