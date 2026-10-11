# Enterprise acceptance for the bounded acknowledgement workflow

October 8, 2026. **Not accepted for enterprise production.** The local engine
milestones passed; staging, customer connectors and operational acceptance remain
open. This document sets a reviewable release boundary, not a numeric maturity score.

## Intended scope

One invited organization's customer acknowledgement: verify the CRM record, retain
its lifecycle, obtain independent exact-action approval, update it, acknowledge the
customer, read back both effects, and contain uncertain or conflicting outcomes.
Temporal orchestrates; LoopLabs decides authority and verifies effects. Imported
arbitrary agents, arbitrary graphs and connectors are outside this acceptance.

## Evidence and remaining release gates

| Gate | Current evidence | Required acceptance before a customer production pilot |
| --- | --- | --- |
| Approval and containment | Existing connector and managed-workflow tests; self-approval, stale source/policy, replay and revoked identity refusal | Repeat through the deployed invited UI using separate requester/reviewer accounts and the actual approved provider binding |
| Crash recovery and scheduling | Actual worker containers, Temporal/PG/HTTP-twin proof; worker/scheduler/service/persistence SIGKILL, stable IDs and exclusive ownership | Same drills on the staging worker image, including crash after each real test-provider effect |
| Version compatibility | Pinned old/new routing; persisted dev-service restart; compatible replay and incompatible rejection; retained same-worker-build A→B→A application package transitions preserve held authority and the actual signed-in 390px UI; exact custom/dependency image identities verified; disposable content-distinct worker upgrade with old pending histories, old-image recovery and actual incompatible replay refusal | Atomic retirement admission/reset fencing; persistent operator promotion/reversion; long-term artifact/namespace retention and drain policy |
| Database connectivity loss | Packaged roles become unready; replacement resumes 25 held histories; self-hosted Temporal PG crash and pre-effect snapshot restore do not duplicate effects; actual application archive restore fences resurrected authority and quarantines before read-back | Remote application database restore, managed database-service outage and replica failover drills; reconcile external effects; agree and measure disaster RPO/RTO |
| Secure operations | Real self-hosted mTLS/JWT namespace authorization, reader write refusal, invalid/expired/tampered token and certificate rejection, signing-key rotation; workload revocation and content-bound artifacts | Repeat secure connectivity and rotation in remote hardened staging; production key lifecycle; least-privilege database/network access and independent security review |
| Provider correctness | Private atomic source-version/idempotency/read-back twin contracts; saved plan/action destination binding refuses retargeting | Actual hosted/provider guarantees, including concurrent changes, duplicate request, lost response, outage and delivery semantics; hosted CRM atomic version gate remains blocked |
| Capacity and isolation | 25 held plans and 50 concurrent transfers; separately, ten independent test customer routes across packaged worker restart, nine approved completions/eighteen effects and one revoked route with no effects; workspace serialization | Multiple tenants; sustained approved load, bursts, quotas and backpressure; report latency/error/backlog distributions under an agreed workload |
| Monitoring and response | Local readiness/backlog/failure signals; independent monitor with protected retry journal, signed local HTTP alert acceptance and lost-response deduplication proof (not a designated on-call notification) | Alert reaches the designated operator during an injected fault; traces correlate run/action/provider reference; reviewed incident and rollback procedures |
| Human and workload security | Invited member authentication and scoped workload checks | SSO/MFA requirement agreed with pilot organization; adversarial tenant/role/API tests and independent security review; rotation and revocation drill |
| Deployed user experience | Local real-browser typed requests for two enrolled records, explicit agent grants, staging-only durable submission, independent approvals and packaged Temporal completion; saved recipient/ownership survives app restart and mobile reload | Repeat in isolated remote staging and the approved provider binding; production remains on the legacy runner |

Local evidence files under `docs/evidence/temporal-*.json` are measured test records
with source fingerprints. They are not signed certificates, independent audits or
availability measurements. Passing them does not attest to unrelated product
features. The production site remains on the legacy worker until the standard
release and explicit ownership cutover gates pass.

## Next execution order

1. Container build/export and isolated authenticated execution now pass. Reproduce
   `temporal:container-proof` from the documented image and verify source hashes.
   This proves the disposable environment, not a remote customer deployment.
2. Establish a dedicated staging Temporal namespace, database and private provider
   binding. Existing production web infrastructure is not evidence of staging
   isolation. Use namespace-scoped credentials; never paste credentials into chat.
3. Prove secure connectivity, provider refusal/verification and complete the invited
   UI opt-in path. Preserve one-way dispatcher ownership during rollback.
4. Run independent-record load, faults, alerts and recovery against that deployment.
   Set workload and service objectives with the pilot operator before measuring;
   do not invent p95/availability/RPO/RTO guarantees from one local test.
5. Review evidence and remaining exceptions with the pilot owner. A release needs
   clean pushed main, all regression gates, passed CI and `./deploy.sh`.

## Industry reference

Temporal separates production Service infrastructure from application Workers and
requires production operations for both. Its pre-production guidance tests
idempotency under faults, load and failover. LoopLabs additionally owns connector
permissions, approvals, current source guards and effect verification; adopting
Temporal does not automatically establish those guarantees.

- https://docs.temporal.io/production-deployment
- https://docs.temporal.io/best-practices
- https://github.com/temporalio/documentation/blob/main/docs/best-practices/pre-production-testing.mdx
- https://docs.temporal.io/develop/worker-performance

## Saved proposal safeguard

Migration 11 now freezes persisted action proposals, workflow steps/run identity
and local discount effect values without preventing the existing application from
updating approvals, leases, readback or restore containment. The restricted-role
PostgreSQL tests reject direct rewrites, deletion, truncation and trigger disabling.
See [persisted proposal boundaries](PERSISTED_PROPOSAL_BOUNDARIES.md) for the
provisioning contract and explicit remaining trust boundaries. This is not a
complete database state machine, protected approval service or production rollout.

The next product boundary is independent record/recipient scope and the exact
connector request content. Do not turn the shared-contact held-run test into a
capacity claim; expand the approved contract and preserve old version compatibility
before measuring multi-record approved execution.

## Exact request safeguard

Saved plans and independently approved actions now include the exact method,
resource, atomic source condition and body. Both adapters send that saved request
and refuse mismatches; readback/display never replace it with current template
text. Downstream execution requires predecessors to match the current destination
and request contract. See [exact connector requests](EXACT_CONNECTOR_REQUESTS.md).
Fresh actual connector, hosted, Temporal, secure-container, application-restore
and real-model/browser proofs passed. This is local prototype acceptance only;
older plans/actions without snapshots need reviewed handling before production
cutover. It does not close independent-record capacity or real-provider gates.


## Independent record foundation

`docs/RECORD_SCOPED_CONNECTORS.md` describes the server-enrolled test-record
contract. Two same-workspace customers now complete separate saved manual workflows
with independent approvals and exact CRM/message effects in the actual fixture
harness. Wrong-record/workspace calls and an atomic recipient change are refused,
and restart preserves the effect journal. These close a bounded target-correctness
gap, not the capacity gate: public selection, persistent enrollment, per-agent
record grants, compatible background routing, sustained load and complete tenant
security acceptance remain open. Current v1 worker transfer is refused for scoped
requests. No customer production readiness follows from these local checks.

## Persistent record authority foundation

Migration 12 and `ScopeControl` now persist immutable record enrollment and versioned per-agent grants, with named-owner checks and stale approval refusal across approval, dispatch, readback and predecessor checks. Archive quarantine revokes restored grants. See [PERSISTED_RECORD_GRANTS.md](PERSISTED_RECORD_GRANTS.md). This closes a local authority-persistence gap; invited enrollment UX/API, compatible scoped Temporal routing and independent-record capacity remain open. A storage-failure drill also exposed and fixed false verification from volatile fixture state; failed persistence now blocks further evidence and automatic resend. Production was not changed.

## Latest scoped background routing proof

The earlier sections record phase snapshots. `SCOPED_TEMPORAL_ROUTING.md` now records ten independent customer plans running in actual packaged Temporal worker/scheduler processes. Nine approved workflows complete exactly eighteen correctly targeted effects across worker restart; an actual lost CRM response is reconciled and the revoked tenth record produces no effects. Completed histories replay without effects. Immutable routes pin a compatible worker build and never fall back to v1 or hosted execution. This closes a local background record-routing gap. Invited scope onboarding/selection, remote TLS operational acceptance, independent tenant security, sustained capacity, live provider guarantees and production cutover remain open.

## Invited onboarding increment

`RECORD_ONBOARDING_WORKSPACE.md` adds a private record/access screen and authenticated catalog-backed enrollment API. It exposes the existing versioned permission foundation without conversational execution authority. Arbitrary-record selection through chat remains a separate integration step. Actual-source proof and release gates must pass before this increment is merged; this does not change the external-provider or remote-operations acceptance requirements above.


## Selected-record chat proof

`SCOPED_CHAT_EXPERIENCE.md` adds the invited typed-request → exact plan → explicitly granted agents → held actions → independent approvals → packaged durable execution journey for two enrolled records. Saved contexts cannot be retargeted by a dropdown; historical messages render their own stored body. Confirmed worker crash/app restart and actual lost-response readback retain exactly four intended effects. This closes a local end-to-end integration gap. Remote operational acceptance, sustained independent-tenant capacity, real-provider guarantees, production migration/cutover and enterprise security gates remain open.

## Two-company API boundary

`TENANT_BOUNDARY_PROOF.md` records two separate companies with colliding agent names, real authenticated HTTP APIs and private-twin effects. Sixty-four hostile cross-company reads/mutations are refused without state changes or effects; each company's approved activity then produces its own two correctly targeted effects. Completed repeats retain four effects. This closes a bounded API/activity query-scoping check, not independent tenant security acceptance, browser-session isolation, runtime database security, provider-side tenant authentication or noisy-neighbor capacity. Those remain release gates.

The incremental real-browser proof also signs in through the form in separate Chromium contexts, refuses eight cross-company/hostile-Origin requests, checks HttpOnly/Strict cookie isolation from scripts and rejects expired sessions. Remote HTTPS Secure-cookie acceptance and comprehensive session security remain open.

## Remote staging inventory — October 8

Read-only inspection of the existing server confirmed running web/legacy worker and healthy proof PostgreSQL. The server has no configured Temporal address, namespace, API key/client certificate, workload token, staging mode, record build pin or record catalog; no private Temporal staging environment file exists. This is missing provisioning, not a successful remote trial. The inspected host has about 3.8 GiB total memory and shares production/preview workloads. A dedicated staging service/namespace, isolated application database/provider binding, authenticated transport and matching workers must be provisioned and measured before remote acceptance. Nothing was enabled or cut over during this inventory.

## Paced independent-customer measurement

`APPROVED_RECORD_LOAD_PROOF.md` extends local packaged execution to forty enrolled customers, with thirty-nine approved completions/seventy-eight targeted effects and one revoked customer. Four paced approval waves retain later holds; duplicate approvals and four actual lost responses retain idempotency. Per-customer observed timing is recorded without an SLO claim. Single-action agents, one workspace and a paced laptop sample do not close shared-agent contention, multi-tenant saturation, remote sustained capacity or provider-rate-limit acceptance.

## Shared-agent contention increment

`SHARED_AGENT_CONTENTION_PROOF.md` reuses two agents across twelve explicitly granted customers. Three concurrent submissions compete for the last allowance slot: one is admitted and two are refused without actions or Temporal ownership. Actual packaged restart, independent approvals, lost-response recovery and replay retain eighteen intended effects and both lifetime reservation caps. This closes a bounded last-slot race, not fairness, saturation, every interleaving or remote capacity acceptance.

## Executable rollout prerequisite check

`temporal:staging-preflight` and the combined-environment invocation in `TEMPORAL_OPERATIONS.md` now inspect staging configuration, exact schema digests, runtime database privileges, workload scope and independent named members without mutation. The actual existing-server snapshot confirms missing migrations 9/11/12/13 and staging configuration. This narrows the provisioning work; it does not establish artifact integrity, poller/provider health or any remote operational acceptance. Keep the production runner unchanged until the remaining gates above pass.

## Two-company packaged execution increment

The existing browser/API tenant proof now includes separate company-scoped packaged worker/scheduler pairs and two actual Temporal histories. One company's confirmed worker crash does not prevent the other correctly queued company's completion; replacement and a lost-response drill preserve exactly four targeted effects. Both histories replay. This closes a bounded correctly configured queue/fault-isolation check, not multi-tenant saturation, provider-side credential isolation, misconfigured shared-queue availability or remote acceptance.

## Restricted runtime increment

The two-company browser/API/packaged-worker crash and replay proof now runs the application and worker/scheduler processes with a real restricted PostgreSQL LOGIN role using 29 grants extracted from the current provisioners. Thirteen direct SQL attacks fail before any effects; both independently approved workflows still complete four intended effects, including crash replacement and lost-response reconciliation. Role flags, table ownership, migration-owner membership and test-schema CREATE privilege are checked. This closes the owner-connection shortcut in that local execution proof, not database tenant isolation: the shared role can read both companies' rows and can update operational state. Broader privilege, row-security, compromised-service, remote deployment and independent security acceptance remain open. See `TENANT_BOUNDARY_PROOF.md` and its fingerprinted evidence.

## Host allocation prerequisite — October 8

A read-only inspection of the second existing 8 GiB host found active GTM
containers, about 6.0 GiB currently available, about 5.1 GiB of declared container
limits and one unbounded container. The new `temporal:host-preflight` refused that
actual inventory: an illustrative complete staging budget of 4.375 GiB plus a
1 GiB host reserve exceeds physical memory when added to existing reservations.
The illustrative budget is not measured sizing or a recommendation. A momentary
free-memory reading is insufficient permission or evidence for safe co-location.
No service was capped, stopped or deployed. Host allocation remains pending;
dedicated staging or explicitly reviewed co-location must precede remote trials.
The check covers declared memory admission only, not CPU, network isolation,
actual resource enforcement, sustained capacity or enterprise acceptance.

## Generated staging service integration — October 8

The new staging configuration has now run against real PostgreSQL-backed Temporal
1.31.0 and the isolated JWKS endpoint on a disposable CI runner. Namespace creation
and repeat, valid scoped access, cross-namespace/invalid/expired/tampered JWT
refusal, reader write refusal and namespace/authorization persistence after service
and database SIGKILL passed. The temporary controller runs as the private-file
owner inside the internal network, with no published service port. See
`docs/evidence/staging-temporal-service-proof.json` for source/image identities and
the actual CI result. This closes the mock-only namespace integration gap for
these configuration sources. Full application workers/browser execution, complete
eight-service staging, remote operational acceptance and production cutover remain
open.


## Assembled disposable integration — October 8

Private CI run `37841114978` passed the complete eight-service trial after fixing
non-root access to the private prepared provider spec. The exact overlay also
passed the full quality gate with 393 tests. Named sessions, API record enrollment
and grants, duplicate submission, self-approval refusal, held-work runtime
SIGKILL/restart, independent approvals, two verified effects, actual lost-response
reconciliation and real Temporal history replay all passed together. Artifact and
host-admission measurements are in `docs/evidence/staging-platform-proof.json`.
This advances the earlier separate component proofs into one disposable integrated
runtime proof. The controller used prepared plans and manually handled secure
cookies over a private HTTP network; it did not prove browser HTTPS or fresh typed
chat. Persistent staging, sustained independent-tenant load, restore/alert/operator
acceptance, live-provider guarantees and production cutover remain open. The Mac's
Docker/disk failure still prevents the mandatory local pre-push gate; the public
branch and production have not received the local ownership-fix commit.


The readiness increment subsequently passed private CI run `37844156496` with
394 quality tests and the same complete runtime assertions. Provider startup and
post-crash initialization now require bounded authenticated GET/readback health;
no business record is changed by that check. Health GETs may create request-archive
entries. Retained artifact: `docs/evidence/staging-platform-readiness-proof.json`.
The original proof and its limits remain preserved; this adds no browser/HTTPS,
live-provider, capacity, restore or persistent staging acceptance.


## Disposable trusted-HTTPS user journey — October 8

CI run `37859172131` passed the complete eight-service trial plus actual Chromium
HTTPS sign-in, exact prepared-plan review, scoped agent selection, separate-member
approvals, hostile-origin refusal, verified effects and 390px saved-outcome reload.
The full quality gate passed with 400 tests. The private provider journal retained
exactly four intended effects across the API/crash/replay and browser runs. See
[evidence/staging-platform-browser-prepared-proof.json](evidence/staging-platform-browser-prepared-proof.json).

This closes the manually handled-cookie/browser-transport gap for the disposable
prepared-plan journey. It does not close fresh typed planning in that environment,
persistent remote staging, sustained tenant load, restore/alert/operator acceptance,
live-provider guarantees, independent security review or production ownership
cutover. Production remains on the legacy runner; enterprise acceptance is incomplete.


## Fresh typed HTTPS journey — October 8

Private CI run `37863416303` passed the assembled eight-role stack plus actual
typed request, missing-recipient clarification, real bounded model interpretation,
exact scoped plan review, existing-agent selection, independent named approvals,
verified effects and 390px saved-outcome reload. The parent verified that only the
web container received the temporary model session. API/crash/lost-response/replay
checks remained intact; independent provider readback retained exactly four effects.
The unchanged full quality gate passed after generating the measured receipt.
See [STAGING_TYPED_JOURNEY.md](STAGING_TYPED_JOURNEY.md) and the current
[evidence/staging-platform-browser-proof.json](evidence/staging-platform-browser-proof.json).

This closes fresh typed planning in the disposable assembled environment; it does
not establish persistent remote staging, sustained tenant capacity, remote restore,
operator alert delivery, independent security review, live-provider guarantees or
production ownership cutover. Enterprise acceptance remains incomplete.


## Paced two-company operation

`TENANT_PACED_OPERATION.md` now records an actual 207,787 ms local observation
window: twenty-four additional independent customer records across two companies,
six approval waves and four reused scoped agents. All 52 effects (including the
original two-company checks) target their approved records/recipients. Later waves
remain held; repeated submission and exact approval do not add effects or allowance
reservations. One company's worker is killed during the third wave while the other
queue completes; replacement preserves the original actions. Two further lost
CRM responses are read back and all twenty-four workload histories replay without
new effects. The original tenant browser/API/database refusals remain required.

This closes one paced multi-tenant/shared-agent operation observation, not sustained
remote capacity, noisy-neighbor saturation, quotas/fairness under overload or a
production SLO. Delay samples include the injected downtime and client polling.
Persistent staging, representative tenant load and the pilot's agreed operational
objectives remain required. Production is unchanged.


## Assembled staging restore containment

`STAGING_RESTORE_FENCE.md` records the actual runtime result of private run
`37873330354`: approved application archive restored with Temporal/provider state
left ahead; all staged runtime roles contain revived authority; missing epoch does
not opt out; offline quarantine is idempotent; stale bootstrap cannot issue a new
workload key; provider effects remain exactly four. Component and assembled failures
exposed and fixed bootstrap token issuance and direct member-session access gaps.
The latest runtime passed, but its following CI quality step failed two staging
fixtures. Corrected fixtures keep their original refusal assertions and add
missing-epoch refusal; current local full quality passed all 414 tests. Exact-head
release checks remain required. This closes a disposable assembled restore proof,
not persistent staging, remote RPO/RTO, operator acceptance, real-provider safety,
enterprise production readiness or a production ownership cutover.


## Custom artifact retention and retrieval

`STAGING_IMAGE_RETENTION.md` records actual complete trial `37877500571` (421 tests)
and independent fresh-runner retrieval `37879011443`. The archive and all four
custom image IDs/build match; loaded validation images were removed. Their current
source fingerprints match and the earlier restore receipt is hash-preserved.
This supplies tested custom artifacts; it does not accept dependency tags,
application promotion/rollback, a persistent deployment or production operations.


## Isolated runtime dependency identity and retrieval

The candidate now freezes PostgreSQL, Temporal and the offline schema tool to
reviewed Linux/AMD64 content references and expected image IDs. Actual container
bindings and all six schema invocations are required in a fresh typed-trial
receipt. `STAGING_RUNTIME_DEPENDENCIES.md` defines the measured acceptance scope.
Actual corrected run `37881876443` passed runtime acceptance and all 429 tests;
all 97 covered sources match. Separate fresh-runner retrieval `37883440083`
passed with the same origin/artifact and all five retrieval sources matching.
Public release checks remain required. Previous custom-artifact receipts are
preserved and do not substitute for these new records.
No production deployment or ownership cutover is part of this trial.

## Pending-work package transition acceptance

Actual private run `37893973887` passed same-worker-build retained A→B→A package
transitions, the complete existing typed HTTPS/runtime/restore acceptance and the
following full regression gate. Five infrastructure roles retained their exact
containers/configuration while the three application roles were replaced. Pending
authority and action hashes survived; the same named 390px browser session reopened
the held run three times without self-approval or overflow. Provider effects remained
zero during switching and exactly four after the complete trial. All 104 covered
sources match the retained receipt. See
[STAGING_PENDING_PACKAGE_TRANSITIONS.md](STAGING_PENDING_PACKAGE_TRANSITIONS.md).

This closes a disposable same-build application release/reversion gap. Semantic
worker-version upgrades, persistent operator acceptance, retention/drain, sustained
service objectives, live providers, enterprise security and production cutover
remain open. Prior refused trials are preserved, not counted as acceptance.


## Content-distinct worker lifecycle: October 9

Private run `37901080849` completed successfully, including the following full
quality gate. Two actual content-distinct worker images used independent enrolled
records and immutable routes against authenticated PostgreSQL-backed Temporal.
The old worker was killed with pending work; the new worker completed only its own
record. Restoring the exact old image completed the original history/actions.
Read-back confirmed exactly four effects, with no replay effects. Both correct
history/bundle replays passed and both incompatible replays refused with actual SDK
nondeterminism errors. Original typed HTTPS/mobile, named approval, crash/lost-response
and archive-restore checks stayed intact. The retained receipt matches 106 sources.
See [SEMANTIC_WORKER_VERSION_PROOF.md](SEMANTIC_WORKER_VERSION_PROOF.md).

This closes the disposable semantic-upgrade/recovery gap, not build retirement.
That result predates the opt-in atomic active/draining registry fence measured below. Retention,
reset/recovery admission, persistent operator acceptance, agreed sustained service
objectives, hosted provider guarantees and enterprise security remain open.
Production remains on the legacy runner. No Temporal superiority or enterprise
production acceptance follows from this trial.


## Actual outbox admission/drain acceptance: October 9

Private run `37911844347` passed both actual PostgreSQL lock-race orders around the
normal outbox, refused/rolled back the drain-first transfer, and retained duplicate
transfer identity. It enrolled both actual inspected worker images through the
separate owner, retained one additional pending old route, and repeated the original
semantic recovery/replay, typed HTTPS/mobile and archive-containment gates. The
following complete quality gate and cleanup passed. All 113 covered sources match
[evidence/staging-drain-proof.json](evidence/staging-drain-proof.json). See
[WORKER_ADMISSION_FENCE.md](WORKER_ADMISSION_FENCE.md) for provenance and scope.

This closes the disposable admission/drain gap, not retirement/deletion permission.
The pending old route deliberately prevents retirement. Migration14 is not in
normal bootstrap or deployed. Its reset/archive recovery and retention policy are
not established by the parent's earlier archive snapshot. Persistent operator
acceptance, sustained agreed service objectives, live-provider guarantees, enterprise
security and production cutover remain required. No Temporal superiority follows.


## Actual reset/archive assembly acceptance: October 9

Corrected private CI run `37932460184` passed the full disposable assembly at
public source `95f5a086c77b4537c0bfe1e4ddb547ae572b4886`. The subsequent full
quality gate, receipt upload and owned cleanup passed. The retained
[evidence/staging-reset-proof.json](evidence/staging-reset-proof.json) matches all
129 covered source hashes and preserves the earlier drain acceptance.

One actual reset RPC, lost-response uncertainty, duplicate refusal in a fresh
owner process and independently observed lineage retain the original four effects.
A pending-intent archive restored under a rotated external epoch preserves 12
action identities and reservations, revokes restored authority, refuses stale or
replacement intents and retains two draining builds. The exact artifact digest
and authenticated CI provenance are recorded in
[RESET_ASSEMBLY_BOOTSTRAP.md](RESET_ASSEMBLY_BOOTSTRAP.md); the offline validator
checks consistency and source freshness, not a cryptographic attestation.

This supersedes the earlier open disposable reset/archive gap. Migration14 remains
unreleased; long-term artifact/history retention, retirement/deletion permission,
persistent staging/operator acceptance, live-provider guarantees, enterprise
identity/isolation and production cutover remain open. Production is unchanged.

## Disposable mandatory-path proof: October 9

Private CI `37960618067` passed the full gate and actual isolated TLS/Next-handler/
PostgreSQL/FetchSandbox trial. Its retained receipt matches 44 sources and three
independently rebuilt component byte hashes. Nineteen assertions cover agent
network/credential separation, forbidden privilege operations, epoch mismatch,
independent approval, outage refusal, durable held/uncertain states, exact two
native effects, provider SIGKILL persistence, terminal verification refusal,
revocation and owned cleanup. See `GATEWAY_BYPASS_PROOF.md`.

This closes one disposable enforcement experiment. Customer installation, cloud
workload federation, joined persistent staging, live providers, sustained service
objectives and enterprise security/operational acceptance remain open. Production
and its dispatcher are unchanged; no Temporal superiority follows.

## October 10 current-source refresh (staged)

After chat presentation and independent discount-approval changes, fresh local
connector proof passed all 36 checks, and the isolated hosted-path proof passed
its email acceptance/read-back and missing atomic-CRM refusal checks. Fresh
Temporal fault/replay proof passed seven checks, including after-effect worker
termination, compatible recovery and incompatible history refusal. Ten
independently enrolled records were retested with actual packaged roles: nine
approved histories completed exactly 18 intended effects across restart; the
revoked tenth record remained contained, and replay added no effects.

These newly measured receipts replace only their corresponding local proof
records. They do not renew unrelated package/drain/reset, tenant, browser or
remote-operation evidence. The redesigned typed HTTPS UI trial remains pending,
and the complete quality/release gate is still not accepted. Production and
its dispatcher remain unchanged. The quote-approval workflow is still planned
in `QUOTE_APPROVAL_WORKFLOW_PLAN.md`; contact-lifecycle results are not quote
workflow evidence.

The subsequent 40-record paced trial completed 39 approved histories and
78 correctly targeted effects after worker restart, with four real lost
responses reconciled and the revoked fortieth record contained. The separate
shared-agent trial admitted exactly one of three final-slot contenders and
retained capped reservations after execution/replay. Fresh outbox/ownership
proof passed six checks; pinned-version/restart proof passed seven checks;
actual PostgreSQL archive/restore proof passed five containment checks.
These remain local bounded workloads, not steady-state capacity or remote
service objectives.

Private current-source UI run `38063579096` passed all ten HTTPS browser
checks and complete isolated runtime/restore checks with exactly four
provider-twin effects. Its retained receipt matches 99 current source files.
The following full gate failed 20 older evidence checks; owned cleanup
passed. The temporary CI secret was deleted. Second independent package
run `38065228354` is in progress and has no release acceptance. Latest local
quality failed 13 remaining retained-evidence checks plus a local Docker
fixture-build timeout; no timeout or safety assertions were relaxed.


### October 10: current-source tenant boundary refresh

After a fresh production build, the actual two-company Next HTTP/browser and
packaged-worker trial completed all ten checks. It refused 64 cross-company HTTP
requests, eight browser requests and thirteen restricted-database attacks. The
real restricted runtime login used 30 current provisioner grants. Both intended
workflows completed four provider-twin effects; replacement after one worker crash,
actual lost-response readback and both history replays retained those effects and
original action identities. The source-bound tenant verification test passed.
The shared database role still reads both companies; this is not RLS isolation.

The same verification invocation confirmed refreshed archive and pinned-version
receipts, but correctly refused the two still-stale packaged backlog/secure-container
receipts. A paced two-company actual operation refresh is running. No production
cutover, sustained capacity SLA or independent security acceptance is established.


The paced refresh then completed six two-company waves with 24 additional
independently scoped workflows and 52 total intended provider-twin effects.
Duplicate submissions and approvals, one-company worker-crash isolation,
lost-response readback, lifetime reservations and all 26 history replays passed.
Both current-source tenant evidence tests are required alongside this receipt;
these finite localhost measurements do not establish saturation, HA or an SLA.


### October 10: current-source packaged backlog and database-outage refresh

The actual non-container packaged trial completed ten checks: 25 held plans and
50 concurrent ownership transfers retained exactly 25 intents; scheduler SIGKILL
and natural lease recovery started each history once. A real TCP database outage
made both runtime roles unready. Replacement startup while the database remained
unavailable terminated without effects; subsequent replacement resumed the same
25 histories. Worker SIGKILL/replacement plus exact independent approval produced
one CRM and one email effect. Other stale shared-contact runs were contained, and
workload revocation made both roles unready. The measured receipt covers 30 current
source files and retains the finite-localhost and no-real-provider limitations.

The runtime evidence tests now report nine passes and one remaining stale
secure-container receipt refusal. This refresh does not prove an authenticated
remote TLS handshake, a database-server crash, database restore, host failover,
capacity percentiles or production availability.


### October 10: measured redesigned UI package rollback

Isolated CI run `38066572459` successfully retrieved both independently measured
current-source candidate image archives, verified exact worker/image bytes and
ran pending-work A→B→A promotion/reversion. The same named secure HTTPS 390px
session reopened held work three times with original action hashes and approval
boundaries. Full typed request/clarification, exact review, independent approvals,
four provider-twin effects, history replay and archive containment remained
required and passed. The retained receipt matches 109 current sources; its new
candidate-evidence guard and twenty contract tests passed. Both parents' full
regression gates had failed, so this receipt explicitly grants no release authority.
Persistent operator staging, production cutover and live connectors remain open.


### October 10: fresh content-distinct worker and broad chat acceptance

Private CI run `38067428229` completed the actual content-distinct two-worker
lifecycle and source/provenance validation. Old held work stayed pinned when its
worker was absent; a new worker continued its own work; recreating the old worker
completed the original history. Each recorded history replayed under its own
build and was refused under the incompatible build. The original complete typed
HTTPS/runtime/restore trial also retained four intended effects. The receipt
matches 108 current sources. CI then refused the unchanged historical origin pin;
its successful measured receipt and owned-input cleanup were retained. The prior
receipt is preserved in `staging-semantic-before-chat-redesign-proof.json`. After
authenticated-origin and current-source verification, the current pin was updated;
all three semantic regression tests passed. This partial CI run grants no release
acceptance, retirement/reset policy, persistent remote SLA or Temporal superiority.

The independent broad local chat trial subsequently passed 17 actual checks
covering real bounded Bedrock interpretation, exact saved plans, legacy and scoped
independent approvals, duplicates, lost-response readback, stale customer refusal,
background execution while browsers are away, worker/application restart, record
grants, expiry/revocation and exhausted-agent submission containment. The receipt
matches 54 current sources and preserves the hosted atomic-version blocker. Local
worker, scheduler and twin child environments strip the web model session and
disable AWS profile/metadata fallback. Desktop/mobile evidence is explicitly
captured at 1280px/390px; the mobile outcome text is at least 16px without overflow.
Its current-source regression test passed. These isolated fixtures do not provide
real customer delivery, durable raw-chat memory or arbitrary workflow generation.

### October 10: current gateway containment and release-gate refresh

Private run `38068119538` completed the actual isolated network/TLS gateway
trial: 19 checks passed, including direct provider/database bypass refusal,
independent named approval, held state across restart, no fail-open during an
outage, lost-response readback without resend, dependent email verification and
exactly two provider-twin effects. Its receipt matches 44 current source files
and all three compiled bundle hashes. Owned resource cleanup passed. Historical
bytes are preserved in `gateway-bypass-before-chat-redesign-proof.json`; the four
current gateway receipt tests pass.

That job then failed before its discovery browser trial because `.next/BUILD_ID`
was absent. The isolated harness now builds the production UI first. Corrected
run `38068845071` passed gateway and authenticated discovery browser execution.
The discovery receipt matches 37 current sources and retains 30 checks, including
three-provider owner review, cross-company/refreshed-access refusals, no implicit
enrollment or execution authority, readable 390px inputs and no raw JSON. Its
actual mobile screenshot was inspected. Six focused gateway/discovery evidence
and invocation-refusal tests pass. The job's unchanged full gate subsequently
reported 661 passed and 13 old receipt failures in the pinned B snapshot; owned
database cleanup passed. Newer local receipts are not retroactively represented
as part of that earlier source snapshot. This remains a disposable
trial, not a customer network installation, same-pod sidecar proof, cloud workload
federation, live-provider guarantee or enterprise production acceptance.

The subsequent local full gate reported 669 passing tests and six failures:
current accepted-artifact retrieval, retained accepted-package transition,
worker-drain evidence, reset/archive evidence, secure-container source freshness,
and a 30-second local Docker enrollment timeout. No gate was disabled or relaxed.
The current secure-container trial is dispatched as `38069176491`. The prepared
drain trial `38069086595` was canceled while pending by GitHub's single-pending-job
concurrency policy; no model or runtime trial started. Its unused temporary model
secret was deleted and absence verified. Drain dispatch must follow the container
job with a fresh bounded model session. No application release or deployment is
authorized by these partial results.

### October 10: current secure container and explicit release boundary

Private run `38069176491` completed the actual mTLS/JWT container trial, independent
receipt checks and inert worker-image enrollment. Its receipt matches 32 current
source files and retains 19 security/recovery checks. The workload refuses wrong
namespaces, expired/tampered tokens and untrusted TLS identities; signing-key
rotation, packaged worker/scheduler recovery, service/persistence interruption
and quiesced Temporal backup restore are measured. The previous receipt is
preserved in `temporal-container-before-chat-redesign-proof.json`. All ten retained
Temporal proof tests pass locally. The CI full quality gate still failed on older
evidence; owned database cleanup passed. Single-node isolated recovery does not
prove replicated failover, a remote managed deployment, capacity or availability.

The production release gate now additionally calls `staging-release-evidence.mjs`.
It retains the strict accepted-artifact validator and requires successful observed
quality/retention/cleanup jobs, exact current typed runtime and loader sources,
matching archive/manifest/build/image identities, and independent successful cold
retrieval. Two contract tests exercise a synthetic accepted association and 25
refusal cases; these fixtures are not runtime evidence. An authenticated check of
the actual current candidate correctly refused release. Historical/current evidence
tests have not been loosened; their dependency cycle still needs an evidence-based
separation before fresh accepted artifacts can be produced. No deployment followed.

### October 10: current drain races and release evidence ordering

Drain attempt 2 of private run `38069086595` completed the actual drain assembly,
receipt-source validation, retention and owned-input cleanup. The receipt matches
115 current sources. Admission committed before drain remains valid; drain committed
first refuses new admission; failed transfers roll back; existing transfers remain
idempotent; held work remains pinned without granting retirement. Both workers'
own history replay passes and incompatible history is refused. The complete parent
typed runtime and containment remain required. The job's only failure was the old
exact-origin test pin. After authenticated observation and source validation, the
historical receipt was preserved and the pin refreshed; all three drain tests pass.
Reset/archive trial `38070833335` is running against this measured parent.

The release-only boundary now additionally requires actual current accepted-image
promotion/reversion, two successful accepted origins and a separate successful trial.
All 106 current runtime/helper sources, pending authority, exact image/archive/build
identities, full typed outcome and observed quality/retention/cleanup must pass.
Four contract tests cover positive synthetic associations and 47 refusal cases.
These fixtures do not establish successful CI or a production release.

Historical retrieval and package tests now use their original pinned origin/receipt
bytes. The historical package's 104 source files were reconstructed from the exact
Git base and verified against every measured hash before retaining the snapshot.
All original negative runtime/authority assertions remain. Current candidate evidence
is checked separately, and current accepted-artifact/transition evidence is mandatory
at deployment. Ten focused historical/current release/package checks pass. The full
local gate now has 678 passes and two failures: stale reset evidence and the local
Docker enrollment timeout. No application commit or deployment followed these results.

### October 10: parallel quote contract and reset capacity refusal

Reset run `38070833335`, attempt 1, refused before runtime at host admission:
6,845,104,128 bytes were required; 6,826,672,128 were available. The owned builder
had already been removed and no existing containers were reported. This is a
capacity refusal, not a passed reset test or evidence of a leaked process. Owned
model input cleanup passed. One identical-source fresh-host retry is running;
service limits and host reserve remain unchanged.

The standalone quote proposal contract now passes 84 focused tests with complete
file coverage. Explicit quote/policy/workspace approval grants, scoped agents,
exact pricing/source and conditional provider capabilities are required. No
quote provider is enrolled; no quote action is persisted or executed by this
contract. Existing engine integration and the actual distributor demo remain open.
The full quality run has 762 passes and two failures: stale reset evidence and the
local Docker enrollment timeout. No application commit or deployment followed.
See `architecture/PARALLEL_DELIVERY_PLAN.md` for independent chunk ownership and
integration/release boundaries.

### October 10: reset/archive accepted as component evidence; saved quote proposals

Reset attempt 2 of private run `38070833335` completed actual execution, source
validation, retention and owned-input cleanup. The receipt covers 131 current
sources. It records one reset RPC, four exact provider-twin effects, independent
reset lineage, refusal to retry committed uncertainty, a pending archive with
12 retained actions, external epoch rotation, revoked restored authority and
preserved action identities/reservations. Independent local validation passed;
all nine reset/drain/semantic evidence tests pass. The historical receipt is
preserved. CI's only failure was the unchanged old receipt pin; this is component
evidence, not successful full release acceptance.

Quote migration 19 now provides an optional immutable proposal store. It reuses
existing named-member authority, workspace transactions and recovery fences. It
saves exact validated proposals without creating approvals, action dispatch or
provider effects. Actual dedicated PostgreSQL tests cover concurrent same-ID
retries, changed reuse, owner/workspace and revoked-session refusal, service
restart, epoch containment, restricted-role mutation refusal and migration
idempotency. The quote contract/store/setup suite passes 101 tests with 98.75%
statements, 98.64% branches, 100% functions and 99.23% lines. No API/UI or provider
integration is installed by this increment.

Latest full local quality: 787 tests passed and only the existing local Docker
inert-image enrollment timeout failed (788 total). That gate is retained. The
next full quality invocation must run in the isolated Linux job; no application
commit or deployment followed the failed local invocation.
