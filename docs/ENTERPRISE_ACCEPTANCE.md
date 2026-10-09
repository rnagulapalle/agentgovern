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
| Version compatibility | Pinned old/new routing; persisted dev-service restart; compatible replay and incompatible rejection | Retained immutable images; promote/rollback drill with old pending runs; namespace retention and drain policy |
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
