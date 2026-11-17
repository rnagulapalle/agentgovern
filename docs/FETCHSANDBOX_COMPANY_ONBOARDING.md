# FetchSandbox company onboarding

November 1, 2026. The existing shipped API saved FetchSandbox business metadata
at revision 6. Permission code, migration 32 and the 240-person reference extension
are local candidates and are not deployed or installed in production.

FetchSandbox is the internal reference company. LoopLabs is its control-plane
partner. The synthetic directory is not an independent customer endorsement.

## Reuse and ownership

Keep the installed workspace ID `local-proof`, existing AWS connections, runtime
ARNs, versions, enrolled owners, action IDs and receipts. A company display-name
change must not change a tenant, recovery epoch or execution owner. Never run an
observed AWS workflow again through the internal CRM engine to fill its history.
No second AWS fleet, database instance or dispatcher is needed.

The versioned business directory is `demo-companies/fetchsandbox/company.json`.
It includes 240 directory people across 12 departments and 24 teams. Its 32 business
workflow definitions are declared/unbound context, not 32 running workflows. The
48 access-design profiles are desired configuration, not automatically issued
permissions. Directory statuses do not synchronize HR or IdP lifecycle events.

`workflow-map.json` and `mapFetchSandboxCompany` produce a configuration preview
from actual saved inventory. Unknown versions, ambiguous runtime families,
reference mismatch or incomplete inventory refuse the preview. Actual resource
references, versions and execution owners are retained separately. Existing roles
are carried only for the matching version. The preparation v4 logical roles were
reviewed with the parallel Meta task; its earlier v1 mapping is superseded.

The current private preview maps 28 deployments and 24 saved agent assignments,
retaining 88 declared roles. No business display field in that preview contains
the old company name. This is not a browser assertion about every page or an
assertion that original runtime IDs/history no longer contain the old label.

## Metadata versus execution authority

Company name, job title, department, team and proposed business owner are metadata.
They cannot issue tokens, assign approval authority or grant provider access.

Optional migration 32 adds owner-controlled `connector_member_access` on the
existing company row. It is separate from `company_profile`. The first contract
supports explicit named members, a directory-person link, expiry and exact
read/propose/review/execute/reconcile permissions for an existing CRM/email agent
and active enrolled record/provider binding. It is not a general RBAC platform,
SSO, IdP integration, live-provider IAM or arbitrary workflow builder.

Existing company administrators are explicitly named. Restricted members cannot
fall through to ordinary operator administration. Their directory view is read-only
and does not label them company administrators. Real identity and worker scope are
checked before action lookup; provider context is inspected only when the member
policy requires it. Historical/unconfigured workspaces retain their existing
explicit operator behavior until owner opt-in.

The existing engine still requires current agent identity/tools, active record
scope/grant, exact immutable request, current policy, independent approval, expiry,
workflow dependencies and single dispatch ownership. Delegated work additionally
checks the named owner's and requester's current member permissions. At dispatch
and verification it rechecks the approver's permission. Policy updates advance
existing membership generations; restoring permissions cannot revive an old plan
or decision. Completion of a closure-owned in-flight claim can retain an uncertain
effect after executor revocation but cannot authorize success or resend.

## Safe installation order

Use the existing owner/release path, after full quality, CI and deployment gates.
Do not provision selected staff into a legacy all-operator company first.

1. Back up the exact original company/profile and binding receipts privately.
2. Install migration 32 with **only existing invited administrators and no member
   grants**. This establishes default denial for any additional named member.
3. Reuse existing invited-member provisioning to create only the selected approved
   personas. Keep passwords and any initial handoff in owned private files. The
   240 directory rows do not create 240 login accounts.
4. Register/select existing scoped agents through the current agent/record tools;
   enroll/grant only the exact private test record and destination. Registration
   and record enrollment are not action approval.
5. Apply the reviewed next member-policy version, with explicit allowed operations
   and expiry. `scripts/connector-member-access-setup.ts` requires explicit offline
   mode, an owned private policy file and the separate table-owner connection. It
   creates no accounts, agents, workflows, AWS resources or provider effects.
6. Save a freshly reviewed company preview through the existing versioned company
   API. Its fresh-scan and revision checks remain required. Do not blindly POST the
   directory fixture: it has empty assignments and no actual AWS catalog.
7. Verify Raj and Pratibha and the selected scoped identities separately. Complete
   the no-old-company-label browser check without rewriting source receipts.

No runtime API can write the member policy. Schema migrations 1–31 are unchanged.
A normal company-directory save cannot modify member authority. Revocation,
reactivation and recovery must continue to use current real membership, record
and policy versions; a synthetic job title or directory status is not that event.

## First proof and release status

The existing connector-proof runner was extended rather than replaced. It uses
its existing installed PostgreSQL fixture and private HubSpot/Resend HTTP twins,
with the shared port8018 lease. The FetchSandbox scenario uses five named test-account
sign-ins, the existing CRM-to-message graph, a separate reviewer and scoped executor.
It covers the original broad-operator gap, owner-only/idempotent configuration,
wrong tool/record/recipient/member operation, retained approval fencing, two effects,
readback, replay and revocation after a possible HTTP effect. Native LLM agents,
live email/CRM and all 48 access profiles are not thereby accepted.

The earlier proof attempt had an incorrect assertion about the verification
method's return shape. Its failure receipts remain private. Successful source-bound
successor receipts are separate; never substitute a focused/unit receipt for the
actual HTTP run. Full quality and exact source receipts remain mandatory before
commit/release. The metadata-only company cutover passed separate Raj and Pratibha API readbacks
at revision 6 (28 catalog entries, 24 assignments), with the exact preparation v4
enrollment unchanged. Persistent hosted role bindings and both actual-account
all-page browser checks remain outstanding. Original source IDs and historical
receipts are retained; no all-page absence of the old company name is claimed.

## Parallel Meta task and native follow-up

The Meta task owns preparation native source/control-adapter changes, runtime v4,
its scoped signing configuration and native test assets. It supplied a fresh
visible/API observation and released the LoopLabs browser. This task read the
saved enrollment independently through its own named API session, without browser
cookies/tokens or settings changes. It confirmed the actual tenant/connection,
version4, saved enrollment epoch/ID, invited owner and narrower business-v4 log group.
The scripted native bridge is not a real invited-user approval connection.

A native environment update can publish a new runtime version. Any later binding
must use the actual version and newly read saved enrollment; do not stamp v5 as v4
or invent an epoch. A recovery epoch is server-owned and must be re-read, not
assumed to change or remain the same. Peer source/history/signed-client receipts
remain separate from this task's CRM/member proof.

Quote v19 source was read from its existing live session, with unchanged reviewed
image; cancellation v5 runtime/endpoint and ECR image were read without business
effects. Their signed review controls and historical effects do not prove a binding
to the new CRM/email member policy. Authenticated initiating-human identity,
per-operation/resource authority and self-review need native same-contract
acceptance before an enterprise permission claim or producer change. Keep native
review read-only while the shared control adapter is owned by the parallel task.

## November 1 measured checkpoints

- Existing shipped company API: metadata-only save and separate Raj/Pratibha
  profile readbacks, revision 6; no workflow invocations or AWS resource creation.
  Sanitized receipt: `docs/evidence/fetchsandbox-company-metadata-20261101.json`.
- Member authority regression: 23 tests passed after reproducing both zero-step
  workflow metadata access and a legacy operator-token administrator impersonation
  in the opted-in contract. Zero-step inspection now requires administrator
  authority; opted-in operator authority requires a current named member session.
- Existing HTTP connector proof: 42 checks passed with 119 matching source
  fingerprints, actual private provider-twin effects and owned cleanup. Receipt:
  `docs/evidence/connector-proof-20261101-fetchsandbox-members.json`.
- Existing disposable discovery browser proof: 30 assertions, 202 source
  fingerprints, seven screenshots and three measured compiled artifacts. Verified
  PostgreSQL TLS, wrong-password/plaintext refusal and owned resource retirement
  are separate from hosted/native acceptance. Successor receipts are named
  `docs/evidence/discovery-installed-browser-v3-20261101-fetchsandbox-members-*`.
  October 22 receipts remain historical, unchanged and rejected as current proof.
- CI prerequisites retain the same pinned provider source and historical chat
  artifacts. Only the three actual newly measured discovery artifacts replace
  their prior bundle counterparts. The prior immutable object is retained; the
  existing reader gets only the new exact content-addressed object, following
  `docs/QUALITY_CI.md`, with no runtime access or wildcard permission.

Release status and the exact candidate commit/check receipt are recorded on
issue 142. No production permission installation may proceed before successful
full quality, CI, normal deployment gates and actual-account acceptance. Existing
SSH-source authorization remains unresolved; do not retry firewall changes or
production SSH as part of a metadata save.

### Remaining hosted label gap

A fresh read of the actual Raj Agents page after the metadata save showed
FetchSandbox in the company header and 27 matching business workflow rows with
88 declared roles. The open preparation drawer still displayed the original
onboarding name. This is a reproduced display gap, not a renamed runtime.
The candidate uses a version-matched catalog title in business drawer, activity,
approval and policy labels and the history fact. The original onboarding editor
and source history remain unchanged. All 47 control-center browser tests passed,
including matching business labels with zero onboarding/decision writes.
This fix is not deployed. Other actual-account pages and Pratibha's browser
remain unmeasured; the separate two-account API profile readbacks remain valid.

### Candidate quality result

The final local `pnpm quality` run passed: 384 files, 3,544 tests, 94.23% statement
coverage, staging database refusal/cleanup proof, both worker bundles, production
build, 45 rendered internal destinations and diff hygiene. The current HTTP and
discovery receipts retain 119 and 202 matching source fingerprints respectively.
This is candidate validation, not a production permission deployment or native
agent acceptance. Exact commit and remote CI state are recorded on issue 142/PR.

### November 2: employee API acceptance extension

The November 1 member proof called the services directly. A new installed-database
test reproduced an API-routing gap: an employee could read the action through
`ConnectorControl`, but the saved-provider lookup required company administration.
The extension resolves saved record authority before the existing operation check.
Restricted members receive filtered agent/run lists; registration, record enrollment,
grant changes and company administration retain their administrator checks.
Administrators retain the configured-workspace boundary; employee runs resolve
their own saved record and require permission for every displayed step.

The focused employee/quote regression suite passed 41 tests. The existing connector
HTTP harness passed 43 checks against the current source, including actual Next
handlers with named cookie sessions, an administrator-prepared enquiry plan,
separate requester/reviewer/executor/observer grants, two private CRM/message
effects, exact readback, replay, revocation and containment. The retained successor
is `docs/evidence/connector-proof-20261102-member-api.json`; earlier receipts remain
unchanged. Test identities and provider effects are disposable synthetic fixtures.

This does not install hosted employee accounts or permissions, enable the contained
email policy, establish live HubSpot/Resend parity, or close quote/cancellation,
native-agent or both-account UI acceptance. No additional AWS infrastructure is
created. Release and hosted installation remain separate gates on issue 142.

The November 2 local `pnpm quality` run passed: 384 files, 3,560 tests,
94.26% statement coverage, existing coverage thresholds, database refusal/cleanup,
worker bundles, production build and 45 rendered destinations. This candidate
is not deployed; GitHub CI and hosted employee acceptance remain separate.
