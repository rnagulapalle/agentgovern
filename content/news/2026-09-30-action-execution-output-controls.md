---
title: "Agent action, execution, and output controls are different"
description: "A clear framework for controlling what an AI agent may do, how the work runs, and what result can be released."
published: "2026-09-30"
category: governance
tags: agent action control, agent execution control, agent output control, AI approvals, agent policy engine
relatedGuide: /agent-governance-demo
---

Teams often put every agent safeguard under one label: guardrails. That makes architecture and ownership harder than they need to be.

There are three separate decisions to make: **what the agent may do, how the work may run, and what result may leave the system**. Each needs a different control.

## Action controls: what may happen

An action is one proposed operation against a tool or system. Examples include sending an email, updating a CRM field, issuing a refund, exporting a file, or creating a cloud resource.

An action policy uses the agent's identity and the current business context to return a decision: allow when the action is within the role, hold when a named person needs to approve it, or block when it falls outside authority.

A useful decision record includes the policy version, relevant facts, reason, and resulting action. “The model decided” is not an audit record.

## Execution controls: how the run behaves

An execution is the whole attempt to complete a task. It may include planning, multiple tool calls, retries, agent-to-agent handoffs, and changes across several systems.

Execution controls set step and tool limits, delegation rules, time and spending budgets, pause conditions, and stop behavior. This is where multi-agent systems need more than individual allow lists. The control plane needs a view of the entire run and the authority passed between participants.

## Output controls: what may be released

An output is the result delivered to a person, system, or external party. It might be a customer response, report, code change, data export, or structured API payload.

Output controls inspect the completed result before release. They can detect sensitive data, require citations, enforce a destination rule, redact prohibited fields, or hold the result for review.

Output checks should preserve lineage. A reviewer needs to know which inputs, tools, policies, and execution produced the result.

## One workflow, three decisions

Imagine a sales agent preparing a renewal offer:

1. It reads the account and drafts a 25% discount.
2. The action policy sees that the role can offer only 10% and holds the send.
3. The execution pauses while a sales manager reviews that exact offer.
4. The manager approves 15%, so the agent revises the draft.
5. The output check removes a private email address from an internal note.
6. The approved message is sent, and the complete chain is recorded.

The action, execution, and output controls are connected, but they are not interchangeable. Separating them gives product teams clearer APIs and security teams clearer evidence.

## A practical ownership model

Business owners define authority and approval thresholds. Security defines access boundaries and prohibited data flows. Platform teams operate the execution layer. Compliance defines evidence and retention needs.

The control plane brings those decisions into one enforceable record. Each team can own its policy without rebuilding the agent workflow around every rule.

[See the three control points in the LoopLabs product tour](/control-plane).
