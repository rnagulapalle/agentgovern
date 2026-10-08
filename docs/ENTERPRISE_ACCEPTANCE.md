# Enterprise acceptance for the bounded acknowledgement workflow

October 7, 2026. **Not accepted for enterprise production.** The local engine
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
| Capacity and isolation | 25 held plans and 50 concurrent transfers; one approved completion; workspace serialization | Independent customer records; multiple tenants; sustained approved load, bursts, quotas and backpressure; report latency/error/backlog distributions under an agreed workload |
| Monitoring and response | Local readiness/backlog/failure signals; independent monitor with protected retry journal, signed local HTTP alert acceptance and lost-response deduplication proof (not a designated on-call notification) | Alert reaches the designated operator during an injected fault; traces correlate run/action/provider reference; reviewed incident and rollback procedures |
| Human and workload security | Invited member authentication and scoped workload checks | SSO/MFA requirement agreed with pilot organization; adversarial tenant/role/API tests and independent security review; rotation and revocation drill |
| Deployed user experience | Local real-browser typed request, staging-only opt-in, independent approvals and Temporal completion; saved ownership survives reload | Repeat in isolated remote staging and the approved provider binding; production remains on the legacy runner |

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
