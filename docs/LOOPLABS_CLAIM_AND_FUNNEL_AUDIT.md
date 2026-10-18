# LoopLabs claim, demo, and funnel audit

## October 8: selected-record chat in staging

The invited fixed acknowledgement now has local browser/package proof from selected enrolled test record and typed prompt through exact saved plan, explicit agent grants, held actions, independent approvals, durable scheduling and verified twin effects. Saved API contexts and message cards preserve the original destination. Two records complete across worker crash/app restart and a lost CRM response with four intended effects and no resend. See `SCOPED_CHAT_EXPERIENCE.md`. This is not a production cutover, arbitrary workflow builder, live integration, complete tenant/HA acceptance or enterprise SLA. Public claims must retain those limits.

## October 6: bounded chat rehearsal

The invited `/control-plane/work` now interprets typed requests through Amazon Bedrock and asks for missing sample details. It saves a canonical CRM-to-acknowledgement plan for review using the existing server controls. Review never approves execution. Only isolated private FetchSandbox twins execute; no real email, live CRM, general workflow generation, inbox listener or durable chat memory is enabled. Hosted CRM dispatch remains blocked because atomic contact-version enforcement is unavailable. See [CHAT_WORKFLOW_PROOF.md](CHAT_WORKFLOW_PROOF.md) for actual browser proof. This supersedes older no-model statements only for the narrow chat planner; original demos retain their earlier scope.

## Current private workspace (October 4, 2026)

See [WORKSPACE_ACCESS.md](WORKSPACE_ACCESS.md) for the current sales and access journey. `/control-plane` is invitation-only. Raj and Pratibha sign in as separate named members at `/sign-in`; anonymous visitors see the overview and contact-sales path. The Actions page combines discount and refund views. Saved agent registration supports restricted discount, CRM and messaging roles over sample systems; the prepared refund agent retains its own boundary. See `CONNECTOR_VERIFICATION.md` for the private FetchSandbox CRM/messaging contracts and recorded failure proof. Other examples remain browser-local. No live customer systems, real payments, model execution or general workflow builder are connected. This section supersedes earlier references to a public tour and shared operator-token entry forms.


Date: 2026-09-30

## October 3: separate durable foundation

`/control-plane/durable` now demonstrates server-side enforcement for one
controlled PostgreSQL test-record operation: scoped authentication, exact-payload
approvals, persisted leases, unique effects, uncertain-outcome reconciliation,
and contained version-safe compensation. Audit events persist with runtime write
restrictions; they are not cryptographically signed. The original tour remains
browser-local. No external CRM, restaurant, email, payment, model gateway,
general workflow builder, or industry-grade availability claim is established.
See `DURABLE_CONTROL_PLANE.md` for the contract, gaps, and stakeholder test guide.

## October 3: FetchSandbox refund proof

`/control-plane/refunds` uses persisted agent permissions, amount/budget checks,
exact approvals, and a trusted HTTP adapter to a dedicated local FetchSandbox
Stripe engine. The prepared payment and provider refunds are simulated; the
LoopLabs state and HTTP boundary are real. A lost response after a twin write
can be reconciled without a second refund. The refund-only fixture adds
documented idempotency and balance behavior; full Stripe parity, live billing,
model-driven reasoning, arbitrary customer onboarding, and production reliability
are not established. See `REFUND_AGENT_PROOF.md`.

## Executive assessment

LoopLabs has a clear and valuable product thesis: agent adoption becomes a production systems problem when agents can send, write, pay, delete, delegate, or expose output. The strongest product story is the closed control loop: identify the agent, evaluate a proposed action, supervise the execution, inspect the output, and recover affected state.

The current control-plane tour is a credible interactive prototype of that loop. It is useful for customer discovery and a Product Hunt launch because visitors can change state and see deterministic outcomes. It is not yet evidence of a production control plane. The tour does not connect to a model, credential broker, business-system executor, durable audit store, or cryptographic receipt service.

The largest messaging risk was the phrase “build workflows.” Today, early-access workflow design is a guided service and the tour operates on a prepared renewal workflow. The public copy now states that distinction directly.

## Claim-to-proof matrix

| Public claim | What a visitor can prove in the tour | Assessment |
| --- | --- | --- |
| Give every agent an owner, role, tools, model tier, and budget | The agent onboarding form validates role, delegated scope, tools, model tier, owner, and budget, then saves the agent in browser state | Demonstrated in the prototype |
| Control agent actions | A deterministic policy engine returns allow, hold, or block from discount authority, source freshness, capability, and budget inputs | Demonstrated in the prototype |
| Supervise execution and handoffs | Runs show assigned agents, steps, decisions, and status; a visitor can terminate a run or pause an agent | Demonstrated with prepared sample runs |
| Hold risky work for approval | A discount above delegated authority creates a pending approval that can be approved or rejected | Demonstrated in the prototype |
| Check outputs | The output playground passes clean text, redacts email-shaped text, and blocks SSN-shaped text | Demonstrated, with a deliberately narrow pattern checker |
| Recover affected state | A visitor can isolate the agent, preview a compensating change, and restore a sample CRM record only when its version matches | Demonstrated over local sample state |
| Audit every decision | State changes add browser-local audit events and the visitor can export JSON | Demonstrated locally; no durable or append-only backend |
| Control model access and spend | The UI models tiers, role entitlements, budgets, and route metadata | Represented; no live model gateway request in the tour |
| Build one-agent and multi-agent workflows | The tour shows a prepared multi-agent renewal topology and onboarding/configuration | Partly represented; no self-serve workflow builder |
| Choose a narrow workflow and understand its onboarding requirements | The workflow library shows prepared personal, real-estate, RevOps, customer-operations, and finance examples with triggers, systems, control points, monitoring needs, and a five-step launch path | Demonstrated as product guidance; live connectors and self-service building remain product direction |
| Sit between agents and production systems | The architecture and decision boundary are shown | Product direction; no production connector or credential broker in the tour |
| Work across Copilot, ChatGPT, Gemini, Agentforce, and custom agents | The control model is provider-neutral | Product direction; each provider still needs an integration |
| Produce signed receipts and immutable evidence | The legacy demo produced a deterministic browser checksum | Not demonstrated. Copy and labels were corrected; production requires real cryptographic signing and durable storage |

## Changes made from this audit

1. Added a visible four-step guided tour on the control-plane overview:
   - set agent access;
   - run the prepared workflow;
   - review an action and output decision;
   - contain and recover sample state.
2. Added an explicit scope statement beside the tour. It names what executes locally and what is not connected.
3. Changed workflow language to explain that early access is guided implementation and that the tour is not a drag-and-drop builder.
4. Changed recovery language from “failed state” to “affected state,” because not every failure is reversible.
5. Removed misleading `ed25519` and production labels from the legacy demo. Its hash is now described as a deterministic demo checksum.
6. Added PostHog events for acquisition, tour entry, meaningful product actions, recovery, audit export, and founder-conversation intent.
7. Added an execution-integrity analytics concept to the isolated AgentGovern
   review environment. It shows illustrative sample metrics for evaluated,
   held, blocked, and uncertain actions, links the attention queue to the
   recovery tour, and visibly states that it is not production telemetry.
8. Added a workflow library to the product tour. It separates personal teaching
   examples from the enterprise ICP, provides connect-existing and guided-launch
   paths, and makes the current prepared-demo versus future self-service boundary
   explicit.

## Investor view

### What works

- The wedge is understandable: teams need authority and recovery once agents touch systems of record.
- The demo spans prevention and recovery. Most guardrail products stop at prompt filtering or allow/block decisions.
- The identity, action, execution, output, and recovery taxonomy is coherent enough to become a platform model.
- The sample renewal workflow makes policy thresholds and human approval concrete.

### What will be challenged in diligence

- Where exactly is the enforcement point, and can an agent bypass it?
- Which production system or model gateway is connected today?
- Are credentials isolated from agents, and are effects idempotent?
- Is the audit evidence durable and cryptographically verifiable?
- Can recovery handle concurrent writes and irreversible effects?
- Is workflow automation a product surface or a founder-led implementation service?

### Recommended next proof

Build one narrow production-shaped vertical slice before expanding the visual workflow builder:

1. A real agent or gateway submits an action request.
2. LoopLabs evaluates identity, capability, and one business policy server-side.
3. An action broker holds or executes one reversible operation against a test CRM or purpose-built system.
4. The system stores an append-only action receipt with a real SHA-256 digest and service signature.
5. A recovery operation uses idempotency and record-version checks.
6. The existing UI reads that evidence instead of manufacturing it in browser state.

That slice would turn the current product story from “well-designed control-plane prototype” into “working enforcement architecture.”

## Funnel design

The analytics model separates passive traffic from product proof:

1. `site_page_viewed`
2. `product_tour_cta_clicked`
3. `product_tour_started`
4. `run_simulated`
5. `recovery_step_completed`
6. `demo_booking_clicked`

Supporting proof events:

- `tour_section_viewed`
- `agent_onboarded`
- `approval_decided`
- `output_evaluated`
- `audit_exported`
- `policy_updated`
- `run_terminated`

Acquisition properties:

- `acquisition_channel`
- `referrer_host`
- `search_engine`
- `social_network`
- `landing_path`
- `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`
- first-touch versions of channel, referrer, landing path, source, and campaign

Search engines usually do not expose the visitor's search query in the referrer. `utm_term` is available for campaigns that supply it. Google Search Console remains the source for organic queries and impressions; PostHog explains what those visitors do after arrival.

## Privacy and lead identity

PostHog visitors remain anonymous until the product has a legitimate identifier from an explicit conversion. Session replay masks all form inputs. The system must not attempt to deanonymize visitors or collect email addresses from browsing behavior.

To contact an interested visitor, use an explicit conversion such as a Cal.com booking or a short “request early access” form with clear consent. The current funnel measures the booking click. A completed-booking webhook should become the authoritative `demo_booked` conversion when Cal.com is connected.

## PostHog configuration

- Project: `LoopLabs` (`638636`)
- Dashboard: `LoopLabs Growth & Activation` (`2155825`)
- Test traffic is tagged with `$is_test = true` and excluded from saved insights.
- PostHog requests use the first-party `/ph` proxy to reduce tracker-blocker loss.
- Session replay masks input values.

Saved insights:

- Visitor to product proof
- Visitor to founder conversation
- Acquisition channels
- Landing pages
- Product tour sections
- Proof interactions
- Calls to action
- Referring sites
- Visitor geography
- Device mix

## Quality checks

- 30 unit tests pass.
- The production build passes for all 57 generated routes.
- 41 sitemap/product pages and 44 internal links were requested locally with no errors.
- Test events were observed in the LoopLabs PostHog project through the first-party proxy.
