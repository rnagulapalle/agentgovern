# Quote-agent PR 38: reuse and LoopLabs integration review

Reviewed October 14, 2026. PR: https://github.com/fetchsandbox/playground/pull/38 . Pinned head: `bf49e06f0693de2bf989c63563c1cda1aad2b5db`. Review only: no PR comments, edits, merge, deployment or live messages. This is a candidate external agent for the AWS pilot, not a second LoopLabs workflow implementation.

## Measured results

- Existing suite: **39 passed**, `python3 -m pytest -q tests`, before adding independent probes. Providers are `httpx.MockTransport` fakes; no actual HubSpot/Slack/Gmail/model calls occurred.
- Six independent desired-contract probes: **6 failed**, exit 1. These are not original-suite regressions. They identify differences from the agreed LoopLabs acceptance. Probe code/logs and receipt are retained privately alongside this review.
- README claims prior hosted HubSpot/Slack sandbox runs, but explicitly says Deals API was unavailable and deal writes were tested with fakes. Gmail live API acceptance is explicitly absent. Those historical external claims were not independently verified here.
- GitHub PR check rollup was empty when read. No hosted CI pass is asserted.

## Findings

| Priority | Finding and concrete consequence | Evidence |
| --- | --- | --- |
| P1 | Run and quote inspection endpoints have no authentication. An internet-exposed deployment would return persisted customer messages, email addresses and quote data to unauthenticated requests. | `quote_agent/app.py:113-133`; independent unauthenticated `/runs` probe returns 200 rather than 401/403. |
| P1 | Approval authorization allows a listed manager to approve their own Slack request. The handler checks manager membership but not requester identity; no approval expiry or policy/source revalidation is present. | `app.py:100-108`, `orchestrator.py:185-191`; self-approval probe changes the run to completed. README acknowledges no expiry. |
| P1 | Quote revision can overwrite a concurrent CRM change after approval. Post-write amount readback confirms the overwrite, not freshness of the source before execution. | `providers/hubspot.py:100-113`, `orchestrator.py:185-191`; mutate fake deal while held, approve, observe changed amount overwritten. |
| P1 | Inbound delivery is acknowledged before a durable job exists. Event dedupe and run creation are separate commits; a crash after claiming the event loses its redelivery. In-process BackgroundTasks are not a durable queue. | `app.py:69,91,108`, `orchestrator.py:73-83`, `store.py:68-85`; injected save failure then replay returns None. |
| P1 | Approval decision is committed before continuation is durably scheduled. If execution fails after the decision, another callback cannot resume it because the approval is already decided. | `orchestrator.py:90-100`, `store.py:139-145`; injected post-decision failure leaves failed run and retry returns None. |
| P1 | Agent owns provider write/send credentials and directly executes HubSpot/Slack/Gmail calls. There is no LoopLabs action authorization boundary, verified enforcement path, uncertain-effect lookup or external execution permit. | `app.py:31-44`, `orchestrator.py:268-290,345-360`; static inspection. No claim that bypass denial was exercised against AWS. |
| P2 | Default policy auto-approves below 20%, so the agreed 14%-held scenario completes. The exact 10% boundary also needs alignment: current comparator holds at the configured threshold, while the agreed example permits through 10%. | `config.py:29-30`, `policy.py:26-44`; independent 14% probe completes. This is a pilot-configuration/contract mismatch, not a defect against PR's own documented 20% rule. |
| P2 | This is contacts/deals plus locally stored quotes and a local/default pricing catalog, not HubSpot Quote-object integration or an ERP adapter. | `providers/hubspot.py`, `store.py`, README explicit limits. Native CRM source/version guarantees must be established, not assumed from our DynamoDB plan. |
| P2 | No AWS packaging/deployment or agent tool-discovery/continuation contract is included. It is a standalone FastAPI application, not an imported AgentCore deployment. | Changed-file inventory and README; no MCP/LoopLabs/AWS integration found in the reviewed application. |

P1 means a blocker to enabling the affected public/live controlled pilot path, not a claim of an active incident. The application may be exercised privately with fakes while these boundaries are addressed.

## What to reuse

Reuse the external agent's message normalization, classifier boundary, product/pricing example, channel reply routing and provider-client starting points. Its persisted local run is useful agent progress, but cannot be presented as LoopLabs authority or a general crash-safe scheduler. The workflow remains external and runs on AWS; LoopLabs governs registered tool actions.

## Revised small execution slices

1. Contract: bind reviewed agent identity, provider tools, business policy (automatic through 10%, 14% held), permitted record/recipient and action/result schema. Expose a versioned descriptive tool interface; declarations do not grant execution authority.
2. Tool-boundary integration: propose HubSpot changes and outbound replies through LoopLabs; record exact action IDs/correlation. Remove direct protected write/send credentials from the agent's execution path. Reads and contact creation require separately reviewed scopes; a blocked discount must not silently authorize unrelated writes.
3. Durable intake and continuation: persist verified messages/jobs before acknowledgement; atomically save decisions with resumable dispatch. Reuse current LoopLabs control/outbox contracts where compatible; do not build a competing approval authority in the agent.
4. First AWS deployment: adapt this exact workflow to the selected supported runtime with persistent agent state and scoped workload credentials, authenticated inspection, bounded logs and deployment identity. A VM-hosted custom app needs explicit reviewed registration/tool bindings; it cannot be labeled an AgentCore import. If AgentCore is selected, add and test its actual runtime service contract separately.
5. Import-only release: show observed identity/version, declared tool metadata, provenance and unknown enforcement. No enabled writes yet.
6. Controlled Slack journey: actual test-channel trigger → runtime → LoopLabs 14% hold → independent manager approval → exact CRM update/readback → controlled reply → run outcome. Verify source safety before permitting live CRM writes.
7. Gmail journey: isolated mailbox/label intake, durable Gmail history cursor and retry handling, authenticated push or supported polling, then controlled reply. Sender-address text alone must not establish a trusted partner identity. No arbitrary personal inbox sweep.
8. Recovery acceptance: lost CRM/send response, duplicate messages/callbacks, stale source, expiry, revocation and restarts. Preserve unknown outcomes instead of marking all exceptions failed or retrying blindly.

Do not duplicate the PR's workflow inside LoopLabs. Do not merge/deploy this PR as the controlled pilot until the affected acceptance checks pass. Improvements to an external PR should be separate small changes with pinned-source evidence; this review itself changes no external code.

## Account/setup observation

Existing default AWS identity was reachable after a read-only network retry, but it is a root identity and must not be used as the agent workload identity. Local AWS CLI 2.27.7 lacks the AgentCore command; inventory attempt failed before listing. No runtime absence was established. Mac was locked, so browser-based Slack/HubSpot inspection remains pending. These are setup findings, not application test failures or proof of missing accounts.
