# CRM/email membership history boundary

Migration 23 is an opt-in extension of the existing action and saved-enquiry
engine. It reuses migration 22's membership-generation ledger. Released migrations
are unchanged; no second lifecycle ledger or workflow engine is added.

Server-created snapshots bind a named requester, registered agent owner, saved
plan owner and independent approver to their current workspace membership
history. A committed deactivation or workspace move advances that history;
reactivation cannot restore an old snapshot. A saved plan is checked again at
submission and before a new or repeated Temporal scheduling intent; action
authority is checked at approval, dispatch and after a
provider call. Existing policy, request, source, record grants, leases and
recovery checks still apply.

Historical plans and actions remain readable with their original identifiers,
payloads and reservations. Missing snapshots on a migrated installation are not
new execution authority. Prepare fresh work; do not backfill authority or silently
change an approval. A dispatched effect may have happened even when authority
changes, so containment must preserve uncertainty and correlated readback without
resending or treating observation as renewed approval.

Apply through `pnpm workspace:membership-authority` using a separate
`LOOPLABS_MIGRATION_DATABASE_URL`. The setup verifies released prerequisite
migration digests, table ownership and migration 23's own digest under bounded
transaction/lock timeouts. Snapshot columns use existing action/plan privileges;
no history write grants or elevated functions are introduced. The runtime receives
column-only `UPDATE(email)` permission because PostgreSQL requires it for member
row locks. Released migration 22 refuses identity renames; lifecycle fields and
the generation ledger remain read-only to the runtime. Database-owner
bypass remains outside this boundary.

Nonmember fixture operator/agent tokens retain explicitly identified legacy
semantics. A named identity cannot fall through to a legacy token to bypass its
membership checks. General login-session, agent-token lifecycle, external
identity-provider revocation and customer-cloud federation are separate limits.
Deployments without migration 23 retain their earlier behavior and do not gain
this protection.

This increment is under implementation and adversarial verification. Dedicated
PostgreSQL migration tests are separate from complete runtime/browser/recovery
proof and release eligibility. It is not deployed, and it does not establish live
connector delivery, an availability SLA or completed enterprise acceptance.

## Current verification status

Dedicated PostgreSQL tests cover invisible membership cycles and both new and
repeated Temporal transfer intents. Transfer requires a genuine named session;
a same-subject legacy token cannot supply authority.

Four actual isolated runtime proofs currently match their covered source files:
fault/replay (8 checks), version/restart (9), dispatch/revocation (8), and real
PostgreSQL archive restore (7). These proofs install migration 23. They preserve
crash, lost-response, replay, duplicate-effect and recovery assertions while
checking named sessions and retained membership history. Restore readback observes
the original effects without reviving invalidated approval authority or resending.

The complete typed-browser proof also passed all 20 checks with a real bounded
Bedrock planner and 60 current source fingerprints. It verifies stale requester
and approver history refusal, independent approvals, lost responses, app/worker
restarts, duplicate effects, exhausted allowance and readable 390px layouts.
Temporary web-only model credential files were removed after the run.

The two-workspace restricted-role proof passed 12 checks, including all 64
cross-workspace HTTP refusals, 8 browser refusals and 15 database attacks. It
uses actual named sessions, packaged workers and per-workspace queues. Exactly
four intended effects were observed; one workspace continued while the other
worker was stopped. The shared SQL role can still read both workspaces: database
row-level tenant isolation is not established.

The packaged load proof passed 11 checks over 25 plans and 50 concurrent
transfer calls. Worker/scheduler crashes and a database outage recovered the
same histories with two authorized effects, preserving prior containment checks.

The independent-record proof passed 7 checks across ten enrolled customer
records and 20 duplicate transfer calls: nine completed runs, one contained
run, and 18 effects attached to the exact intended records and recipients.

The paced two-workspace proof passed 13 checks across six waves and 24 additional
workflows, with duplicate requests and approvals, lost responses and an isolated
worker crash. It observed 52 correctly targeted effects while preserving budget
reservations and action identifiers.

The controlled connector proof passed all 36 checks with genuine named sessions
for saved plans, independent approval, scoped recipient guards, revocation,
restart and actual archive restore. The hosted email proof passed eight checks,
including a real fifteen-second accepted-response loss and duplicate-send
prevention. Hosted CRM-to-email remains held because its atomic source-version
contract is unavailable; email acceptance is not evidence of inbox delivery.

The approved-record load proof passed seven checks across four measured waves:
40 records, 80 paired transfer calls, 39 completed runs, one contained run and
78 exact effects. Its observation window was 111,736ms; this small isolated
sample does not establish steady-state throughput or an availability SLA.

The shared-agent proof passed nine checks: nine completed workflows, one
contained workflow and 18 exact effects. Three final-slot contenders admitted
one and denied two; rejected contenders produced no effects, and execution and
replay did not refund the agents' lifetime reservations.

The authenticated container component passed 20 checks on the isolated Linux
runner. All 38 retained source fingerprints matched independently. Real mutual
TLS and namespace-scoped JWT refusal, signing-key rotation, worker/scheduler
replacement, Temporal persistence PostgreSQL SIGKILL and pre-effect backup
restore retained exactly two effects. This is component evidence from CI run
38095494999, not a passed full job or release acceptance.

The gateway component passed all 20 checks in run 38095679062. Its 54 source
fingerprints and all three compiled bundle hashes matched independently. The
agent could not bypass the control gateway to reach provider or database
addresses; held work survived restart, independent approval preceded effects,
and lost-response readback retained exactly two effects without resend. The
actual installed-membership assertion includes genuine named approval and
same-subject legacy-token refusal. This separate-container experiment does not
prove customer installation, same-pod sidecar isolation or cloud federation.
The complete job later failed its full regression gate against the earlier frozen
receipt snapshot; its component receipt is not release acceptance.

Fresh assembled runtime acceptance remains required.
A source fingerprint alone does not prove that a fixture enabled the migration. This increment is not release-qualified or deployed.

The first fresh assembled component, run 38096138102, passed its real typed
HTTPS journey: ten browser checks, eight runtime checks, four provider-twin
effects and restored containment of the same four effects. All 106 runtime
source fingerprints matched independently, and the retained browser-evidence
test passed locally. The full job failed: 1,153 tests passed and seven failed,
including two runtime-generation tests that exposed a stale 99-source requirement
in the preparation helper. That helper now requires 106 sources; all twelve
focused tests passed, including refusal of the old registry before eligibility
observation. The helper additionally requires all seven membership sources;
thirteen preparation tests and thirty-three related tests now pass, including
equal-length substitutions. The latest local full gate
passed 1,158 tests and failed four stale lifecycle-evidence tests. This is not a
passed full quality gate. A second independent
106-source build has completed its runtime component and terminal candidate
origin validation; the two origins retain eight distinct images and the same
reviewed worker build. Semantic upgrade/replay run 38098248911 is executing;
fresh semantic, drain and reset proofs remain required. Neither assembled
origin passed its frozen full gate, so neither grants release authority.


### Final October 10 local gate and fresh lifecycle intake

The preceding counts and running-job statements are historical. Semantic replay115, drain122, reset138 and candidate promotion/reversion116 source receipts have now been independently authenticated. Their actual runtime components and cleanup passed; each job retained its historical evidence-pin failure, so these are not successful release origins. Exact refreshed retained tests pass without relaxing execution or provenance assertions. Final current-source `pnpm quality` passed all1,162 tests across157 files, coverage, lint, types and production build. Release CI, successful accepted origins, persistent host operation and deployment remain outstanding.
