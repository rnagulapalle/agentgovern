# Azure and Google read-only discovery candidate

The provider collectors in `lib/workspace/cloud-project-discovery.ts` are pure
read-only collection logic. They are not yet connected to administrator bindings,
the durable inventory tables or the invited UI. They confer no execution authority.
The existing AWS collector, migration16 and control engine remain unchanged.

Azure collection uses an explicitly enrolled directory and Foundry project endpoint,
agent listing and bounded version listing/detail. Immutable agent versions are
retained as provider evidence; they do not establish a compatible LoopLabs worker.
Draft versions are refused. Principal, tools and effective permissions remain unknown.
Reference: [Microsoft agent versions](https://ai.azure.com/api-reference/agent-versions/list-agent-versions/).

Google collection requires an enrolled project ID, project number and location.
Resource names must match that scope. An explicitly returned same-project service
account is a declared reference, not validated permissions. Agent Identity is kept
distinct; an absent default principal is never invented. No execution version is
derived from updateTime or etag. References:
[Google resource](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.reasoningEngines),
[Google listing](https://docs.cloud.google.com/gemini-enterprise-agent-platform/reference/rest/v1/projects.locations.reasoningEngines/list).

Both collectors copy scope before asynchronous reads, require the trusted transport
to independently verify its configured scope, bound traversal to40 total page calls,
detect repeated tokens/resources, preserve valid listing evidence after detail
failure and exclude descriptions, prompts, metadata, environment values and raw tool
definitions. Partial collection must never authorize removal or enrollment. API
traversal completeness means only that these bounded reads completed successfully.

## Remaining integration and proof

- Add reviewed read-only HTTP transports with short-lived credentials, verified
  scope, fixed endpoints, response bounds, deadlines and refusal of redirects.
- Add a new provider-specific persistence migration; do not reinterpret or edit
  applied AWS migration16. Retain prior observations through partial/empty scans.
- Extend existing connection and inventory review UX; surface evidence gaps first.
- Prove actual native reads with explicitly authorized project bindings. Fixture
  tests do not establish live cloud access, federation or enforcement.
- Enroll accountable owners and workload attestation before joining a cloud agent
  to the mandatory gateway. Keep discovery and action approval separate.

No production migration, deployment, cloud mutation or credential acquisition is
performed by this candidate. Full regression validation remains required before
commit; public push and release gates remain unchanged.
