# Enterprise design-partner evaluation: measured status

October 10, 2026. The objective remains incomplete. Isolated proof is not a
persistent deployment, a live-provider guarantee, an availability SLA or evidence
that LoopLabs exceeds Temporal.

LoopLabs supplies workflow authority, exact approvals, action containment and
effect verification. The opt-in durable scheduler uses self-hosted OSS Temporal
behind the orchestration interface. A model prepares a bounded proposal; neither
chat, plan review nor orchestration scheduling grants execution authority.

## Latest verified application checkpoint

Commit `0a75fa5caf7c1ecdf509e6c3ca553d700fec217e` is pushed on
`codex/looplabs-worker-version-lifecycle` and under draft PR 82. The final-source
Mac `pnpm quality` and the normal pre-push hook each passed all ten gates:
1,129 tests across 154 files,
actual Docker artifact extraction, isolated database bootstrap, worker builds,
production build and 52 rendered internal destinations. No timeout, threshold
or security assertion was weakened. A test-only FIFO fixture now uses actual
asynchronous creation with the unchanged deadline and an explicit file-type check.

Before that final test-only change, independently frozen Linux run `38085781171`
passed the unchanged full quality gate against all 804 reviewed files. These
measurements supersede the failed intermediate gate attempts recorded below;
they do not erase those failures or establish production acceptance. The current
PR's standard CI run `38088047490` also completed successfully: quality gates,
staging database/container and staging Temporal service. Later commits require
their own review and CI before merge.

The application remains undeployed. Persistent named-operator acceptance,
current accepted-image release provenance, native cloud enforcement and actual
quote-to-email execution remain open. The following chronology preserves earlier
phase measurements and their original limits.

## Verified increments

| Requirement | Observed evidence | Practical limit |
| --- | --- | --- |
| Named people, scoped agents and exact approved actions | Assembled typed-browser/runtime run `38073578341`; its then-current 99-source fingerprints independently checked | Disposable private CRM/email twins and the bounded acknowledgement workflow |
| Held work survives interruption; uncertainty reconciles without resend | The same assembled run measures runtime interruption, retained approvals, four correlated provider effects, replay and restore containment | Finite single-host tests; no replicated failover or sustained SLO |
| Reviewed snapshots pass regression gates | Assembled run `38073578341`: 790 tests / 139 files; reviewed-source run `38075753737`: 869 tests / 142 files | Subsequent parallel authority and chat changes are not covered by these gates; current-source release checks refuse until remeasurement |
| Accepted images can be retrieved without rebuilding | Cold retrieval run `38075662222`, independently validated against accepted artifact `11678448686`, archive/image identities and five current loader sources | No service started; persistent installation and upgrade/reversion are separate requirements |
| Accepted application images can be promoted and reverted with pending work | Run `38075816629` independently validated: C→D→C, eight distinct accepted image identities, pending API/HTTPS work, full unchanged regression gate and owned cleanup | Same worker build, isolated topology; not persistent operator acceptance or a semantic worker upgrade |
| Restricted persistent database installation | Run `38075753737` executes nine isolated bootstrap tests: exact migrations 1–5 and 7–18, repeat preserves identities/actions, stale epoch and tampered schemas refuse | Dedicated installation helper; no quote schema, worker enrollment, host or runtime activation |
| Quote proposals bind exact commercial work | Quote contract/store/setup/readback suite: 169 focused tests, including actual dedicated PostgreSQL persistence | No actual quote provider, approval/dispatch integration or typed quote UI |
| Quote verification cannot infer success from totals | `lib/quotes/effect.ts` requires exact action/request/binding correlation, approved source-before, changed source-after and matching current quote | Pure evidence validator; it does not establish provider durability or call a provider |
| Quote authority survives restart without reviving revoked grants | Quote suites: 215 tests, actual PostgreSQL concurrency and membership/workspace/recovery-epoch checks; root combined authority/legacy/chat/transport subset: 74 tests | Enrollment and manager capability only; no quote provider dispatch or completed quote UI |
| Transport renewal and selective activation preserve workflow authority | Root verified 39 renewal/generation/activation adapter tests; exact signer/certificate validation, web bytes unchanged, only worker/scheduler transport JWT may change | Actual container activation, authenticated release adapter and persistent launcher remain open; injected adapters are not Docker proof |
| Container observation includes actual network attachments | Root independently reran 47 read-only inspection tests; actual Linux fixture run `38082845227` passed six observations and owned cleanup, with both source hashes and authenticated CI origin independently verified | Eight lightweight fixtures, not accepted platform images or transport replacement. Prepared configuration, authenticated release provenance and readiness probes remain separate prerequisites |
| Bound quote plans retain exact reviewed authority | Quote suites: 267 focused tests, including actual PostgreSQL direct-insert and concurrency failures; root separately verified 88 quote/setup/legacy-scope tests | Ordinary named-member email identities work; simulated sender/recipient remain test-only. Additive migration 21 and versioned plans only; neither plan review nor the contract check authorizes execution |
| Quote onboarding identifies unsupported provider contracts | Root independently reran 61 new read-only metadata tests; fixed origin/sandbox, exact bindings/version, bounded transport and sanitized failures | Unused helper and proposed provider endpoint. Advertised metadata never establishes atomic writes, durable effects or execution eligibility; not included in frozen I |
| Changed chat runs through the actual model and recovery path | October 10 local browser proof: 17 checks / 54 current source fingerprints; held real planning request proves immediate pending feedback and exactly one request after double-submit | Private provider twins and isolated Temporal test service; not persistent production or quote-workflow acceptance |
| Initial mobile chat preview wastes less vertical space | Actual component SSR rendered in Chromium at 390px and 1280px: mobile preview 412→295px, 16px text, 44px buttons, disclosures retained and no overflow; desktop geometry unchanged | Isolated layout measurement only, without authentication, model, API or effects. CSS is outside the frozen I snapshot and still requires the final-source quality/build gate |
| Cloud inventory remains distinct from enforcement | Existing authenticated discovery browser proof retains 30 checks and 37 source hashes, including provider owner review, cross-company refusal and no implicit enrollment | Browser project evidence uses normalized database fixtures. Native AWS/Azure/Google reads, effective permissions, workload federation and mandatory cloud-agent enforcement need separately authorized live proof; a discovered agent is not automatically controlled |

The complete reviewed-snapshot gates above include lint, TypeScript, coverage,
repository policy and production build. Test counts are measurements, not a
readiness score. The private CI repository is available to its authorized owners;
do not copy credentials or private prospect information into public evidence.

## Parallel increment under review

Three bounded chunks share the existing platform rather than adding another
execution engine: quote destination/manager authority, immutable persistent
runtime input preparation, and immediate chat submission feedback. These are
working-branch changes. Quote authority is not provider execution; the selective
activation primitive is not actual container or persistent lifecycle proof; pending
conversation feedback is not a proved
Tasklet-equivalent workflow builder.

The legacy record-scope manager now requires the exact record contract and
configured customer/recipient before changing authority. This intentionally
invalidates earlier source-bound receipts for the changed implementation.
Historical receipts remain intact; no fingerprint is rewritten to manufacture
proof. Fresh affected connector, lifecycle, browser and release trials plus the
final full regression gate are required before committing or deploying.

The October 10 parallel full-gate attempt passed repository policy, lint and
types, then stopped in tests: 891 passed and 25 failed. Twenty-four failures
rejected old source-bound evidence for changed code; the actual Docker image
enrollment test timed out. This is not a passing quality result. The final
quote-only lock-contention fixes subsequently passed the 74-test combined
subset; the full gate must still pass after genuine evidence refresh and an
available isolated Docker environment. No gate, receipt hash or timeout was
weakened to obtain acceptance.

Fresh measurements now target frozen reviewed runtime G (overlay
`c6d7519915adcc90a10d84a32af43e6b1b63e972b03dd9b65deee0922eac23ae`).
Isolated assembled run `38078502068` completed the actual typed browser/runtime
trial successfully: eight runtime checks, ten browser checks, four correlated
provider effects and restore containment. Root independently verified the raw
receipt against all 99 current runtime sources and the actual job provenance.
Its unchanged full quality gate passed 900 tests and rejected 18 stale proof
checks; no accepted release artifact was produced. Temporary model input cleanup
completed and the expiring CI secret was removed and its absence verified.

The second independent G origin, run `38080191110`, also passed its assembled
typed runtime trial and owned cleanup. Its raw receipt and authenticated terminal
run, job and candidate-artifact metadata were independently verified against all
99 current sources. The two origins use the same worker build and eight distinct
image identities. The second full quality gate again refused stale retained
proofs; neither origin is an accepted release. Semantic upgrade/replay trial
`38081833973` ran against both measured origins and the reviewed I overlay.
Its actual semantic trial passed: 108 source hashes, two
distinct worker builds/images, interruption/continuation, compatible versus
nondeterministic replay refusal and four final effects were independently checked.
The run's only failure was an existing test pinned to the old CI run; the local
exact origin pin was updated from authenticated evidence and all three unchanged
semantic behavior/source-drift tests now pass. It remains component proof, not
full quality or release acceptance. Drain run `38083008098` passed its actual
assembly and evidence validation: all 115 source hashes, admission-first commit,
drain-first refusal, transfer rollback and idempotent retries were independently
verified. Its terminal failure was solely the old retained receipt pin; root
refreshed that factual pin from the measured raw receipt and the seven combined
drain/semantic/candidate evidence tests pass. Candidate rollout/rollback run `38082437976` passed:
109 current source hashes, both package transitions, three same-session pending
reloads, eight runtime checks, ten browser checks and four observed effects were
independently verified. Its exact retained origin pins were refreshed from the
authenticated run; seven focused evidence tests pass. This remains isolated
component proof, without release acceptance.

Twelve local component families were genuinely remeasured against the same frozen
runtime: connector, recovery/replay, versioning, dispatch, backlog, record routing,
approved load, shared-agent contention, hosted email, restore, tenant isolation
and paced tenant operation. The paced trial measured 24 additional runs, 52 total
provider effects, two worker crashes and 26 replayed histories. These finite
measurements do not establish sustained capacity or an SLA. Tenant application
boundaries were tested; PostgreSQL tenant row-level security is not established.

The isolated secure-container run `38078844086` has passed 19 actual security,
persistence-recovery, transport-refusal and image-enrollment checks. Its raw
receipt was independently retrieved and validated against all 32 recorded source
hashes and the actual job/image provenance; all 99 G runtime files remain
unchanged. Its full quality result is tracked separately from component success. Gateway recovery run
`38079697970` completed its 19 measured network-bypass/restart checks. The raw
receipt was independently validated against 44 source hashes and three compiled
bundle hashes; all four existing gateway receipt tests pass. Its full quality
result remains separate; the earlier gateway job was canceled before execution.
At that intermediate checkpoint, dependent drain, reset and accepted-image
release proofs still needed current-source completion. The earlier production build passed across 77 pages;
that does not substitute for the complete quality gate. Later quote-v2 and
activation-library changes are outside the frozen G snapshot and need their own
final-source gate.

The preceding local quality attempt passed repository policy,
lint and TypeScript and measured 982 passing tests / six failures. Five failures
reject stale gateway, candidate-package, semantic, drain and reset receipts; the
sixth is the local Docker image-extraction timeout. The correct focused current
receipt batch passes all 15 tests across six files, including fresh container
source evidence. Linux isolated Docker runtime/enrollment success is recorded
separately; it does not excuse the full gate failure. No gate was weakened.
At that intermediate checkpoint, later CSS and help-copy changes required genuine
refresh of the chat and discovery
browser receipts as well as a final-source build and complete quality run. The
isolated 390px layout measurement reduced the empty preview from 412px to 295px
without hiding disclosure text; it does not replace authenticated browser proof.

Fresh UI run `38084222412` subsequently passed all 17 actual model/chat checks
and 30 discovery browser assertions. All 54 chat and 37 discovery source hashes,
the frozen 86-file UI manifest and screenshot hashes were independently checked
before the exact raw receipts were imported. The six focused UI evidence tests
pass. Discovery compiled hashes were checked within CI; those compiled binaries
were not uploaded for independent local retrieval. The cloud reads remain
controlled fixtures, not native customer account proof.

The subsequent unchanged local `pnpm quality` attempt passed policy, lint and
types, then measured 1,117 passing tests and two failures: the stale reset receipt
and the Mac Docker image-extraction timeout. Reset run `38084608972` then passed
the actual current-source trial, provenance validation and cleanup on isolated
Linux. Its 131 source hashes and raw receipt were independently verified; the
job failed only the old retained origin pin, now refreshed from actual evidence.
At that intermediate checkpoint, the final complete quality gate still needed
to pass on final sources. The latest checkpoint above subsequently passed it;
full release eligibility remains unestablished.

## Still required before the requested evaluation is complete

1. **Release provenance:** the accepted-image trial using successful origins
   `38073046051` and `38073578341` passed as run `38075816629`. Its complete
   receipt and actual jobs were independently validated and retained. This
   establishes the measured source snapshot only; subsequent authority changes
   require fresh affected runtime proof and the final source regression gate.
2. **Persistent operator environment:** complete the standard release path for
   an explicitly approved separate host, exact accepted images, private ports,
   canonical HTTPS origin, external recovery fence, restricted roles, build
   enrollment and private provider state. The existing four-GB web host cannot
   satisfy the joined stack's measured memory admission; do not lower budgets.
3. **Lifecycle operations:** bounded transport credential renewal, certificate
   lifecycle, supervised readiness/alerts, private off-host backup and an
   isolated restore, host restart and pending-work rollback. Preserve authority
   and identifiers; no automatic revival of expired or revoked approvals.
4. **Distributor quote demo:** actual atomic quote/source-version provider
   conformance, quote action/approval/lease integration, a versioned persisted
   quote-to-message dependency, scoped worker routing and readable chat UI.
Existing contact acknowledgement and the database discount test record do
   not prove this commercial workflow.
5. **Named operator acceptance:** Raj and Pratibha independently exercise the
   supported flow on desktop and mobile in the persistent environment. Measure
   exact plan review, independent approval, duplicate/lost-response/stale-data
   containment, restart recovery and observed effects. Publish the supported
   boundaries and unresolved outcomes beside the demo.
6. **Cloud and sidecar onboarding:** prove explicitly authorized native inventory
   reads, accountable-owner mapping and workload identity before enrollment.
   Effective permissions that are unknown stay unknown. Measure the mandatory
   action path and bypass refusal in the intended customer topology; the current
   separate-container gateway proof is not same-pod sidecar or cloud federation
   acceptance. See `../PROJECT_CLOUD_DISCOVERY.md` for the existing collectors and
   credential-binding limits; extend them rather than adding another inventory
   or approval engine.

## The requested quote story

The local saved-plan authority read now authenticates the actual requester or
designated manager separately from the persisted requesting identity. It refuses
unrelated members, fabricated requester sessions, workers, stale grants/scopes,
revoked membership and changed recovery epochs. Additive migration 22 now binds
saved plans to server-maintained member generations. A committed deactivation or
workspace move invalidates old saved authority; reactivation does not restore it.
Historical plans without generations remain readable but cannot authorize work.
Member deletion/renaming is refused to prevent identity reuse; this is a deliberate
installation-wide constraint, not general session revocation. The quote family
passes 322 focused tests, including actual PostgreSQL lifecycle and concurrency
checks. The final-source full quality gate and normal pre-push hook each passed
1,129 tests across 154 files; the pushed checkpoint's standard CI also passed.

Authentication and current authority inside future approval/dispatch mutation
transactions remain required. The authority read grants no approval or dispatch,
and no quote provider write is established. The original requester-only API and
exact plan digest remain compatible.

A distributor requests 14% against a 10% delegated limit. LoopLabs holds the exact
change for an explicitly eligible independent manager, refuses above the hard
cap, conditionally updates the approved quote version, and contains a lost
response. The separately approved customer email remains held until the exact
quote effect and current state are verified. Restart and duplicate requests retain
the same actions; policy, source or authority changes refuse execution.

See `../QUOTE_APPROVAL_WORKFLOW_PLAN.md` for acceptance and
`../FETCHSANDBOX_QUOTE_HANDOFF.md` for the proposed provider contract. Its atomic
quote write and correlated readback are still unsupported by the inspected
contacts-only FetchSandbox integration. Do not add a capability declaration to
make that unsupported path appear enabled.

## Release discipline

The application checkpoint above is committed and pushed to its review branch;
no production deployment followed it. The main checkout and unrelated GTM changes
remain preserved. Every later change needs full `pnpm quality` on its final source;
production still requires clean pushed `main` and `./deploy.sh`. A private
proof-harness commit is not an application release.
