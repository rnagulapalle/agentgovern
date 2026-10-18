# Control workspace UX increment

This increment uses the approved charcoal/white administrator direction, bundled Geist,
existing LoopLabs mark, Lucide icons, shared buttons and the accessible Modal
component. It does not add provider integrations or execution authority.

## Navigation and context

The installed control profile exposes Overview, Agents, Activity, Approvals,
Connections and Policies. Existing routes remain available. Policies links to
output coverage, outcome review, sample workflows and saved decisions.

Overview prioritizes current shared approvals, connection coverage, company-assigned
teams and recent activity. It does not count historical held events as current
approval requests. Unavailable approval reads remain unknown. Sample-system queues
remain explicitly separate; they are not mixed with native AWS executions.

Agents separates AWS deployments from sample identities. Only the latest observed
version of a deployment appears in the fleet; older versions remain in discovery.
The original account/resource/version references remain authoritative. Name and
owner/source editing uses the existing reviewed onboarding contract; a separate business-details editor saves purpose, team and environment without
changing the provider identity, execution owner or tool permissions. Sample-agent
references are generated automatically and cannot be edited in the form.

Activity reads the existing enrolled telemetry contract, retains search/agent/
channel/outcome/time filters, and opens a selected execution in a drawer without
navigation. A matching approval view uses the existing bridge and filters its
returned requests by execution. Server permission, revision, expiry, self-review
configuration and replay checks are unchanged. A decision triggers a new history
read; approval is never labeled as completed execution. Connection and sample
action reviews also open existing components in panels. Original action deep links
remain usable, and action panels filter the loaded evidence to the selected ID.

The shared modal supports stacked reviews: Escape/Tab apply only to the top
dialog, body scroll stays locked until the last dialog closes, and focus returns
to the prior control. Closing an execution leaves the list filters unchanged.

## Limits and evidence

Only existing AWS discovery and telemetry are used. Other provider concepts from
design research are not rendered as connected production agents. Missing purpose,
tool catalog, amount and original request text remain explicitly unknown.
Observed tool usage is not an effective permission or an enforcement claim.

Reads are on demand, bounded to ten accounts and five latest deployments per
account. Overview and Approvals additionally read current decisions and load at
most three deployments per account, leaving room within the existing 12-request
per-minute observation budget for contextual reviews. Repeated refreshes can
still be throttled; failures remain explicit. Truncation, partial
reads, unsupported records, duplicate deliveries and failed sources remain
visible. This is not a complete cross-provider inventory or live subscription.

Mounted API-fixture tests cover context/focus return, version grouping, source
failures, omitted amounts, exact execution approval isolation, nested panels and
mobile fit. Those tests do not establish live AWS or Slack execution acceptance.
Production deployment and native-agent verification require separate receipts.


## Company administrator adoption

The installed control profile shares one company directory between its current
invited human members. ACME is the requested company name; Raj and Pratibha keep
their individual sign-ins and equal existing operator authority. “Company
administrator” describes that installed scope, not a new cross-company role or
an approval-independence bypass. No credential or membership change is included.

Overview, Agents, Activity, Approvals & outcomes and Policies share department,
team and environment filters. Organization manages company name, departments,
business units and teams. Agent details assign purpose, team and environment.
These are company-supplied business metadata, never inferred from AWS accounts,
log groups or deployment names. Missing assignments stay explicit. Filters are
view controls, not access-control boundaries. They persist during navigation in
the shared layout, not across sign-out or browser refresh.

Connections keeps platform setup and saved discovery together. Import is not a
separate navigation item. Policies presents rules only when reported in enrolled
workflow telemetry; editing/enforcing organization-wide policy is not introduced.
All installed routes share Geist, outline icons, stone borders and charcoal
primary buttons with white labels. Contextual actions retain the existing modal
and approval bridge contracts.

### Optional metadata installation

Migration 29 adds nullable `ll_orgs.company_profile`; it does not alter released
migrations. Fresh installation and the reviewed migration inventory include it. Existing deployments continue to
render without it, explicitly refusing metadata saves until installed. The
separate owner command is:

```
node --import tsx scripts/company-directory-setup.ts
```

It requires `LOOPLABS_MIGRATION_DATABASE_URL` (separate table owner),
`LOOPLABS_MIGRATION_RUNTIME_ROLE` (the exact already-bound web role),
`LOOPLABS_MIGRATION_WORKSPACE` and `LOOPLABS_COMPANY_NAME=ACME`. No credentials
belong in source or receipts. It records migration 29, grants only update of the
new metadata column to that web role, and seeds the company only if metadata is
absent. Repeated setup preserves existing metadata. Worker roles and roles bound
to another company are refused. The existing staging base digest check remains unchanged; canonical installed
fixtures include migration 29. A native production restore has not been run for
this revision. Local fixture acceptance alone does not establish that result.

Metadata API mutations use existing member/session/recovery validation and the
workspace transaction lock, require same-origin requests and reject stale
revisions, unknown fields and assignments outside the company’s saved inventory.
The genuine installed-tenant fixture tests both named members, concurrent edits,
company isolation and unchanged policy/action/effect records. Mounted UI fixtures
cover two company-assigned teams, page filters, agent purpose saves, organization
saves, unknown approval coverage, desktop/mobile layout and active-nav contrast.
Fixture previews are illustrative; they do not establish native AWS acceptance or
production installation. Current receipts are under `.local/acme-admin/`.


## Connections discovery consolidation (October 17 candidate)

In the installed company profile, Connections owns platform/account setup, saved
inventory and agent onboarding review. The legacy Discovery URL redirects to
Connections, retaining validated account/runtime/version and history-gap context.
Other installation profiles retain their separately tested three-provider discovery
workspace; this change does not enable those providers in the company deployment.

One row represents a runtime, with exact saved-version enrollment checked separately.
An older enrolled version remains available as Open agent; a newer deployment is a
separate Review update action. Opening an agent preserves its exact version and
rereads its enrollment. Missing or foreign references never select another agent.
The history-gap filter reads enrolled history on demand and retains failed reads as
unknown coverage. Default Connections visits read no history or approval queues.
Bounded/failed inventory remains explicit. Refresh saved status does not scan AWS.

Onboarding uses the existing source/owner contract in a drawer. Its setup mode does
not mount approval controls or an execution timeline and returns to saved setup
readback after onboarding. Activity and approval decisions remain in Agent details.
No changes to cloud permissions, approval authority or mandatory enforcement are
introduced. Release and native-browser evidence must be recorded separately.
