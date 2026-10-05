# Bring an external agent into a bounded saved workflow

October 4, 2026. This is a two-effect workflow with a third verification step, not a general workflow builder, Temporal integration or live customer connector.

## What changed

The private `/control-plane/workflow-runs` workspace links two saved actions:

1. A scoped CRM agent proposes setting the sample contact lifecycle to customer.
2. A different scoped messaging agent proposes the fixed case-received acknowledgement.
3. A named operator verifies both external outcomes before marking the run completed.

Register dedicated CRM and messaging agents under Agents and boundaries. Start a run and select those agents. Enrollment restricts those identities to immutable workflow step IDs; standalone action requests, including ready requests created before enrollment, cannot execute. This restriction persists across runs; use dedicated agents. There is no unenrollment or automatic resume control in this release.

The server assigns the two action IDs and fixed payloads. Workflow creation uses a caller-supplied UUID idempotency key; identical enrollment replays return the same run, while changing agents under the same ID conflicts. Each agent can read and propose only its own step; it cannot approve, execute, list all runs or complete verification. The workspace also offers prepared submissions as the signed-in person, with attribution and independent approval.

Named approvals still bind exact requests, policy versions, source version where relevant and expiry. The existing execution endpoint checks run state and predecessor success/current authority inside the same transaction that claims dispatch. An unsubmitted, uncertain, conflicting, contained or revoked predecessor holds the message. The lower-level action route is not a bypass.

A run can be active, paused or completed. Waiting/recovery conditions are displayed from persisted action states. Pausing prevents new claims but does not recall in-flight effects. Paused runs intentionally cannot be resumed yet. Final verification reads both provider outcomes, rejects missing/conflicting evidence and checks current authority before completion.

## Setup and external integration

`pnpm connectors:setup` applies new migration 5 and grants restricted runtime access. Migrations 1–4 are unchanged. Start the private connector twin and the application normally.

After creating a run, use `scripts/workflow-agent.mjs` in a separate Node process. Set `LOOPLABS_AGENT_ORIGIN`, `LOOPLABS_RUN_ID` and `LOOPLABS_AGENT_KEY` in its private environment. Do not paste keys into a command history, screenshots, public docs or commits. Run the example once for each agent key. It calls the real workflow and action HTTP endpoints, prints only sanitized action IDs/states, and never receives provider credentials. Human reviewers then approve; a trusted worker or authorized operator executes. Replaying the script proposes the same action IDs without a second reservation.

This is a plain externally running agent integration example, not an LLM-powered autonomous agent. Generic MCP routing, read access enforcement, model execution, data-loss prevention, dynamic planning, parallel branches and parent/child delegation are not added here.

## Recorded proof

`pnpm connectors:proof` now additionally:

- starts a separate loopback HTTP process serving the actual Next route handlers;
- launches separate Node agent processes to retrieve and propose their own steps;
- refuses fresh action IDs that try to escape the enrolled manifest;
- refuses downstream execution through the lower-level action API;
- loses the actual twin response after committing the upstream effect;
- kills the HTTP process with SIGKILL, restarts it and checks persisted run state;
- replays agent submission without creating another upstream request;
- reconciles without resending, executes the message, then verifies both effects;
- refuses a stale approved CRM write after another run changes its source;
- refuses direct provider access using a LoopLabs agent key.

Existing proof also kills workers before/after an effect, restarts the twin and restores an isolated PostgreSQL snapshot. These are controlled fixtures over real HTTP and PostgreSQL. Sanitized results and source fingerprints are in `docs/evidence/connector-proof.json`. The harness is not a production HTTP server; production reverse-proxy behavior needs separate release checks.

## Guarantees and limits

The dependency gate uses the predecessor's latest recorded verified outcome, not an atomic snapshot of independent provider systems. Another actor can change an external record after verification; there is no cross-provider transaction or external fencing guarantee. CRM conditional writes are fixture extensions, not claimed live HubSpot behavior. Semantic duplicates across different run IDs are not detected. The sample email is not real delivery. An email or payment already sent cannot be rolled back by pausing or containment.

Migration, fixed-schema admission, tenant/identity checks and deterministic guards are implemented. This does not establish production availability, multi-tenant isolation review, managed credential rotation, general workflow orchestration or any regulated-industry certification. Live provider test accounts and operational acceptance remain required. No live provider was used for this proof.
