---
title: "Copilot emailed the sub about an $18k change order. The PM hadn't signed off."
published: false
description: "General contractors use Copilot for RFIs and sub coordination. Email is still the system of record — and AI sends faster than your approval habits."
tags: ai, security, devops, microsoft
canonical_url: https://agentgovern.ai/construction-ai-governance
series: agentgovernance-copilot-rollouts
---

Regional GC, ~400 people. Copilot rolled out to project engineers and admin staff. I'm IT — also the person who sits in on risk meetings when someone says "the email speaks for itself."

## The near-miss

A project engineer prompted Copilot to *email the electrical sub — we need the panel upgrade by Friday, confirm the $18k change.*

Clear message. Reasonable tone. Wrong **process**.

The PM hadn't reviewed margin, owner approval, or whether the RFI was closed. The sub read it as a directive. In a dispute, it's an admission.

Toolbox talk said review AI output. Nobody reviewed before send — because Copilot made output look finished.

## Why Procore doesn't solve this alone

Project software holds the record. **Email still binds trades** on half our jobs. AI accelerates the channel you least control.

SharePoint permissions on job folders are often wider than need-to-know. Copilot inherits that.

## Three policies we're enforcing

1. **Cost or scope language in outbound email** → PM approval  
2. **Schedule commitments to subs on critical path** → superintendent approval  
3. **Owner-facing updates** → PM or project executive approval  

Each needs a log: who approved, what record the draft used, what actually sent.

## Small IT shop, familiar pattern

Same shape as AP thresholds and safety sign-offs — applied when Copilot tries to **act**, not when someone opens a chat.

Write-up: [Construction AI governance](https://agentgovern.ai/construction-ai-governance).  
We're piloting controls via [AgentGovernance](https://agentgovern.ai) — [demo here](https://agentgovern.ai/agent-governance-demo).

## Rollout advice for other GCs

Pick one job type (e.g. TI vs ground-up). Pilot Copilot with **external send approval** only. Review audit log weekly with PMs. Expand when they trust the stops, not before.

---

*[agentgovern.ai](https://agentgovern.ai)*
