---
title: "Human approval for AI agent tool calls: what CISOs should verify"
description: "What human approval for an AI agent tool call should authorize, what it cannot prove, and which controls security teams should test."
published: "2026-09-30"
updated: "2026-11-24"
category: governance
tags: "human approval, AI agent tool calls, AI agent permissions, agent control plane, idempotency"
relatedGuide: /platform
---

Human approval for AI agent tool calls should authorize one exact request. That means a named target, payload, amount and scope, approved by the right person, valid for a limited time, and checked against current state before execution. Approval cannot prove what the provider did. Verify binding, enforcement, replay handling and unknown-outcome reconciliation.

## Approval needs an enforcement point

An [agent control plane](/blog/2026-09-30-what-is-an-agent-control-plane) is an architectural layer that evaluates authority and supervises consequential actions. A policy decision only matters if something in the execution path enforces it. A dashboard or a model promise to wait is not enforcement.

Microsoft's [Foundry agent controls documentation](https://learn.microsoft.com/en-us/azure/foundry/agent-controls/overview) describes runtime policy evaluation, currently in preview. It also says the application or runtime must enforce the decision that comes back. Ask any vendor where its enforcement point sits and what happens when a call goes around it.

## What to verify

- Exact request binding. Approval should attach to the specific request, not to a session or an agent. If the payload changes, the approval no longer applies.
- Scoped AI agent permissions. Target, fields and amount limits should be explicit. "Can update CRM" is too broad for a consequential write.
- Named approver. Record who approved. Where separation of duties is required, the requester and the approver should be different identities.
- Expiry and revalidation. Approvals should expire, and the target's current state should be rechecked right before execution.
- Replay handling. One approval should not authorize repeated sends.
- Unknown outcomes. A timeout is neither success nor failure, so it needs a defined reconciliation path.

## A hypothetical stale approval

This example is made up. An agent proposes changing the billing contact on one CRM account, and a manager approves it. Before the agent runs, someone else edits that record. The agent then executes the approved payload and overwrites the newer value. The approval was real, but the record it described had changed. A current-state check would have stopped the write and asked for a fresh approval.

## What approval cannot prove

Approval authorizes a request. It cannot tell you whether the provider applied it once, applied it twice or failed partway through. Idempotency helps, but it is provider-specific. [Stripe's idempotency documentation](https://docs.stripe.com/api/idempotent_requests) explains that in API v1 the first response for a key is cached, even a 500. Keys are retained only for a limited time, and parameters are compared on reuse. API v2 works differently. Don't assume every provider or key guarantees a single effect. The post on [action, execution and output controls](/blog/2026-09-30-action-execution-output-controls) covers where these checks sit.

## What to ask a vendor

Choose one specific write or send workflow. Ask the vendor to show five things against it: a changed payload being rejected, an expired approval being refused, a stale record forcing revalidation, a retry that does not create a second effect, and a timeout that lands in reconciliation.

## What LoopLabs demonstrates today

The public [prepared workflow examples](/examples) model deterministic state transitions locally in the browser. Separate workspaces hold bounded, persisted approval, execution and reconciliation proofs against private provider twins and controlled fixtures. These workspaces require an invitation. Neither proves general live customer integrations, arbitrary workflow building, industry-grade reliability or cryptographic audit records. LoopLabs is not a general security platform. Founder-led work starts by scoping one workflow and evaluating fit, and it is not a production guarantee. See the [product overview](/platform) or [bring one workflow](/contact-sales).

## Does human approval make an agent action safe?

No. It authorizes one request. Safety also depends on enforcement, current-state checks, replay handling and reconciliation.

## Is an idempotency key enough to prevent duplicate effects?

Not by itself. Behavior varies by provider and API version, and keys expire.

## Bring one workflow

If you have one consequential write or send workflow you want examined, [bring it to us](/contact-sales). We'll scope it together and see whether it fits.