---
title: "Copilot stores prompts in Exchange — what compliance teams should verify"
published: false
description: "Microsoft retains Copilot interactions in user mailboxes for eDiscovery when configured. That helps retention — it does not govern what AI does in your CRM."
tags: ai, security, privacy, microsoft
canonical_url: https://agentgovern.ai/news/2026-05-copilot-prompt-retention-compliance
---

*Originally published on [agentgovern.ai](https://agentgovern.ai/news/2026-05-copilot-prompt-retention-compliance).*

Microsoft's guidance is clear: **Copilot prompts and responses can live in users' Exchange mailboxes**, searchable through eDiscovery when your tenant is set up for it.

If you run compliance for a **200-person** healthcare admin group or regional insurer, that sounds like the audit trail you wanted.

It is half the picture.

## Retention ≠ governance

Mailbox retention helps **after** someone asks what Copilot said.

It does not answer:

- Can Copilot **send** that summary to a customer without approval?
- Can it **update** a claims record above delegated authority?
- Can ChatGPT Enterprise **export** a roster to an unapproved channel?

Privacy teams own retention. Governance teams own **action controls** — intercept, approve, log.

## Four checks before you scale Copilot

1. **SKU reality** — Business Premium vs E3/E5 changes Purview/eDiscovery capabilities. Verify, don't assume.
2. **Test eDiscovery** — Run one Copilot interaction search. Policy on paper ≠ recoverable log.
3. **Permissions audit** — Copilot reads what users can read. Fix oversharing first.
4. **Action policies** — External email, record changes, exports — who approves?

## Mid-size teams don't need an AI lab

You need the same discipline as refunds and vendor payments, applied when AI **acts**.

Full checklist on agentgovern.ai: [Copilot prompt retention & compliance](https://agentgovern.ai/news/2026-05-copilot-prompt-retention-compliance).

Related guide: [AI governance for mid-size companies](https://agentgovern.ai/ai-governance-for-mid-size-companies).

[Demo — discount approval workflow](https://agentgovern.ai/agent-governance-demo) · [Early access](https://agentgovern.ai/#join)

---

*Not legal advice.*
