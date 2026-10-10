# Orchestration adapter decision and acceptance contract

October 9, 2026. Raj confirmed keeping self-hosted open-source Temporal, with a clean
pluggable architecture for other orchestration engines. This is an architectural
direction, not a production cutover or purchase of Temporal Cloud.

## Responsibilities

LoopLabs owns agent identity, tenant/owner scope, immutable plans and action IDs,
policy evaluation, named exact-payload approval, reservations, dispatch authority,
connector requests, effect verification and reconciliation. Those controls remain
in the shared services and PostgreSQL boundaries regardless of orchestrator.
An orchestration engine coordinates durable waiting, scheduling and attempts; its
signals, history or successful task delivery cannot grant execution permission.
Credentials remain in the controlled execution process, outside workflow inputs.

The product-facing model is a saved plan, controlled actions, approvals and
verified outcomes. Temporal workflow IDs, task queues and histories are operator
diagnostics rather than the customer's workflow-building interface. The durable
engine is an implementation choice behind the control plane.

Temporal currently has an isolated implementation. Its activity handler already
calls the shared WorkflowControl rather than a separate policy engine. Before this extraction,
lib/enquiries/submission.ts constructed TemporalOutbox directly and enquiry
admission checked Temporal routing tables. Executor fencing still identifies
Temporal ownership and is deliberately preserved.
The extraction candidate now injects an engine-neutral admission port into
EnquiryControl and constructs TemporalAdmission only at trusted API/proof
composition boundaries. Transfer still uses the existing immutable Temporal
outbox and executor fences. This is an uncommitted candidate; no second engine
or production rollout has been accepted.
The SQL migration and execution-ownership history must not be renamed or rewritten.

The current adapter's early `assertReady` checks the explicit build-ID format and
record-routing schema on the transaction connection. It preserves the existing
submission check; it does not prove that a worker is polling, that Temporal is
reachable, or that an optional build registry currently admits that build. Transfer
still revalidates saved ownership and grants, and the opt-in registry trigger fences
new routes against draining builds. An outage or refused transfer leaves controlled
work held; it does not authorize another dispatcher. A stronger early readiness or
registry check would be a separate measured change, with the transfer-time fence
still required to handle races.

## Target boundary

An engine-neutral admission port accepts a reference to a saved tenant-scoped run,
its immutable plan/version, reviewed worker contract and stable scheduling identity.
It is supplied by trusted server composition, never a browser engine name or chat
instruction. The Temporal adapter implements the port through the existing outbox,
build registry, immutable record route and scoped queue. Core submission must not
construct or import a vendor SDK/outbox.

The initial port has two operations: check admission inside the existing
tenant-scoped transaction, then transfer the saved run into durable scheduling.
Admission must reject missing configuration or incompatible contracts before
creating new work. Transfer uses the existing immutable outbox ownership and can
be retried with the same run ID. Readiness reported to the UI must use the same
adapter admission criteria; it must not promise availability from a configured
engine name alone. No database migration or engine switch is implied by this
initial extraction.

Capability checks occur before new submission: durable waiting, idempotent start,
exclusive ownership, version-compatible execution and an authenticated worker path
must be supported and proved for the selected adapter. Unsupported adapters fail
closed. No automatic fallback switches engines after an outage or unknown response.

Admission records exactly one engine owner for each run. Future adapters require
additive storage and equivalent runtime fencing; the present Temporal ownership
cannot be reused as another engine's authority. Stable business action IDs survive
orchestrator retries. A new engine must call the same controlled action services
and cannot issue connector requests directly. Pausing or signalling a workflow does
not replace business approval or reconciliation.

Replay and worker-version protocols belong to each adapter. Temporal histories are
not portable merely because the port has common method names. Pending-run migration
requires an explicit tested handover protocol; otherwise existing runs drain on
their original engine and only new runs may use a newly accepted adapter.

## Required proof before integration acceptance

1. Existing typed chat/submission, independent approval and exact-request behavior
   survives the port extraction with the same run, plan, action and ownership IDs.
2. Repeated start and wake requests cannot create duplicate ownership, reservations
   or provider effects. Changed scheduling identity/digest/tenant is refused.
3. Worker/service restart, lost responses and expired authority preserve containment
   and reconcile effects rather than blindly resend them.
4. Missing/unsupported adapter capabilities refuse before new work; a scheduler
   outage never falls back to a competing dispatcher.
5. Existing worker version, drain, reset, restore, tenant isolation and actual
   runtime replay proofs are refreshed wherever covered sources change. Unit tests
   of a mock adapter alone do not prove another engine integration works.
6. Full unchanged quality gates and exact-source runtime receipts pass before
   commit/release. Production cutover still requires enterprise acceptance gates.

The initial extraction is under validation: submission admission uses the port
and the existing Temporal adapter is wired at the server composition boundary. Other
engines remain unsupported until their ownership, identity and failure protocols
pass the same business-control contract. This document does not claim that those
adapters or the extraction are already shipped.

Temporal server license: https://github.com/temporalio/temporal/blob/main/LICENSE
Self-hosting: https://docs.temporal.io/self-hosted-guide
Self-hosting has no Temporal server software license fee; compute, storage,
security, upgrades and operations still have costs.

## Rollout boundary

Keep the existing production dispatcher until the isolated adapter extraction,
refreshed exact-source runtime proofs, full quality gates, and standard release
process pass. Self-hosted staging also needs persistent storage, authenticated
workers, TLS, restore/failover drills and operational monitoring. See
[enterprise acceptance](../ENTERPRISE_ACCEPTANCE.md) for the remaining customer
pilot gates. Adopting Temporal does not by itself satisfy those gates.

## Candidate evidence, October 10

Private CI run 38019724977 completed the isolated Linux container trial and native
recovery, independent-record, shared-agent and paced-record trials. The container
trial required authenticated provider reads in both initial and replacement workers,
persisted scheduler backlog, worker/database/service crash recovery, and restoration
of a pre-effect Temporal backup without duplicating approved provider-twin effects.
The five retained Temporal receipts match the candidate's measured sources; the ten
focused receipt checks pass. These are disposable experiments, not persistent
customer staging or evidence of a production availability objective.

The proof-harness lifecycle defect was corrected without changing execution
permission: database-outage injection previously also closed the Linux provider
relay. The relay now remains available through that fault and closes during final
teardown. A post-replacement provider read is required before approval.

The same CI run's full unchanged quality gate failed: 648 tests passed and seven
source-bound evidence checks failed. Subsequently the current app built and both
actual tenant isolation and paced tenant proofs passed, followed by their two
receipt checks. Five assembled browser, semantic-version, drain, reset/archive and
package-transition proofs still need actual refresh. Existing receipt hashes must
not be relabeled as current. Database tenant RLS is not established; shared database
credentials do not isolate a compromised tenant at the database layer.

The package proof needs two fresh, source-compatible image archives. Candidate
input provenance and archive loaders are separate from accepted-release retrieval:
a successful component trial may provide isolated test inputs even when the full
regression gate fails, but its provenance always says `releaseAccepted: false`.
An unrelated failed stage, expired artifact, substituted source, mismatched worker
contract or changed archive is refused. The accepted-release verifier continues to
require a fully successful CI run. Candidate input retention is prepared but has
not been dispatched or consumed by a real package-transition trial.

The extraction therefore remains uncommitted and undeployed. Full unchanged
quality, refreshed assembled runtime evidence and enterprise acceptance remain
required before customer production acceptance.
