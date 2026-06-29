# AgentGovernance — Industry Narrow Post Matrix

> **Rule:** One post = **one industry** + **one failure mode** + **one action type**.  
> No broad "AI agent governance" essays. Every post cites research before draft.

Last updated: 2026-05-27

## How to use this file

Before writing any blog post, SEO page, Dev.to draft, or social thread:

1. Pick a row from the backlog below (status `Planned`).
2. Complete the **Research Gate** in `~/.cursor/skills/agentgovern-gtm/SKILL.md`.
3. Log evidence links in the post frontmatter + ledger row.
4. Mark row `Drafted → Built → Deployed → Submitted → Measured`.

**Primary evidence (always read first):**

- `docs/research/2026-06-agent-governance-reddit.md` — external policy, receipts, category approval, stale CRM
- This file — industry + query + failure mode
- `lib/site.ts` — product principles (must not contradict)

**Competitive / SERP context (do not copy — differentiate):**

- HubSpot Breeze CRM Tool Approval Controls — CRM-native, not cross-tool receipts
- Elixir "8-step governed agent pipeline" — enterprise heavy, not demo-first
- Generic "AI safety" / prompt guardrails content — we sell **external policy engine**

---

## Research Gate (required fields per post)

| Field | Example |
|-------|---------|
| **Industry** | RevOps / sales |
| **Persona** | RevOps lead enabling HubSpot Breeze agents |
| **One action** | Send contract amendment email |
| **One failure mode** | Stale CRM contact → wrong recipient |
| **Query target** | `AI agent wrong email CRM stale` |
| **Evidence** | Reddit OP + Summerzhangnj88 + HubSpot approval controls article |
| **Demo proof** | Freshness block / approval queue / receipt fields in control plane |
| **Do not repeat** | Generic HITL popup essay; FetchSandbox Resend sent≠delivered post |

---

## Industries & narrow posts

### RevOps / Sales (GTM agents)

| ID | Slug (proposed) | Query cluster | Failure mode | Action | Evidence sources | Demo tie-in | Status |
|----|-----------------|---------------|--------------|--------|------------------|-------------|--------|
| S-01 | `/retail-copilot-ai-governance` | SDR agent discount approval, AI sales agent authority limit | 25% discount above 10% delegated authority | Offer discount in outbound | Reddit thread; demo mock data | Pending approvals card, SDR-Agent-17 | Built |
| S-02 | `/stale-crm-contact-agent-blocked` | AI agent wrong email CRM stale, agent sent wrong contact | CRM not refreshed in N days | Vendor-facing email | Reddit OP + signals 8, 15; HubSpot governance article | Freshness gate + hold state | Planned |
| S-03 | `/external-party-actions-always-approve` | human in the loop sales agent external email | Category gate: money/external party never auto | Any external send | Signal 13 (procurement); HubSpot write approval | Policy: touchesExternalParty | Planned |
| S-04 | `/hubspot-agent-write-without-rollback` | HubSpot AI agent CRM write governance | Agent bulk-wrote fields; no rollback trace | CRM record update | Rework HubSpot Breeze governance | Audit trail + separate approval/result logs | Planned |

### Finance / BFSI

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| F-01 | `/agent-refund-without-stripe-reconcile` | AI agent refund approval Stripe | Refund posted; local state not reconciled | Stripe refund | FetchSandbox dispute/refund posts (link, don't repeat) | Block until receipt + reconcile | Planned |
| F-02 | `/invoice-approval-agent-threshold` | AI agent invoice approval workflow | Agent approved invoice above SOX threshold | AP invoice approve | SOX / Elixir pipeline step 6; MindMap BFSI patterns | Approval queue + capability contract | Planned |
| F-03 | `/aml-alert-agent-auto-close` | AI agent AML triage governance | Agent closed alert without human on high risk | AML case status change | MindMap AML triage deployments | Risk score → human required | Planned |

### Healthcare admin

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| H-01 | `/prior-auth-agent-without-audit-trail` | prior authorization AI agent audit | Agent submitted PA; no draft→approval→send log | Prior auth submit | MindMap healthcare deployments; HIPAA §164.312(b) | Lifecycle audit (signal 14) | Planned |
| H-02 | `/healthcare-copilot-ai-governance` | AI agent PHI export blocked | Agent attempted export outside minimum necessary | Data export / API read | Elixir HIPAA steps; audit-log-spec | Policy save / blocked verdict | Built |
| H-03 | `/stale-patient-record-agent-hold` | stale EHR data AI agent | Action on patient record stale > N days | Schedule / notify patient | Signal 15 (auto-hold); healthcare freshness | Hold state, not silent block | Planned |

### Procurement / vendor ops

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| P-01 | `/contract-amendment-wrong-vendor-contact` | AI agent vendor contract email wrong recipient | Amendment to wrong contact (OP story) | Send contract / amendment | Reddit OP origin story | Receipt: target + freshness | Planned |
| P-02 | `/supplier-payment-dual-approval` | AI agent supplier payment approval | Single agent path to payment release | Supplier payment | Signal 13 category approval | Money + external party gates | Planned |

### Public sector

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| G-01 | `/foi-draft-agent-approval-chain` | AI agent FOI response approval | Draft sent without approval chain | FOI response publish | MindMap public sector; EU AI Act Art. 14 | Independent approval + receipt | Planned |
| G-02 | `/citizen-service-agent-pii-leak` | AI agent citizen service governance | Agent included PII in wrong channel | Citizen reply | MindMap FOI obligations | Block + policy save chart | Planned |

### Engineering / internal ops (tool-using agents)

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| E-01 | `/jira-delete-project-agent-blocked` | AI agent delete Jira project blocked | Agent attempted destructive delete | Jira project delete | Demo mock: "Delete Jira project ATLAS" blocked | Blocked verdict in recent actions | Planned |
| E-02 | `/github-agent-webhook-missed-event` | AI agent GitHub webhook reconcile | Agent acted on issue; webhook missed | Issue state change | FetchSandbox github webhooks post (bridge link) | Reconcile via API read | Planned |
| E-03 | `/mcp-tool-call-without-receipt` | MCP agent governance tool calls | Agent called MCP tool with no evidence bundle | Arbitrary MCP tool | Product principle 4; MCP bridge page | Propose → decide → prove | Planned |

### Customer support

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| C-01 | `/zendesk-ticket-reply-agent-auto` | AI agent Zendesk reply governance | Auto-replied with wrong macro / no approval | Ticket public reply | Demo: Reply to ticket #4821 auto | Auto vs exception vs blocked | Planned |
| C-02 | `/refund-ticket-agent-above-limit` | AI support agent refund limit | Refund $640 without approval chain | Stripe refund from ticket | Demo mock: Refund $640 approved path | Approval + receipt | Planned |

### Logistics / freight

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| L-01 | `/logistics-ai-governance` | freight broker Copilot TMS governance | Stale appointment → wrong customer delivery commit | Customer/carrier email | Signal 15 stale data; logistics ops pattern | Hold + approval | Built |

### Construction

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| N-01 | `/construction-ai-governance` | construction change order AI approval | CO cost/scope emailed before PM approval | Subcontractor / owner email | Construction dispute patterns | Approval queue | Built |

### Real estate

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Demo tie-in | Status |
|----|------|---------------|--------------|--------|----------|-------------|--------|
| R-01 | `/real-estate-ai-governance` | real estate Copilot offer email governance | Counteroffer draft leaks seller motivation | Client/co-broker email | Broker confidentiality duties | External approval | Built |

### Cross-industry (principle posts — still narrow)

| ID | Slug | Query cluster | Failure mode | Action | Evidence | Status |
|----|------|---------------|--------------|--------|----------|--------|
| X-01 | `/prompt-guardrails-vs-policy-engine` | prompt guardrails vs policy engine | Self-grading agent | Any external action | Signals 1–2 | Planned |
| X-02 | `/missing-receipt-hard-block` | AI agent missing audit evidence | No receipt → tool call anyway | Any | Signals 6–7 | Planned |
| X-03 | `/approval-vs-outcome-separate-logs` | AI agent audit approval vs result | Conflated approval with success | Any external | Signals 10, 14 | Planned |

---

## Priority batches (SEO + Dev.to)

**Batch 1 — proven Reddit/demo proof (ship first):**

- S-01, S-02, P-01, E-01, C-02

**Batch 2 — regulated industry narrow (research-heavy):**

- F-02, H-01, H-02, G-01

**Batch 3 — bridge + comparison:**

- X-01, E-03, S-04

---

## Post format template

```markdown
---
title: "<specific failure — industry in subtitle if needed>"
description: "<one failure mode, one action, under 160 chars>"
industry: sales | finance | healthcare | procurement | public | engineering | support
failure_mode: "<slug>"
action_type: "<verb noun>"
research:
  - docs/research/2026-06-agent-governance-reddit.md#signal-N
  - <external URL with date accessed>
canonical: https://agentgovern.ai/blog/<slug>
---

<Hook: the incident in 2 sentences — no thought leadership preamble>

## The failure mode
<One narrow bug class>

## What operators actually need
<External policy + receipt + approval — tie to demo>

## What we built in the demo
<Specific control plane screen>

CTA: /agent-governance-demo or waitlist
```

---

## Angles already used — do not repeat

| Angle | Where | Reuse rule |
|-------|-------|------------|
| Generic AI agent governance overview | Homepage | Only link to it |
| External policy engine principles | `lib/site.ts`, homepage | Reference, don't republish as new blog |
| Stale CRM wrong email (broad) | Reddit OP | OK once as S-02 or P-01 — not both in same week |
| FetchSandbox provider workflow posts | fetchsandbox.com | Bridge link only — different product moment |

---

## Weekly research cadence

| Day | Task |
|-----|------|
| Mon | Scan r/AI_Agents, r/devops, r/sales — add signals to reddit research doc |
| Tue | Pick 1 industry row; complete Research Gate; draft |
| Wed | Build SEO page or Dev.to post; ledger update |
| Thu | GSC check agentgovern.ai (after property live) |
| Fri | Mark measured; note which industry query moved |
