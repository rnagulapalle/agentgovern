# LoopLabs agent control plane

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
