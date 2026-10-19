## Exact approval reference correlation (October 18)

An execution's reported approval IDs now constrain its review panel and business
impact readback, in addition to the existing saved deployment/version and run ID.
When one reported ID exists, a different approval on the same run cannot supply
reviewer/value evidence or appear as its review target. Multiple reported requests
remain separate review records; the business summary does not select one arbitrarily.
Legacy histories with no approval ID retain unique-run matching, and ambiguity
remains unavailable. This changes presentation correlation, not server approval
permissions, revision checks or external compare-and-set behavior.

Historical recovery remains a workflow contract gap: the signed bridge supports a
bounded list, without guaranteed historical request lookup or retention. An
approval event can remain visible while its record is absent from that list. No
record means the reviewer/value readback is unavailable, not that approval was
undone. A future historical lookup must bind tenant, deployment version, run and
approval ID, return a signed retained record with policy/revision/decision identity
and time, and never make a finalized request actionable again. No such endpoint,
retention guarantee or workflow producer change is implemented by this patch.

## Policy and reviewer evidence presentation (October 18, local patch)

The execution timeline presents the workflow's `policy.evaluated` fields: requested
percentage, approval threshold, decline threshold, rule ID/version and reported
decision. Missing fields remain “Not reported”; this is neither an enumeration of
all internal checks nor independent enforcement evidence. AWS runtime inventory
cannot supply these business rules on its own. Additional per-rule evaluations
would require a reviewed workflow event contract and producer instrumentation.

A uniquely matched shared approval record supplies policy version, requester,
`decidedBy` and `decidedAt`. Neither agent ownership nor the eligible-reviewer list
is substituted for the actual decision maker. No matching record means reviewer
and saved decision unavailable, even when history reports an approval. The review
panel separates proposed change, decision/reviewer, and connection rules. This
presentation patch changes no approval authority, bridge command or workflow.
It has not established deployed acceptance or historical record recovery.

## CIO fleet visibility patch (October 17, candidate)

Cloud business declarations now retain explicit owner, department and purpose through additive migration 31. Existing migration 30 is unchanged. Source labels participate in dashboard grouping and filters; saved company assignments override them. These are display labels, not company membership or approval grants. The dashboard reads every deployment returned in saved inventory rather than selecting the first three or five, and keeps incomplete approval coverage distinct from zero.

Execution approval navigation requires one reported version and a matching saved deployment reference. Unknown, mixed or ambiguous versions do not receive approval controls. A configured v15 approval connection does not authorize v16. Business impact is read from a unique matching approval record; missing request text and unrelated provider effects are not invented.

Agent setup and Activity use distinct embedded views. Source history remains an on-demand, workflow-reported read, not independently verified delivery or mandatory execution enforcement. Refreshing the dashboard does not discover new AWS deployments: discovery must be refreshed separately. Native production acceptance and release receipts are recorded outside this architecture note; this candidate section alone is not evidence of deployment.

## Local quote status presentation (P1b, October 13)

The quote workspace separates the retained result at completion, the latest server
check, and permission for further actions. A correlated completed run keeps its
historical step labels when current verification is unknown or conflicts. The UI
never infers that a generic conflict specifically means approval expiry or provider
drift. A completed run's “Recheck current status” resolves saved state and requests
the read-only verification view; it does not reapprove, resend, or issue another
final-verification mutation. Initial final verification still uses the existing
verification operation. Server authorization and expiry checks are unchanged.

Presentation tests cover missing/mismatched receipts, held and uncertain actions,
and mounted desktop/mobile status refresh. A SQL metadata fixture checks receipt
retention separately from a native twin integration that executes and verifies both
effects before advancing the application clock past approval expiry. That integration
checks one retained receipt, refusal of fresh final verification, and unchanged
provider effect counts after repeated execution attempts. Neither proves live delivery.
These local changes do not establish deployed browser acceptance.

## October 8 staged server workflow increment

The earlier architecture below describes the original browser-local examples. The invited server workspace now adds PostgreSQL-backed scoped identity/policy/approval/lease/effect controls and isolated Temporal adoption. See `TEMPORAL_ADOPTION_PLAN.md`, `PERSISTED_PROPOSAL_BOUNDARIES.md`, `PERSISTED_RECORD_GRANTS.md`, `SCOPED_TEMPORAL_ROUTING.md` and `SCOPED_CHAT_EXPERIENCE.md` for current contracts and measured proof.

Typed chat interpretation remains bounded to the fixed acknowledgement graph. An exact saved plan captures record/recipient/request/source/policy versions. Explicit record grants select existing agents; independent approvals bind their actual action payloads. A leased scheduling outbox freezes one-way execution ownership and a compatible content-bound worker build. Temporal provides durable scheduling/history, while application controls recheck current authorization, dependencies and observed effects. Unknown outcomes reconcile rather than resend. No model grants execution authority; no browser selection changes saved destinations.

The current-source local browser/package proof does not establish production cutover, live connector safety, arbitrary workflow generation, complete tenant isolation, HA/SLA or Temporal superiority. `ENTERPRISE_ACCEPTANCE.md` defines remaining acceptance.

# LoopLabs agent control plane

## Managed acknowledgement experience (October 6)

See [ENQUIRY_MANAGED_EXPERIENCE.md](ENQUIRY_MANAGED_EXPERIENCE.md) for automatic scoped-assistant assignment, inline approval cards and a separate background runner. Migration 8 adds explicit background consent and worker heartbeat/cursor. The hosted CRM guarantee remains blocked; no live inbox listener, real delivery or broad Tasklet parity is claimed.

## Bounded external-agent workflow (October 4)

The private `/control-plane/workflow-runs` route links a CRM update, a held customer acknowledgement and final outcome verification. External scoped agents can submit their own immutable steps over HTTP; PostgreSQL preserves run dependencies. See [WORKFLOW_ONBOARDING_PROOF.md](WORKFLOW_ONBOARDING_PROOF.md) for migration 5, proof and limitations. This is not general workflow onboarding or live-provider support.

## Current private workspace (October 4, 2026)

See [WORKSPACE_ACCESS.md](WORKSPACE_ACCESS.md) for the current sales and access journey. `/control-plane` is invitation-only. Raj and Pratibha sign in as separate named members at `/sign-in`; anonymous visitors see the overview and contact-sales path. The Actions page combines discount and refund views. Saved agent registration supports restricted discount, CRM and messaging roles over sample systems; the prepared refund agent retains its own boundary. See `CONNECTOR_VERIFICATION.md` for the private FetchSandbox CRM/messaging contracts and recorded failure proof. Other examples remain browser-local. No live customer systems, real payments, model execution or general workflow builder are connected. This section supersedes earlier references to a public tour and shared operator-token entry forms.


## Server-backed foundation (October 3, 2026)

The separate `/control-plane/durable` route now uses PostgreSQL-backed actions,
authenticated access, exact-payload approvals, leases, effect lookup, and
version-safe compensation for a controlled test-record connector. See
[the durable architecture and testing guide](DURABLE_CONTROL_PLANE.md).
The boundaries below describe the original browser-local tour; they do not
establish external integrations or industry-grade reliability.

The application lives at `/control-plane` in the existing Next.js / Tailwind project. The public website and original scenario demo remain available. The homepage now links to the unified workspace.

## Refund agent proof

`/control-plane/refunds` adds a separate persisted refund action state machine
and scoped agent against a local FetchSandbox Stripe payment twin. No actual
payment provider or model is called. See `REFUND_AGENT_PROOF.md` for its failure
proofs, permission boundary, setup, and deliberate limits.

## Run locally

```sh
pnpm install
pnpm dev
# http://localhost:3007/control-plane
```

## What is implemented

- Agent registration with unique identity, accountable owner, team, role, model tier, explicit tool permissions, and a model budget.
- Parent / child delegation with role and parent scope checks. Suspending or isolating a parent suspends descendants and invalidates pending work.
- Execution traces, human approval, rejection, termination, and downloadable sandbox records.
- Existing deterministic action engine integration for send permission, discount thresholds, and source-record freshness.
- Versioned policy thresholds. Changing a policy invalidates pending proposals.
- Central model catalog and agent budget management based on the gateway-poc tier configuration.
- Output playground: email pattern redaction and SSN-shaped pattern refusal. Raw sensitive playground input is not persisted.
- Recovery workflow: contain, prepare a dry-run plan, compare the current record against the observed version and fields, then restore approved fields as a new version. Concurrent changes and non-reversible effects are refused.
- Shared audit events, search, filters, JSON exports, responsive navigation, keyboard-accessible dialogs, and browser persistence.

## Implementation boundaries

This is a local product sandbox, not a production enforcement service. There are no real LLM calls, business-system writes, credentials, authenticated approval identities, or live gateway connections. The multi-agent trace is seeded sample data; the run playground evaluates a single proposed action. Budgets and model costs are simulated; budget periods do not reset automatically.

`lib/control-plane/model.ts` owns the typed state and pure state transitions. `components/control-plane/provider.tsx` persists them under `looplabs.control-plane.v1` in localStorage, importing existing `agentgovern.control-plane.v1` state when the new key is absent. Components only dispatch actions. The reducer calls `lib/engine/evaluate.ts` for action-policy decisions. Browser data is mutable and is neither an immutable audit ledger nor a security boundary.

The product is branded LoopLabs and its canonical URL is `https://looplabs.run`. The source, metadata, and deployment configuration use this domain; DNS and live deployment are separate operations. Existing demo routes and media filenames remain stable for compatibility.

Earlier architecture references mention a separate Python gateway proof of concept. `gateway-poc` is not present in this checkout and is not integrated with either workspace. Its implementation and operation are not established by this repository's checks.

## Production integration

Keep the Next.js interface and move the state transitions behind authenticated server endpoints. Use stable organization, human, agent, parent-agent, run, proposal, policy-version, and request IDs across the control plane and Python gateway.

1. **Identity:** verify issuer-scoped human / workload identity server-side; store agent grants and parent relationships; enforce revocation at each request and tool boundary.
2. **Model access:** have the Python gateway resolve agent-specific model entitlements and budgets from the shared control-plane store. Canonicalize aliases; recheck resolved fallback models; reserve concurrent spend atomically.
3. **Actions:** require a structured proposal, trusted source evidence, and an exact payload digest. An authorized approval must bind that digest, policy version, and expiry. Revalidate state before execution.
4. **Execution:** use a credential broker and idempotent tool adapters. An agent must not hold a bypass credential to protected business systems. Propagate scoped delegation and cancellation through the run tree.
5. **Outputs:** apply comprehensive policy checks across text, structured tool results, streaming chunks, and supported media before release. The local pattern checker is only a demonstration.
6. **Recovery:** capture verified effects and versioned snapshots. Use compare-and-swap and domain-specific compensating actions. Irreversible effects require manual handling.
7. **Evidence:** write durable append-only events; sign complete decision and execution receipts server-side; link model calls, approvals, tool effects, and recovery by run ID.

## Design

Reference inspected: https://www.runlayer.com/ (September 29, 2026). The app adopts the reference's warm off-white (`#f5f5f4`), charcoal (`#1c1917`), thin stone borders, square controls, generous spacing, and restrained line art. It uses the project's bundled Geist family; Runlayer's KH Teka font and branded assets are not included. Styling is scoped to `.cp-app` to preserve the existing website and demo.

The landing page was redesigned on September 30 using the same reference: a split hero, original animated SVG line artwork, bordered feature rows, and interactive product previews. `app/landing.css` is scoped to `.ll-landing`. The animation has a pause control and respects reduced-motion preferences. Booking links lead to the existing founder calendar; product links open the working sandbox.

The product vocabulary is shared between the landing page and workspace navigation:

- **Action controls:** permissions and policy checks before a proposed operation runs.
- **Execution controls:** the complete run, its steps, agent handoffs, holds, and termination.
- **Output controls:** checks before releasing a result, including the sandbox's pattern-based redaction and blocking.
- **Recovery:** isolate the agent, review affected state, and restore reversible fields with a version check.
- **Agent identity and model gateway:** the owner, role, tool access, model access, and budget that support those controls.

Terminology research distinguished a proposed tool action from its containing execution using [LangChain's human-in-the-loop documentation](https://github.com/langchain-ai/docs/blob/main/src/oss/langchain/human-in-the-loop.mdx) and request/response inspection using [agentgateway's CEL reference](https://agentgateway.dev/docs/standalone/latest/reference/cel/cel-context/). These are design references, not new integrations or production guarantees.

## Verification

```sh
pnpm test
pnpm exec tsc --noEmit
pnpm build
```

The control-plane tests cover the allow / approval / block boundary, tool and role restrictions, budget refusal, cascading suspension, approval replay, policy invalidation, containment, version-safe recovery, concurrent-write protection, irreversible effects, and sensitive-output persistence.

## Company workflow catalog and explicit AWS synchronization

The Agents view separates company-declared business workflows, internal agent
roles and supporting operator runtimes. Connections accepts a bounded deployment
inventory file, parses it locally and transmits only workflow identity/version,
name, owner/team/department, purpose and role names. Raw environment variables,
input schemas, commands and credentials are not imported. These declarations are
business metadata, never enrollment, membership, approval or execution authority.
Changed declarations must match this company's current observed runtime/version
in a scan less than15minutes old. Existing declarations survive unrelated directory
edits; a different runtime version shows missing definitions rather than reusing
an old role inventory. Imported definitions use the existing revision-checked
company directory; no migration or new database grant is added.

The dashboard exposes last AWS scan time/completeness and an explicit scan action.
The AWS setup's previous “Refresh agent list” reread saved evidence; the corrected
“Scan AWS for updates” invokes the existing scoped scan. Ordinary page refresh
still reads saved evidence and never invokes agents. Runtime READY, declared roles,
confirmed ownership, approval integration and observed effects remain separate.

A rescan does not copy an older version's history or approval connection into a
new deployment version. When no history source has been read in the selected
scope, Recent business requests is unknown, not zero. Existing saved history and
version-scoped approvals remain separate from the current declaration catalog.

History reads now show the enrolled deployment version, the number of supported
events reporting that version, and every version reported in the selected read.
Events from other versions remain visible as retained history; they do not verify
activity for the enrolled deployment. These labels use workflow-reported versions,
not independent runtime attestation. Empty and partial reads preserve their
existing uncertainty notices. No approval or execution authority changes.
