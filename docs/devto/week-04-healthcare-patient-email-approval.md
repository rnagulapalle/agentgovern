---
title: "Copilot drafted a patient follow-up. PHI was one click from a personal inbox."
published: false
description: "Healthcare admin teams use Copilot for scheduling and outreach. Minimum necessary still applies — at send time, not draft time."
tags: ai, security, compliance, microsoft
canonical_url: https://agentgovern.ai/healthcare-copilot-ai-governance
series: agentgovernance-copilot-rollouts
---

Regional clinic group, ~350 staff. Not a research hospital — scheduling, billing, patient access. Copilot landed in admin teams before we finished answering privacy's questionnaire.

## The scenario

A coordinator asked Copilot to *follow up with patients who missed appointments this week.*

Drafts looked great. One included clinical detail that shouldn't leave the controlled channel. Another targeted a stale address from an export.

No approval step. No log of which patients Copilot read. Privacy lead asked the question we couldn't answer quickly: *Prove minimum necessary.*

## Purview vs patient **actions**

Labels and eDiscovery on Copilot interactions inside M365 — necessary.

They don't cover:

- Payer portal submissions  
- Patient comms through mixed CRM + email flows  
- ChatGPT Enterprise plugins hitting ticketing  

Governance has to attach to **send**, **export**, and **record change** — not just document classification.

## Policies we're piloting

| Control | Rule |
|---------|------|
| Patient-facing send | Human approval before external email/SMS |
| PHI bulk export | Blocked by default; logged attempts |
| Stale patient record | Hold — no action until verified |

Audit trail: user, patient identifiers involved, policy outcome, approver, send chain.

Details: [Healthcare Copilot AI governance](https://agentgovern.ai/healthcare-copilot-ai-governance).

## For admin IT at regional health groups

You won't hire an AI governance office. You **can** copy three policies from how you already handle release of information — and enforce them when Copilot acts.

[AgentGovernance demo](https://agentgovern.ai/agent-governance-demo) · [waitlist](https://agentgovern.ai/#join)

---

*Not medical advice. Governance patterns for admin IT.*
