# Scoped connector tool client candidate

October 9, 2026. `LoopLabsToolClient` is a server-side integration adapter for the
existing `/api/durable/connectors` API. It is not a new execution engine, provider
proxy, deployed sidecar, federation implementation or mandatory network boundary.
Production remains unchanged.

A registered agent uses its own key to propose the prepared CRM lifecycle or
case-received message and read its own saved action. The client fixes agent
identity at construction; plans, action IDs, approval and provider routing remain
owned by the existing controls. For workflow-enrolled identities, the caller must
use the existing enrolled step action ID and payload. An arbitrary new UUID is
refused by the server. Never generate a new ID to recover a lost response.

```ts
const tools = new LoopLabsToolClient(
  "https://looplabs.run",
  "customer-ops-agent",
  async () => readThisWorkloadsPrivateAgentCredential(),
);
await tools.propose({
  actionId: enrolledStep.actionId,
  connector: "crm",
  payload: { lifecycle: "customer" },
});
const decision = await tools.read(enrolledStep.actionId);
```

The credential callback above is application-owned; no credential broker is
implemented by this example. Keep operator, worker, database and downstream
credentials outside the agent process and out of public browser bundles. Agent
keys currently use LoopLabs registration, not cloud-attested workload federation.

The client has no approve, execute, contain or configure operation. Independent
named approval and trusted executor dispatch remain server responsibilities.
A `ready` state means approval is recorded; it is not evidence that an agent may
make a provider request. A `succeeded` state is reported saved state, not a new
independent effect verification receipt.

HTTPS is required except explicit loopback development origins. Credential-bearing
URLs, paths, query strings, fragments, malformed identity and unbounded timeouts
refuse. Credentials are refreshed through the callback per request. Redirects
refuse rather than moving bearer credentials to another endpoint. Request and
response waits have a bounded deadline; responses are stream-bounded to 64 KiB.
Only matching action/agent/connector, known state and hash fields are returned.
Raw response errors, lease tokens and provider data are not exposed by this client.

There is no automatic resend or polling. A disconnect, timeout, redirect,
malformed/mismatched result or server outage is **unconfirmed**, because the
server might already have persisted the action. Read saved state before an
explicit same-ID retry. A 4xx response is **refused**; inspect saved state before
changing the request or recovering a prior uncertain attempt. Invalid credentials
fail before HTTP. No late HTTP call is made after credential acquisition times out.

## Measured scope

Four tests use actual loopback HTTP to check exact immutable envelopes, explicit
same-ID retry, minimal decision projection, redirect refusal, denial/outage,
malformed/oversized/mismatched responses, missing/rejected credentials and delayed
credential/request deadlines. The existing route suite additionally serves the
actual Next connector handlers over HTTP with real isolated PostgreSQL. It enrolls
a fixed workflow, drops a response after a saved proposal, reads and repeats the
same action, proves one stored action and one allowance reservation, refuses changed same-ID payload, agent approval/execution/containment
and identity substitution, records separate operator approval without any connector write and refuses a
revoked key. Its provider is a stub: it does not establish actual external effects.

Before an integration may be called enforced, separately prove the actual
agent/gateway/executor/provider deployment: no agent-held provider credential,
actual direct-request denial, no effects on blocked paths, current workload
identity checks, independent approvals, outage containment, restart and observed
provider effects. A voluntary SDK wrapper alone cannot prevent bypass. See
`CLOUD_AGENT_DISCOVERY_AND_ENFORCEMENT.md` and `ENTERPRISE_PILOT_GAP_REVIEW.md`.
