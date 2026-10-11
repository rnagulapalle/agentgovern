# Enterprise evaluation delivery plan

Updated October 10, 2026. Overall goal: build and prove a viable durable LoopLabs
control platform for enterprise design-partner evaluation, closing measured
reliability and product-experience gaps without regression or unsupported claims
of Temporal superiority. The goal remains incomplete.

This plan decomposes the existing scope; it does not replace it with a smaller
proof-only objective. Built, isolated proof, release eligibility, deployment and
independent operator acceptance are separate states. Passing a component does
not complete a milestone containing unfinished requirements.

## Milestones and acceptance criteria

| Milestone | Current state | Remaining TODOs | Evidence needed to close |
| --- | --- | --- | --- |
| 1. Durable execution foundation | Implemented; substantial isolated proof | Finish current-source drain, reset, promotion/reversion and cold artifact retrieval; retain restart/version/replay invariants | Actual packaged runtime lifecycle results with exact source/artifact provenance, plus passing final-source regression gate |
| 2. Authority and tenant boundaries | Implemented in part; migration 23 not released | Release requester/owner/approver membership-history protection; close shared database role cross-tenant read gap; evaluate named access end to end | Revocation/reactivation, stale approval, independent approval, cross-workspace HTTP/SQL and restore tests against the installed release; explicit tested tenant boundary |
| 3. Connectors and enterprise demo | CRM/email twin workflow proved; quote contract/authority implemented | Obtain native atomic quote/contact version guarantee; wire supported quote execution to separately approved email; test permission limits, source races, uncertain effects and readback | Typed UI demo for 14% vs 10% delegated authority, independent manager, hard cap, exact conditional write, lost response and held email until verified quote effect; unsupported contracts stop safely |
| 4. Seamless enterprise chat | Bounded enquiry planner and saved plan/run work; Tasklet parity unproved | Implement revision-aware follow-up and saved conversation; retain immutable plan versions and require fresh approval after changes; improve artifact-first results and consistent enterprise language | Browser tests from typed request through clarification, review, approval, execution and verification; refresh, duplicates, stale approval and membership revocation; readable 390px mobile view and independent usability observation |
| 5. Agent onboarding and enforcement | Scoped identities/registration and isolated gateway proof exist | Prove supported cloud discovery, owner review and enrollment separately; implement/prove one authorized workload/sidecar installation; publish supported/unsupported import matrix | Authorized AWS/Azure/Google observations for supported adapters, effective permissions and metadata; direct-path bypass refusal and correctly attributed effects from a real installation; no automatic enforcement claim from inventory |
| 6. Release and persistent operation | Not released; current quality gate incomplete | Finish fresh evidence; pass pnpm quality and exact-head CI; obtain adequate approved host; clean pushed main; deploy only with deploy.sh; verify persistent service/restore/health | Exact deployed commit and images, passing gates, production URLs, installed migrations, restart/recovery evidence and measured resource admission |
| 7. Design-partner acceptance | Not completed | Raj and Pratibha independently exercise onboarding, policies, approvals, controls, failures and recovery; document constraints; invite a bounded partner evaluation | Actual named operator observations, reproducible demo instructions, no-regression evidence and agreed pilot scope; no invented bookings/customer validation |

## Ordered work queue

1. Finish the current frozen reliability candidate. Two 106-source assembled
   candidate origins have been independently verified; neither is a successful
   full-gate release origin. Semantic run 38098248911 completed actual runtime
   upgrade/replay and provenance/cleanup successfully. Its only failed step was
   the unchanged retained test's historical origin pin. Raw artifact 11686978543
   was authenticated and independently validated against all 115 current sources;
   its receipt SHA is 584d2ef2b4b75b4f7e3f905b9474f1b55a633158b50502150fe978867a0fba7b.
   The refreshed exact origin pin and all four retained semantic tests pass locally.
2. Drain admission/race run 38098987093 completed its actual runtime successfully
   against that exact measured semantic parent. Artifact 11687124592 was independently
   authenticated and validated against all 122 current sources. The only job failure
   was its historical retained-evidence pin; all three refreshed retained drain
   tests now pass locally. Reset/restore run 38099702851 refused execution at host admission: available
   memory was 6,832,873,472 bytes versus the required 6,845,104,128 bytes. This is
   an actual failed proof, not a passed reset or a historical evidence-pin failure.
   Its owned GitHub model input was removed. One identical-source fresh-runner
   retry run 38100392812 completed actual reset/restore and provenance/cleanup
   successfully with unchanged limits. Artifact 11687716483 was authenticated
   and validated against all 138 current sources; its raw receipt SHA is
   ee18f9a6ef4d8290e6c5dae5a4835adf0cbe9e38b4a3cf0124a69e45bd4d9001.
   Only the historical retained receipt pin failed in CI; all three locally
   refreshed retained reset tests pass. This is component proof, not full release acceptance. Preserve default deny,
   installed membership history, duplicate-effect and stale-authority checks.
3. Candidate promotion/reversion run 38101267754 completed at private commit
   f1807c104221681f4e94cd2f2c8f56e6d900f217 after authenticated reset intake.
   Actual rollout/reversion, receipt upload and cleanup passed. The sole job failure was the historical retained evidence fingerprint. Artifact 11687509192 was independently authenticated against all 116 exact current sources; receipt SHA daa5d3fbfc92edde41614e19641f217f341809bb1c58b029e15ee706ca8edec8. The refreshed retained regression test passes with exact source-set coverage. This remains candidate component proof, not release acceptance. Run cold
   retrieval and refresh evidence through
   real executions; never manufacture fingerprints or weaken acceptance. Obtain
   two genuinely successful release origins and accepted archives where required.
4. Run the full final-source quality gate and exact-head CI. Final current-source local `pnpm quality` completed successfully after authenticated candidate intake: all 1,162 tests across 157 files passed, with coverage, lint, types and production build. Log: private `2026-10-10-membership23-final-evidence-quality.log`. Exact-head CI and release-origin acceptance remain outstanding.
5. Build the next chat increment after the frozen runtime lifecycle chain is
   resolved: persisted conversation plus immutable revised plans and explicit
   independent approval. Test the new behavior rather than reusing old receipts.
6. Complete the quote demo when FetchSandbox supplies a verified native conditional
   write/readback contract. Existing contract/authority work is reused. Do not
   invent endpoints or let mocked metadata authorize execution.
7. Close tenant and cloud-installation boundaries with separately scoped tests;
   keep inventory, enrollment and mandatory enforcement distinct.
8. Release the supported scope through standard gates on an adequate approved
   host, then complete independent operator and partner acceptance.

## Parallel work and dependencies

Read-only demo review, UX observation and provider-contract investigation can run
in parallel. Changes to runtime source files invalidate the frozen candidate and
require remeasurement; avoid mixing them into an executing proof. Use existing
platform services and orchestration interfaces rather than duplicate engines.
Only one pending isolated CI job is allowed because the shared concurrency group
can replace pending jobs. Temporary model access is bounded, web-only and removed
after the runner prepares its input.

## External dependencies and boundaries

- The existing 4GB host fails the measured 6.845GB admission requirement. No paid
  replacement host is authorized; resource admission must not be weakened.
- Native quote/contact atomic source-version enforcement remains unavailable in
  the inspected FetchSandbox contract. A successful email twin does not close it.
- Independent operator sessions and customer-cloud permissions require actual
  participants/access. Their absence is not a passed acceptance test.
- Provider twins do not prove real delivery, real payment or production provider
  parity. Finite isolated tests do not establish an availability SLA.

## How progress is reported

For each increment record: changed behavior, current commit/source snapshot,
actual test/run/artifact, passed and failed checks, deployment state, next TODO
and remaining dependency. Do not use a numerical readiness percentage or test
count as a substitute for requirement-level acceptance. Preserve failed results.
The detailed evidence and historical limits remain in
[ENTERPRISE_EVALUATION_STATUS.md](ENTERPRISE_EVALUATION_STATUS.md).

## Next chat increment: design constraints, not shipped behavior

Reopening saved work should restore a concise conversation summary derived from
its immutable saved plan and current server-owned status. Do not imply that a
historical transcript was stored, and do not persist unrestricted chat or secrets.
The server retains the same exact customer, actions and recipient; viewing this
summary grants no execution authority.

A later new additive migration should link immutable parent and successor plans;
never rewrite released migrations, existing plan payloads or approval hashes.
Reuse current planning, source/policy snapshot, membership and save services.
Before submission, a refresh can capture a new source/policy snapshot for review.
Supported user-requested revisions must eventually be explicit structured changes
within the approved workflow contract; a fixed-template refresh alone does not
meet the requested seamless editing experience.

Serialize revision versus submission using the existing workspace lock. Only
unsubmitted work may receive a successor. Submitted, executing, uncertain or
completed work must resume its existing progress/reconciliation path, so editing
cannot silently create a duplicate external effect. A successor never inherits
execution approval and stale parent submission must refuse.

Required tests: same request ID returns the same successor; concurrent revisions
produce one current leaf; revision/submission races cannot execute both versions;
foreign owner/workspace, stale parent hash, revoked membership and changed source
refuse; submitted/uncertain revision attempts leave actions, reservations and
effects unchanged; reopen/reload displays known context without raw transcript;
real-model typed refinement leads to a new exact plan and fresh independent
approval; desktop and 390px layouts remain readable. None of these future
revision behaviors is yet implemented or accepted.

## Tenant boundary implementation requirements discovered October 10

Shared SQL credentials remain a measured cross-tenant gap. The planned boundary
must bind each runtime login to an owner-controlled workspace identity and enforce
both read and write isolation in PostgreSQL. A mutable `SET LOCAL org_id` under a
shared runtime role is not sufficient. No existing proof is relabeled as RLS proof.

Before applying row security, preserve global membership-existence refusal:
hiding a foreign member must not revive legacy token authority. An additive
migration must also replace the existing token-enrollment trigger's literal
`ll_runtime` classification so new scoped logins cannot mint operator keys.
Sessions, access throttling, SECURITY DEFINER functions, worker admission and
restore need explicit scoped-role adversarial tests. Owner migrations and runtime
credentials stay separate. This extends the enterprise goal; it is not replaced
by a dedicated-database-only pilot or a claimed completed tenant boundary.


## October 10 chat refinement increment — proved privately, not integrated

The existing bounded Bedrock planner was extended in an unapplied copy to draft a revised acknowledgement from ordinary language. Root ran an actual Nova Lite/browser proof: nine checks passed through typed initial request, natural-language follow-up, immutable linked successor, exact content review, review reset, malformed/non-owner refusal, superseded submission refusal, separate held actions, requesting-owner self-approval refusal and independent manager-approved local-twin execution. Seven source hashes were independently checked. Focused prototype tests: 71 passed; 390px browser layout had no overflow. No raw conversation or model credential was persisted.

Remaining before adoption: register a coherent additive migration and runtime privileges; prove edited-message requests in record-scoped Temporal routing; run the complete combined quality and operational gates; reduce verbose UI copy and observe independent usability. Actual model success in the local classic-worker sample does not prove hosted delivery, arbitrary workflow authoring, Tasklet parity or deployed readiness.
