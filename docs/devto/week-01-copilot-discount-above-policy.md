---
title: "We rolled out Copilot. Sales asked it for a 25% discount. Policy allows ten."
published: false
description: "Microsoft Copilot can draft customer emails and update your CRM in one thread. That speed is the problem — unless risky actions stop for approval."
tags: ai, security, microsoft, devops
canonical_url: https://agentgovern.ai/retail-copilot-ai-governance
series: agentgovernance-copilot-rollouts
---

Our sales team got Copilot in January. By February someone almost sent a 25% discount email when leadership caps discretionary offers at 10%.

I'm not on an AI platform team. I'm the person who gets cc'd when IT, legal, and sales leadership all want "Copilot" and "controls" in the same sentence.

## What actually happened

An account rep typed something like: *Follow up with John at Acme — offer 25% off next quarter if they renew early.*

Copilot drafted a good email. Professional tone. Correct product names. It also updated the opportunity in Salesforce.

Nobody on the thread was trying to bypass policy. The model doesn't know your promo calendar. It optimizes for the instruction in the chat window — and that instruction is not authorization.

We caught it because the rep still sends most mail manually. Next quarter half the team won't.

## This isn't a prompt problem

We already had an acceptable-use doc. We ran a webinar. People still move fast on quarter-end.

Prompt guidelines fail at the moment of **send** — same way "double-check your expense report" fails without a manager approval rule in the system.

What we needed:

- **Visibility** before customer-facing email goes out  
- **A threshold** — discounts above X need a named approver  
- **A log** — what was requested, who approved, what went to the customer  

Not a better system prompt. Not "always review AI output." Enforcement.

## Purview helped. It didn't cover this.

Microsoft Purview and Business Premium give you sensitivity labels, DLP on generated content, eDiscovery on Copilot interactions. Worth having.

They don't answer: *Can Copilot commit a discount in Salesforce and email the customer in one flow without a manager?*

That action crosses M365 and your CRM. Governance has to sit where **actions** happen — not only where documents live.

## What we put in place (plain English policies)

1. **External customer email with pricing** → manager approval  
2. **CRM field changes on amount or stage** → logged; large deltas need approval  
3. **Stale account data** → hold, don't send (contact not verified in 30 days)

No custom model. No "AI team." Three rules the ops lead already understood.

We're piloting [AgentGovernance](https://agentgovern.ai) as the control layer between Copilot/ChatGPT and the systems they reach — intercept, enforce, audit. The [demo](https://agentgovern.ai/agent-governance-demo) walks through the discount-above-policy case with a live approval queue.

## If you're rolling out Copilot this quarter

You don't need to become AI experts. You need the same discipline you use for refunds and vendor payments:

- What actions can AI **attempt**?  
- Which ones **stop for a human**?  
- What gets **logged** when compliance asks?  

Start with one department and one threshold. Measure for a month. Expand.

Longer write-up on the retail angle: [Retail Copilot AI governance](https://agentgovern.ai/retail-copilot-ai-governance).

---

*Early access — [agentgovern.ai](https://agentgovern.ai) · [interactive demo](https://agentgovern.ai/agent-governance-demo)*
