# Control workspace UX increment

This increment uses the approved quiet green/neutral direction, bundled Geist,
existing LoopLabs mark, Lucide icons, shared buttons and the accessible Modal
component. It does not add provider integrations or execution authority.

## Navigation and context

The installed control profile exposes Overview, Agents, Activity, Approvals,
Connections and Policies. Existing routes remain available. Policies links to
output coverage, outcome review, sample workflows and saved decisions.

Overview prioritizes connected AWS attention items, recent activity, separately
counted deployment/enrollment coverage and connection setup. Sample-system queues
remain explicitly separate; they are not mixed with native AWS executions.

Agents separates AWS deployments from sample identities. Only the latest observed
version of a deployment appears in the fleet; older versions remain in discovery.
The original account/resource/version references remain authoritative. Name and
owner/source editing uses the existing reviewed onboarding contract; no general
purpose-description editor or provider-tool editor is introduced. Sample-agent
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
account to respect the existing observation request budget. Truncation, partial
reads, unsupported records, duplicate deliveries and failed sources remain
visible. This is not a complete cross-provider inventory or live subscription.

Mounted API-fixture tests cover context/focus return, version grouping, source
failures, omitted amounts, exact execution approval isolation, nested panels and
mobile fit. Those tests do not establish live AWS or Slack execution acceptance.
Production deployment and native-agent verification require separate receipts.
