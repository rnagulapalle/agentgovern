# FetchSandbox company configuration

`company.json` is a versioned synthetic business directory for the existing
LoopLabs company-profile JSONB column. It is not an infrastructure installation,
an AWS deployment inventory, or an execution seed.

It describes 240 employees, 12 departments, 24 teams, 24 simulated tool definitions,
12 infrastructure definitions and 32 business workflow definitions. The employees
are directory records, not login accounts. Every tool is simulated/unbound and
every workflow is declared with a null execution binding. Infrastructure rows are
business context, not provisioned resources. LoopLabs is the control-plane partner.

## Cost and reuse boundary

Reuse the existing AWS account, deployments, database, authentication, catalog,
approval bridge and execution owners. This change contains no AWS provisioning
command, new runtime, scheduler, database instance or provider credential. Do not
install a second demo fleet or run any workflow solely to populate its history.
No cost estimate or assertion about the existing account's total bill is made.

Use the existing company API, revision check and member authority when applying
this directory after the release gates pass. Retain the current catalog and
agent assignments through an explicitly reviewed mapping to these teams. Do not
post this fixture over the active directory unchanged: its empty assignments and
absent catalog are intentional, and blindly replacing the profile would discard
business mappings. Do not change the original runtime ARN, deployment version,
run identity, provider references or historical evidence to match display names.

## Cutover acceptance — still outstanding

Raj and Pratibha must see FetchSandbox throughout their signed-in workspace:
company navigation, overview, directory, workflows, agent details, connections,
policies, approvals, activity, history, exports and prepared examples. Company
metadata alone does not meet this requirement. Existing AWS names and historical
payloads may still contain the previous company name. Preserve original receipts
outside the new presentation; do not fabricate new-company execution by relabeling
old effects. The exact presentation mapping and archive behavior need implementation
and both-account browser acceptance before the cutover is called done.

No new AWS deployments are permitted as a shortcut to this acceptance check.
Reusing an existing workflow does not authorize rerunning its effects.

## Measured checks

- Contract tests validate references, uniqueness, manager cycles, independent
  named reviewers, size bounds, synthetic email addresses and metadata-only state.
- The existing PostgreSQL company API suite writes and reads the reference
  directory using two named test members and checks stale writes, foreign tenant
  isolation, unchanged native inventory/catalog and no new action/effect/token rows.
- Server-render tests check directory visibility and explicit unbound state.

These tests are not production installation, native-provider acceptance or a
completed browser cutover for Raj and Pratibha. Source and receipt information is
recorded separately in the private review directory; credentials never belong here.

## Enterprise access refinement

See `ENTERPRISE_ACCESS.md` and `access-design.json`. The workforce now has varied
job functions and lifecycle cases. The separate access design explicitly declares
role and workflow-step boundaries, but remains non-executable and unbound. It does
not change PostgreSQL authorization, grant a provider permission or create a second
policy engine. Configuration validation and runtime enforcement are separate gates.

The runtime-binding candidate, safe opt-in order and current limits are recorded in
`docs/FETCHSANDBOX_COMPANY_ONBOARDING.md`. Broad native workflow enforcement and
the live company cutover remain separate acceptance checks.
