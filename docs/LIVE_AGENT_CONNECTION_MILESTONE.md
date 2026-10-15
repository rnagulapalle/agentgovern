# Milestone: live observation connection and execution checkpoint

October 14, 2026. Status: partial local implementation, uncommitted and not deployed. The external AWS workflow is built/hardened/deployed independently by Raj/Claude. PR38 is a reference customer workload, not code to copy into LoopLabs. This milestone owns only the LoopLabs connection, observation and execution-control integration.

## Acceptance boundary

An independently deployed AWS agent can be connected without moving its workflow into LoopLabs. Available metadata is synchronized; a real triggered run is observed; a selected sensitive action cannot execute without current LoopLabs authorization; held actions wait for a valid independent decision; continuation returns a verified result to the external runtime. The runtime's business logic stays external. No claim of full enforcement until bypass attempts fail under the actual deployed identities and tool paths.

## Small increments

| ID | Deliverable | Current evidence / remaining |
| --- | --- | --- |
| L1 | Metadata and observation projection | Local declared-tool catalog and payload-free invocation projection; original 54-test receipt retained separately. No native authenticated MCP transport. |
| L2 | Bounded AWS observation reader | Local `cloud-invocation-reader.ts`, `awsCliInvocationApi` and `cloudObservationBinding`; validates account/source/time window, private credential binding and paging; strips raw payloads. Production route, durable cursor/event storage and UI not wired. |
| L3 | Checkpoint-facing adapter | Local `LoopLabsToolCheckpoint` uses existing proposal/read controls. Explicitly returns held/pending/executing/action-verified/uncertain/review/rejected/cancelled. It cannot approve, execute, grant a permit or complete a workflow. Currently supports only the existing CRM/email sample payload contracts; real pricing and HubSpot request/verification contracts remain unsupported. |
| L4 | Installed read model | Pending: authenticated activity endpoint/store, durable deduplication and polling overlap for delayed logs, readable timeline and source freshness. Empty logs must not imply idle, safe or completed. |
| L5 | Real external action integration | Pending: reviewed AWS agent identity/tool-source binding and a pricing/CRM adapter delegating to existing authority. Current authorization recheck, source safety, dispatch/lease/outbox and effect lookup must be established for the provider. No direct ungoverned write/send credentials in the protected agent path. |
| L6 | Native acceptance | Pending external deployment: real Slack/Gmail trigger, real observed activity, 14% held under configured 10% authority, independent decision, automatic external continuation and authoritative effect/output verification. Reject expired/changed requests; test restart/lost response and direct bypass. |

A passing local adapter test is not native acceptance. L2 does not establish a live subscription. L3 is not a generic arbitrary-tool endpoint and not itself a deployment enforcement boundary. The actual existing server controls remain the authority; no second policy/state engine was added.

## Current-source verification

`pnpm exec vitest run` over the eight affected files passed **99 tests**:

- `lib/workspace/cloud-invocation-reader.test.ts`
- `lib/workspace/cloud-tool-catalog.test.ts`
- `lib/workspace/cloud-discovery.test.ts`
- `lib/workspace/cloud-aws-cli.test.ts`
- `lib/workspace/cloud-aws-cli-process.test.ts`
- `lib/workspace/cloud-binding.test.ts`
- `lib/connectors/tool-checkpoint.test.ts`
- `lib/connectors/tool-client.test.ts`

Includes real loopback HTTP and isolated child processes, with synthetic server responses/credentials and no live provider mutations. Coverage includes held/pending states, changed action binding, denied/unavailable server, no automatic resend, malformed pages/events, duplicate and conflicting event identity, cursor bounds, invalid windows, foreign sources/accounts, private-file/session drift and payload exclusion. Initial combined run had one malformed-page classification failure; implementation corrected, failed log preserved. Focused ESLint and TypeScript passed. Build result is recorded separately. Full quality/release eligibility is not established by this focused run; historical full-suite failures remain unchanged.

Private receipts: `.local/aws-connector/live-checkpoint-20261014/`. Actual read-only AWS discovery from the preceding increment remains in `.local/aws-connector/observation-20261014/`, not merged into a native execution proof. No live AWS agents were invoked, no tools were executed, no credentials issued and no public endpoints enabled in this increment.

## External handoff needed later

When the external workflow is deployed, obtain its account/region/runtime ARN or reviewed private endpoint, supported protocol, tool metadata source, telemetry destination and continuation contract. This is interface information, not a request for secrets in chat. Confirm whether it exposes MCP or another explicit interface; generic HTTP hosting does not imply tools/list or tool telemetry. Scope observation credentials to required reads and enrollment. Execution credentials belong to the separately reviewed controlled path, not to the observation connection. Gmail/Slack/HubSpot business credentials remain with the externally owned installation unless a reviewed connector requires a different custody model.

## Documentation alignment

Microsoft Connected Platforms describes registry synchronization separately from telemetry and code-level integration. That distinction informs our design; it does not require copying or hosting an external workflow. We use Connect → synchronize metadata → observe exposed activity → separately configure and verify execution enforcement. Sources: [Microsoft Connected Platforms](https://learn.microsoft.com/en-us/microsoft-agent-365/admin/connected-platforms), [AWS runtime log/span fields](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-runtime-metrics.html). These references do not establish LoopLabs implementation acceptance.
