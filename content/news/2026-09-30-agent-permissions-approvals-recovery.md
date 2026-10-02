---
title: "A practical permissions model for AI agents"
description: "Treat every agent like a service identity with an owner, role, scoped access, approval thresholds, and a tested recovery path."
published: "2026-09-30"
category: governance
tags: AI agent permissions, agent identity, human approval workflow, least privilege, agent recovery
relatedGuide: /ai-governance-for-mid-size-companies
---

An AI agent should not inherit every permission of the employee who started it. It may run longer, act faster, delegate work, and touch more systems than the person expects.

A safer model treats each agent like a service identity with employee-like accountability: a role, an owner, explicit authority, and a record of every important action.

## Give the agent a durable identity

The identity should include a unique agent ID, a human or team owner, a business purpose, an environment, an approved model and tool set, and review dates. This makes it possible to suspend one agent without disabling a whole application or user account.

## Separate access from authority

Access answers whether the agent can reach a system. Authority answers what it may do once it gets there.

An agent may need read access to all open support tickets while being allowed to close only low-risk tickets. It may need access to a payment API while requiring approval for every transaction above a threshold.

Keep three layers explicit:

- **Resource scope:** systems, databases, APIs, files, and model endpoints.
- **Action scope:** read, create, update, send, delete, approve, and delegate.
- **Conditions:** amount, data class, destination, freshness, time window, and environment.

## Bind approvals to one request

Human approval should describe the exact action being authorized. The request should show the agent, target, affected data, proposed change, policy reason, and expiration time.

When the context changes, the approval should expire. A manager approving a $600 refund should not authorize a later $900 refund or a different customer record.

## Control delegation

Multi-agent workflows pass work and authority from one agent to another. Record each handoff. The receiving agent should get the smallest scope needed for that task, for a limited time.

Delegation must never increase authority. A research agent that cannot send email should not gain that ability by handing work to a communications agent unless a policy explicitly permits the handoff and its purpose.

## Design recovery before production

For every write action, decide how the system will review and repair an unwanted change.

Store the prior state or a reliable version reference. On failure, suspend the agent, stop queued work, compare the current version, and prepare a recovery plan. Do not overwrite newer human work. Record the repair as a new change so the audit trail remains complete.

Some actions cannot be reversed. Messages, external disclosures, and completed payments need containment and human follow-up. Label those actions clearly before an agent receives permission to perform them.

## Review the role like an employee role

Review agent access when the owner changes, the workflow expands, a new model or tool is added, or the agent has not run for a defined period. Remove unused permissions and expire temporary grants.

The goal is to make authority visible, bounded, and recoverable before automation reaches production scale.

[Explore the LoopLabs product tour](/control-plane/agents) to see agent identities, roles, permissions, approvals, and recovery together.

For a concrete starting point, read [what an AI CRM workflow pilot involves](/blog/2026-10-02-ai-crm-workflow-pilot): one record update, a named owner, and agreed tests for approval and uncertain outcomes.
