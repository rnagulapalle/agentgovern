# AWS agent observation: first LoopLabs-side increment

October 14, 2026. Local, uncommitted implementation. Not deployed or connected to a production route. No external agent code was imported or modified. No execution, approvals or credential grants were added.

## Connection design

1. Read-only AWS discovery establishes the observed account/resource/version and identity references. Existing `cloud-discovery.ts` and `cloud-aws-cli.ts` remain unchanged.
2. An administrator reviews which tool source belongs to that runtime. An AWS account scan cannot infer this association from a shared gateway alone. MCP discovery is optional and requires a supported, authenticated transport; opaque HTTP agents remain unsupported for automatic tool listing.
3. New `cloud-tool-catalog.ts` accepts a server-owned tool-list transport and exact runtime/source binding. It collects only declared names, descriptions and bounded input/output schema snapshots, hashes descriptors, handles pagination/duplicates/deadlines and marks incomplete evidence partial. This is declaration observation, not schema conformance, identity authorization, imported business behavior or execution eligibility. The native authenticated MCP transport and its persistence/UI wiring are not implemented in this increment.
4. New `cloud-invocation-observation.ts` projects a narrow supported AWS APPLICATION_LOGS JSON shape. Exact enrolled account/resource references must match; raw request bodies, response bodies, arbitrary extensions and customer content are discarded. A projected event means only that an invocation was reported. It does not establish that a tool executed or that an external effect succeeded. Enrolled runtime version is explicitly distinguished from a log-attested version. Authenticating and pinning the AWS log source is the responsibility of the future production transport, not of this JSON projection.
5. Individual tool-call visibility requires emitted tool spans or a supported gateway integration. AWS invocation metrics or a log group alone cannot provide it. Enforcement still requires the separate mandatory tool checkpoint and bypass-denial proof.

## Measured checks

54 tests across `cloud-tool-catalog.test.ts`, existing `cloud-discovery.test.ts` and existing `cloud-aws-cli.test.ts` passed. Tests use synthetic protocol-shaped metadata/log inputs and mocked AWS CLI behavior. They cover partial/empty catalogs, opaque cursors, page bounds/cycles, duplicate names, descriptor drift, invalid schemas, timeouts, mutated/foreign runtime evidence, forged coverage, payload exclusion and malformed/non-string correlation IDs. These are local contract/regression checks, not native tool acceptance. Focused ESLint, TypeScript and diff checks are recorded separately. No full release gate or production browser acceptance is claimed.

## Read-only AWS observation

An isolated official boto3 SDK environment was used because the installed AWS CLI predates AgentCore. Existing account identity was verified. The default identity is root: it was used only for these read-only diagnostics and is not an acceptable deployed agent/connector identity.

In us-west-2, the bounded read-only inventory found one existing older LoopLabs pilot runtime, version 2, reported READY, with HTTP protocol. Its resource-specific CloudWatch log-group query found one group; a bounded event query returned no samples. The gateway-list query returned zero entries. These are API observations, not proof that no activity exists, no agents exist elsewhere, or that this is PR38's workflow. No runtime invocation, resource creation, policy update, message send or account configuration change occurred.

The deployment of the independent quote workflow has not been identified. Its runtime ARN or reviewed private endpoint/region is needed for native acceptance. The current older HTTP runtime does not establish a tools/list interface or tool telemetry.

## Next micro increments

- Install a server-owned authenticated transport for the selected deployed agent's actual tool source; do not let browser/model text select endpoints or credentials. Test real signed reads and revoked access.
- Add bounded AWS log/span polling with a durable cursor, deduplication and exact source binding, then an authenticated observed-activity read model. Test empty, delayed, duplicate and partial data without false success.
- Map real tool spans and verified descriptors to readable run activity. Keep agent-reported activity separate from executor-verified effects.
- Only then connect the enforcement/approval/continuation boundary; this module grants no authority and must not be used as an execution permit.

Primary references: [AWS runtime observability fields](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-runtime-metrics.html), [AWS observability setup](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/observability-configure.html), [MCP tool discovery](https://modelcontextprotocol.io/specification/2025-11-25/server/tools).

## V16 business declarations (local engineering, October 16)

The runtime detail projection now reads six explicit `WORKFLOW_*` labels:
metadata version, organization, owner organization, owner team, environment and
on-call status. It never returns the environment map or config-secret reference.
The discovery contract stores these in optional `declaredMetadata`, with its own
schema version and AWS-declaration provenance. Older observations remain valid.
Migration 30 adds a nullable, bounded declaration column to append-only runtime
observations. Install it through `scripts/cloud-runtime-metadata-setup.ts` with a
separate table-owner connection before refreshing deployments with metadata.
Existing migrations remain unchanged; the installer grants no new privileges.
An unmigrated installation refuses metadata-bearing scans instead of losing fields.

Company-assigned teams/purpose and the invited accountable owner remain separate.
AWS labels do not enroll a member, assign a company team or establish authority.
The agent summary and connection review display these labels with the discovered
runtime version; missing/invalid values remain unknown. Saved discovery must be
refreshed to obtain metadata from a newer deployment.

Read-only inspection of account 342206308838/us-west-2 found runtime V16 and
metadata version 3. A bounded last-24-hours business-event traversal returned 620
events for versions 12–15 and no V16 events. That read proves neither V16 business
amount/summary ingestion nor a new V16 Slack execution. Runtime labels alone do
not fill execution amounts or request text. Native inspection, parser projection,
PostgreSQL persistence, mounted UI tests and deployment are distinct evidence.

### SDK response correction

The first production verification of the V16 metadata release found that guided
AWS discovery uses native SDK details, while the initial mapping consumed only
the CLI-minimized `workflowMetadata` shape. The collector now selects the same six
explicit labels from SDK `environmentVariables` after matching account, ARN and
version. All other environment values remain discarded. A native JavaScript SDK
read through this collector measured V16's six declarations; that read is separate
from production persistence/rendering acceptance. Migration 30 is unchanged.
