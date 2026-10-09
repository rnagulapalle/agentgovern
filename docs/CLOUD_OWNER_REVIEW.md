# Accountable cloud owner review candidate

This increment reuses named workspace membership, recovery fencing and the shared
per-workspace transaction lock. Optional migration18 adds append-only owner-review
history for the existing AWS, Azure and Google inventory snapshots. It does not
create agents, workload credentials, policy permissions or execution authority.
The invited inventory UI exposes a per-resource owner review. Production remains
unchanged until the normal release gates pass.

Each decision names one observed resource/version, its immutable scan ID, an active
invited owner and the reviewing member. The service derives the scan digest from
stored evidence; browser-supplied digests, secrets and permissions are refused.
The scan must be the latest connection snapshot, contain that exact resource and
be within the existing15-minute inventory freshness window. Google versions stay
unknown; they are never inferred from a display name or etag. Partial scans may
assign ownership only to resources actually observed, without implying complete
coverage or permission verification.

Reusing a review ID must preserve the decision and reviewing member. Concurrent
retries save once. Remapping creates a new decision; history cannot be edited.
Status reads require current membership/recovery validity. A newer scan, expired
evidence or inactive owner makes the review require renewal. Snapshot evidence is
never a live principal or policy check. A revocation concurrent with a review can
leave a historical decision, but subsequent status checks expose the inactive
owner; that historical row never authorizes execution.

The database independently checks tenant/member scope, exact observation and
scan digest, current-snapshot identity and freshness. The separately provisioned
runtime role needs SELECT/INSERT only on the new table and no member mutation
permission. Database-owner tampering and native cloud account trust are outside
this boundary. Current members can review ownership; this is not an independent
approval to perform a business action.

Apply only with the separate migration-owner connection through
`node --import tsx scripts/cloud-owner-review-setup.ts`. The CLI checks prerequisite
digests1,3,10,16,17, serializes installation and refuses migration18 drift.
It is not in normal bootstrap and must not be installed in production during this
candidate phase. Run full `pnpm quality` before commit.

The owner-review API lists only active invited members in the current workspace.
It validates exact observation references, same-origin mutations and stable review
IDs; missing migration refuses rather than implying review is available. The UI
loads review details on demand, preserves the same decision ID when retrying, and
discards responses for a replaced observation. It shows renewed review requirements
after owner revocation, without reporting verified workload identity or enforcement.

Next: prove the complete browser path, then link a reviewed observation to an explicitly scoped existing
agent enrollment and authenticated mandatory tool path. Workload attestation and
real cloud acceptance remain required; owner mapping alone cannot close them.
