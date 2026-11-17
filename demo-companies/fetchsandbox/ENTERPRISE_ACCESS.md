# FetchSandbox enterprise access acceptance

This is an internal synthetic reference company, with LoopLabs as its proposed
control-plane partner. It is not evidence of an independent customer or a live
enterprise rollout. No additional AWS deployment is needed for this configuration.

## Workforce and authority

The company directory now describes distinct jobs across 12 departments: leadership,
engineering, product/design, security, IT, sales, marketing, customer success,
support, finance, people operations and legal. The 240 directory records include
employees, contractors and interns, plus leave and departure scenarios. Status and
job title alone never grant authority. Regional/time-zone data is synthetic and is
not used to infer sensitive demographic characteristics or security clearance.

`access-design.json` assigns 48 access profiles, explicit access state and bounded
review/expiry intervals. All runtime-principal bindings are null. It is a desired
access design, not an authorization registry, executable policy or a login seed.
Do not import these profiles as administrator accounts or issue tokens from them.

The released named-human authorization gives invited members operator permissions.
The local optional migration-32 candidate now restricts named CRM/email operations
and enrolled records; broader employee-specific permissions are not established. Existing per-agent tool and record
grants cannot be presented as human employee RBAC. A CISO title cannot make policy
administration effective; that operation needs a real server permission binding.

## Concrete business boundaries

| Business actor | Intended scope | Required separate authority |
| --- | --- | --- |
| Support specialist | Assigned support tickets; request cancellation | Finance-scoped Stripe step with exact independent finance review |
| Finance billing specialist | Assigned billing records | Independent reviewer, original payment, amount/currency limit; no payroll scope implied |
| Sales representative | Assigned customer/deal records | No payroll or identity administration; quote exception needs designated review |
| People operations specialist | Assigned personnel request | IT-owned identity step; HR cannot gain direct Okta administration from the workflow |
| Engineering staff | Assigned repositories and issue records | Release/change step needs its own scoped capability and independent review |
| Marketing contributor | Assigned campaign assets and redacted customer context | Publication requires exact content, destination and approval; no private engineering source |
| Security reviewer | Assigned compliance evidence and audit views | Policy configuration separate from business mutation or payment execution |
| Executive | Sanitized aggregate business reporting | Seniority does not imply provider execution or blanket data access |
| Contractor/intern | Explicit limited tool/record scope and expiry | No approval, grant administration or standing workflow execution ceiling |

Every step of all 32 workflow definitions names a requester role, executing owner,
operation intent, desired capability ceiling and independent reviewer when mutation
is intended. Owning a business request does not make that person the executing
provider principal. A cross-department step is a handoff to another explicitly
scoped principal, never an implicit widening of the original agent's permissions.

## Binding and execution acceptance

A desired capability ceiling is not a grant. Actual authority must come from the
existing server-owned agent/record/connector authority and the native execution
owner. Bind exact tenant, authenticated human and agent identity, current owner,
provider destination, operation, resource IDs, allowed fields, environment,
recipient, amount/currency, policy/grant version and expiry. Missing required
bindings deny. Approval cannot grant an otherwise unauthorized operation.

Recheck at request, exact approval, dispatch, retry and effect verification. Reject
foreign records, stale/revoked grants, self-approval, expired contractors, leave,
departure, changed team membership and delegation beyond the executing owner's
capability. Reactivation does not restore old approvals or plans. An effect possibly
sent before revocation remains uncertain and must be reconciled without resending.

Existing reusable implementation: `lib/durable/service.ts`,
`lib/connectors/service.ts`, `lib/connectors/scopes.ts`,
`lib/workspace/membership-authority.ts`, the current workflow/Temporal owners and
signed native approval/history bridge. Do not add a second policy evaluator,
execution dispatcher, grant service or workflow fleet. For observed native
workflows, a dashboard flag is not mandatory enforcement.

Start acceptance with the existing bounded CRM-to-message contract: wrong record,
wrong recipient, missing agent tool, distinct requester/reviewer, revocation before
send, revocation during provider await, retry and provider readback. Then evaluate
native quote and cancellation/refund contracts using their existing execution
owners; historical demo self-review does not pass independent employee approval.
No new effect is authorized just to populate a FetchSandbox history page.

## Evidence and remaining gaps

November 1 local checks:

- 46 tests across access-design, directory validation and server-render suites
  passed. These validate configuration consistency and disclosure, not runtime
  authorization of the 48 profiles.
- 55 tests across existing record-scope, membership-authority and company-profile
  PostgreSQL suites passed. Their bounded existing service contracts do not prove
  all 24 provider types or the new human access roles.
- No AWS resources, provider bindings, human accounts or production permissions
  were created. Not committed or deployed. Both real invited accounts and native
  workflow enforcement remain unverified for this configuration.
- The previous full quality attempt was interrupted with failures. That receipt
  remains a non-pass; these focused results do not clear it.

Required before enterprise acceptance: release/evaluate the bounded member binding
described in docs/FETCHSANDBOX_COMPANY_ONBOARDING.md; bind the selected existing
agents and provider contracts; run positive and negative same-contract proofs; then full
quality, CI, deployment and both-account browser acceptance. Keep historical Acme
receipts separate and unchanged, and finish the outstanding visible-name cutover.
