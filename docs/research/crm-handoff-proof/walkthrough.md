# The CRM changed. Should the customer message go out?

Prepared October 5, 2026. Local evaluation asset for Raj and Pratibha; not a published case study. Intended for a COO or customer-operations owner. Use the existing invited workspace. A facilitator takes the operator through one prepared customer handoff in about seven minutes.

**What this proves:** two scoped identities propose a fixed CRM update and a fixed acknowledgement; named people approve; the next action waits for verified upstream state. The control records are persisted in PostgreSQL. CRM and messaging are private FetchSandbox twins: one sample contact, one prepared template and recipient. No customer data, real email, model or money is involved.

**Start with the business question:** “The update timed out. Do we know it failed, or could it already have happened? Should the customer message go out?”

## Before opening the product

Ask for one recent CRM-to-customer handoff that was late, wrong or uncertain. Who owns the record, who may approve the change, and what handles retries today? If their existing system already resolves the problem, record that. Do not describe a network timeout as an AI-caused incident without evidence.

Two named invited members are needed when using prepared action buttons: the requester and an independent reviewer. A person cannot approve their own CRM or messaging request. Use dedicated scoped CRM and messaging agents; enrollment restricts them to fixed steps and there is no unenrollment in this release. Never show keys in a recording or worksheet. The facilitator should prepare accounts and agent identities privately before the session.

## Annotated walkthrough

| Moment | What to show | What to say | Question before advancing |
|---|---|---|---|
| 1. Name responsibility | Agents and boundaries, then Saved workflow runs; choose CRM and Messaging agents and **Start workflow** | “Each agent has its own permitted task and an accountable owner. This run has fixed steps.” | “Who should own this change in your business?” |
| 2. Ask for authority | Step 1 **Submit prepared action**; it becomes held; another named member reviews **Approve exact action** | “A request is not permission. A different person approves this exact change.” | “Does approving this record update also authorize the customer message?” |
| 3. Make the outcome uncertain | Step 1 **Execute · lose response** | “The test provider can record the update while its reply is lost. We cannot infer failure from the timeout.” | “What would you check before sending or retrying?” |
| 4. Show the held consequence | Submit/independently approve step 2 if needed; attempt **Execute** while step 1 is uncertain | “Approval of the message is not enough. Its preceding update must also be verified.” | “What action is being prevented right now, and why?” |
| 5. Check the result | Step 1 **Verify outcome**; inspect returned state | “This check reads the provider evidence. It does not blindly send the upstream update again.” | “What evidence would your real CRM need to offer?” |
| 6. Finish only after evidence | Step 2 **Execute**, then **Verify and complete** | “The run is complete only after both intended fixture effects are verified.” | “How is this different from a green job status or an approval button alone?” |

These are existing UI labels inspected in `components/control-plane/workflow-workspace.tsx`. A refresh can be used to show the saved run. Do not claim a browser refresh is an infrastructure failover test: service termination and restart were separately exercised by the recorded harness. If any request cannot be confirmed, stop and inspect the saved state; do not create another run to conceal the failure.

## Optional separate failure demonstration

Use a fresh dedicated run for **Pause workflow**. Pausing blocks new dispatch claims; it does not recall a request already sent. Paused runs cannot be resumed in this release. State clearly before clicking it so the evaluator does not expect an unavailable resume button.

Do not manipulate production provider records to demonstrate conflicts. Stale-source and direct-API bypass cases are supported by the sanitized recorded proof, not fabricated live screenshots. Use `claim-map.json` to point to the exact checks. The recorded checks are from October 4 local time; this asset does not claim a new proof run today.

## Close with a bounded offer

“If this resembles a handoff you own, bring one CRM update and the customer message it releases. We’ll identify the owner, exact approval, failure evidence and acceptance checks together, then decide whether a small pilot is worthwhile.”

Public discovery: https://looplabs.run/platform . Sales intake: https://looplabs.run/contact-sales . Invited evaluation: https://looplabs.run/control-plane/workflow-runs . The last link is gated; do not use it as an open public-playground promise.

## What remains to be proven

The real provider's credentials, idempotency, conditional-write and read-back behavior; operational isolation and availability; alerting; real delivery and integration permissions. A third party can change provider state after read-back, so this is not an atomic cross-system transaction. Semantic duplicates with different run IDs are not prevented. No arbitrary visual builder, model reasoning, dynamic branching or general connector coverage is established.

## Operator worksheet

Use `operator-worksheet.csv` for five independent sessions. Record role and anonymized participant reference, not credentials or customer records. Mark answers before/after the walkthrough separately; distinguish an unresolved existing gap from interest in a free custom build. Do not record or quote participants publicly without their permission.

Decision threshold: three of five identify an unresolved gap, two accept an explicit next step, and participants explain the held message correctly. These are experiment decisions, not statistically validated demand. Stop or revise if native controls suffice, permissions are unavailable or the product explanation remains unclear.

## Source and differentiation notes

Recorded implementation: `docs/WORKFLOW_ONBOARDING_PROOF.md`, `docs/CONNECTOR_VERIFICATION.md`, `docs/evidence/connector-proof.json` and the private workflow UI. `claim-map.json` maps six statements to successful recorded checks; all source fingerprints matched when this package was prepared.

[n8n's official human-review reference](https://github.com/n8n-io/skills/blob/main/skills/n8n-agents-official/references/HUMAN_REVIEW.md), inspected October 5, already describes gating side-effecting tools behind explicit approval. That supports testing uncertain-outcome and dependency handling as the incremental value. It does not establish that n8n lacks those capabilities. Ask each operator about their actual existing stack before asserting a gap.

Public-asset decision: independent buyer pain and qualified conversion remain unvalidated. This package is prepared for facilitated discovery; no new SEO page, social publication or outreach is authorized by preparing it. Tuesday should assess the gate before distributing any adaptation.
