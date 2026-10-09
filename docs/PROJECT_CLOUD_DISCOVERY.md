# Azure and Google read-only discovery candidate

The provider collectors in `lib/workspace/cloud-project-discovery.ts` are pure
read-only collection logic. They are not yet connected to administrator bindings or native scans in the
invited UI. Optional migration17 and the shared inventory store retain their
normalized evidence; a candidate UI saves scopes and reviews that evidence. They confer no execution authority.
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

- The Google HTTP transport candidate uses native Resource Manager project readback,
  fixed resource endpoints and one credential snapshot/shared15-second deadline
  per operation, including broker acquisition. Every operation verifies active
  project identity; responses are limited to1MiB and redirects are refused. Tests
  use controlled HTTP responses, not an authorized live cloud account.
- Connect that transport to an explicitly reviewed short-lived credential broker.
  A server-only Google file binding candidate now accepts only exact scope and
  short-lived session fields from an explicitly configured private regular file.
  It rereads scope and expiry before every operation. It neither acquires tokens
  nor identifies a workload principal. Native Resource Manager still verifies
  active project identity before inventory reads. No ambient login or planner
  fallback exists; this adapter is not connected to the workspace scan route.
  Tests use temporary files and controlled HTTP, not native cloud credentials.
- Add Azure's supported broker association and native project reads. Clients must
  not treat opaque Azure API access tokens as locally authoritative JWTs. Reference:
  [Microsoft client guidance](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation).
- Migration17 and persistence are verified against dedicated PostgreSQL fixtures;
  production installation remains open. Applied AWS migration16 is unchanged.
- The candidate provider selector exposes Azure/Google configuration and saved
  evidence review in the existing discovery page, with unknown authority and
  unavailable native scanning explicit. Exact-tree isolated CI run37970299556
  passed612 tests,19 actual gateway checks and21 browser checks; desktop/mobile
  captures and source/artifact hashes were reviewed. Project observations in
  that browser proof were normalized database fixtures, not native cloud reads.
  A subsequent credential-reader change requires a fresh browser proof.
- Prove actual native reads with explicitly authorized project bindings. Fixture
  tests do not establish live cloud access, federation or enforcement.
- Enroll accountable owners and workload attestation before joining a cloud agent
  to the mandatory gateway. Keep discovery and action approval separate.

No production migration, deployment, cloud mutation or credential acquisition is
performed by this candidate. Full regression validation remains required before
commit; public push and release gates remain unchanged.

Google project verification additionally requires `resourcemanager.projects.get`;
it does not establish the calling workload's principal or effective permissions.
Reference: [native project read](https://docs.cloud.google.com/resource-manager/reference/rest/v3/projects/get).

Private-file handling is shared with AWS: absolute path, final-component symlink
refusal, current process ownership, no group/other permissions, regular single-link
file,64KiB limit, full read and unchanged size/time checks. FIFO, malformed JSON,
traversal and missing files refuse with sanitized errors. Returning parsed unknown
is not credential validation; each provider separately validates exact scope,
contract and lifetime. Keep files out of Git, screenshots and browser requests.
