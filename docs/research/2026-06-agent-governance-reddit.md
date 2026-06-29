# Agent Governance — Reddit Discovery (r/AI_Agents)

> Living product-discovery document. Update after every meaningful founder
> conversation, Reddit discussion, customer interview, or design review so
> product direction is driven by **evidence**, not memory.

> **Status: discovery only — not a roadmap.** Everything below is captured
> evidence and *candidate* implications, to be evaluated together once enough
> signal accumulates. Do not build from a single comment. No cherry-picking, no
> acting early — themes earn their way into the product across multiple
> independent sources.

---

## Context

**Source post:** "AI agents took a real-world action I didn't approve. Here's what I'm building to fix it."
**Subreddit:** r/AI_Agents (276K members)
**Date:** 2026-06-28
**Author:** OP (founder building an AI agent for vendor outreach)

**The story that prompted it:**
The team built an AI agent that handles vendor outreach. It worked — until it
tried to send a *contract amendment to the wrong contact* because the CRM data
was stale. They caught it "before it went out, barely." The realization:
> "how much we just… trust agents to do the right thing. no approval step, no
> audit trail, just vibes and hope."

**Why it was posted:**
To pressure-test the problem and find out what others do to add guardrails
*before* agents take real-world actions — and whether people roll their own or
buy tooling.

**Target audience:**
Builders shipping autonomous / semi-autonomous agents that call tools and take
real actions (the r/AI_Agents core demographic).

**Engagement:**
1,000+ views · 3 upvotes · 9 comments (still drawing replies). Modest reach, but
**unusually high comment quality** — several detailed, opinionated, independent
answers from practitioners who have clearly hit this in production.

> _Last updated: 2026-06-28 — added comment from u/Summerzhangnj88 (a procurement
> automation reference architecture). New material: Signals 13–16._

**Discussion quality:** High. The top-voted comments converge on the *same*
architectural conclusion from different angles, which is the strongest kind of
signal: independent practitioners arriving at one answer.

---

## Raw Customer Signals

> Verbatim where it matters. One unique idea per entry.

### 1. Guardrails must be external to the model
> "If your guardrails aren't external to your LLM, you are doing it completely
> wrong." — *TheorySudden5996 (4 upvotes — highest in thread)*

- **Interpretation:** Self-evaluating agents are not trusted. The thing that
  decides whether an action is safe must not be the thing that wants to act.
- **Problem behind it:** If the agent grades its own safety, there is no real
  control — just confident-sounding output.
- **Confidence:** **High** (highest-voted comment, echoed independently by two
  others).

### 2. "Self-grading agent = vibes with nicer formatting"
> "If the same agent that wants to act is also grading whether it is safe to act,
> you still have vibes with nicer formatting." — *anasgoblins (2 upvotes)*

- **Interpretation:** Prompt-based / in-model safety produces the *appearance*
  of control without the substance.
- **Problem behind it:** Teams mistake a well-formatted self-justification for a
  real gate.
- **Confidence:** **High** (memorable framing, reinforced by Signal 1).

### 3. The action is the unit of control, not the data
> "the stale data is a symptom, not the root cause. the real issue is blind trust
> in the agent's decision. guardrails need to be about the action itself, not just
> the data quality." — *Lanky_Picture_5647 (2 upvotes)*

- **Interpretation:** Fixing data quality alone won't help; the *action* needs a
  gate regardless of why the input was wrong.
- **Problem behind it:** Teams treat incidents as data bugs instead of missing
  governance on the action.
- **Confidence:** **Medium-High.**

### 4. Actions are capabilities with hard contracts, not prompt instructions
> "I'd treat 'agent may contact a vendor / send a contract / change CRM state' as
> a capability that needs a hard contract, not a prompt instruction." — *anasgoblins*

- **Interpretation:** What an agent may do should be a declared, enforced
  capability — not a sentence in a prompt the model may ignore or misread.
- **Problem behind it:** Prompt instructions are advisory; capabilities are
  enforceable. Permission must be explicit and external.
- **Confidence:** **Medium-High** (single author, but detailed and aligned with
  the external-guardrail consensus).

### 5. Propose, don't execute
> "make the agent produce a proposed action, not execute it directly" — *anasgoblins*

- **Interpretation:** The agent's output is a *request*, not a side effect. A
  separate system decides whether it runs.
- **Problem behind it:** Direct tool execution removes the only point where a
  gate could exist.
- **Confidence:** **High** (anasgoblins + blah_mad both describe this shape).

### 6. Require a receipt *before* approval
> "require a receipt before approval: source record id, stale-data checks,
> intended recipient, diff from current CRM state, estimated cost/risk, and why
> this action is allowed" — *anasgoblins*

> "before any vendor-facing send, show contact source + last sync time, diff of
> the message or attachment, and who must approve it. Then write a receipt after
> the send or cancellation." — *blah_mad (2 upvotes)*

- **Interpretation:** Every action must carry structured evidence — provenance,
  freshness, target, diff, cost/risk, and the rule that permits it — *before* it
  is allowed to run, and a final receipt *after*.
- **Problem behind it:** Without evidence, approval is rubber-stamping and audit
  is impossible.
- **Confidence:** **High** (two independent commenters specify nearly identical
  receipt fields).

### 7. Missing evidence is a hard failure
> "make 'missing receipt' a failure, not a warning" — *anasgoblins*
> "If the agent can't prove those, it shouldn't get the tool call." — *blah_mad*

- **Interpretation:** No receipt → no execution. Not a warning, not a log line —
  a block.
- **Problem behind it:** Soft warnings get ignored under delivery pressure.
- **Confidence:** **High** (two independent commenters, identical stance).

### 8. Source-of-truth lives outside the agent and freshness is checked
> "keep the CRM/source of truth outside the agent" … "no outbound message unless
> the CRM contact was refreshed/confirmed within N days" — *anasgoblins*
> "show contact source + last sync time" — *blah_mad*

- **Interpretation:** The system of record is authoritative, not the agent's
  context. Freshness (last-sync within N days) is a *precondition* to action.
- **Problem behind it:** The original incident was caused by stale CRM data the
  agent trusted blindly.
- **Confidence:** **High** (root cause of the OP incident + two commenters).

### 9. Cap blast radius, spend, and rate per run
> "cap spend + rate + blast radius per run" — *anasgoblins*

- **Interpretation:** Even permitted actions need limits — how much, how many,
  how far — bounded per run.
- **Problem behind it:** A single bad loop shouldn't be able to do unbounded
  damage.
- **Confidence:** **Medium.**

### 10. Log approval and external result separately
> "log the human approval and the final external result separately" — *anasgoblins*

- **Interpretation:** "A human approved it" and "the action actually succeeded
  externally" are different facts and must be recorded independently.
- **Problem behind it:** Conflating intent with outcome hides failures that
  happen after approval.
- **Confidence:** **Medium.**

### 11. Start narrow — one boring action first
> "start with one narrow action, not the whole workflow" … "Once that is boring,
> add more actions." — *anasgoblins*

- **Interpretation:** Govern one high-stakes action end-to-end before expanding.
  Make it reliable ("boring"), then widen.
- **Problem behind it:** Trying to govern the whole workflow at once produces
  weak coverage everywhere.
- **Confidence:** **Medium.**

### 12. Human-in-the-loop "but not like this"
> "Yep. we thought about it." → link: chatbotkit.com/reflections/human-in-the-loop-just-not-like-this
> — *pdparchitect (2 upvotes)*

- **Interpretation:** Naïve HITL (approve-everything popups) is a known failure
  mode; the design needs to be smarter than a confirmation dialog.
- **Problem behind it:** Approval fatigue / theater if every action interrupts a
  human.
- **Confidence:** **Medium** (single pointer; worth reading the linked piece).

### 13. Category-based mandatory approval (money / external parties)
> "anything touching external contacts or money, agent drafts, human approves, no
> exceptions" — *Summerzhangnj88 (procurement automation project)*

- **Interpretation:** Gating is by *category*, not only by threshold. Actions that
  touch money or external parties **always** require a human — no auto-execute,
  no exceptions — regardless of amount.
- **Problem behind it:** The highest-stakes categories are exactly where silent
  auto-execution is most dangerous; a threshold alone isn't enough.
- **Confidence:** **High** (concrete shipped implementation; aligns with the
  propose-don't-execute consensus).

### 14. Audit the whole lifecycle: draft → approval → final send
> "audit logging every step from draft to approval to final send, so anything that
> goes wrong is traceable" — *Summerzhangnj88*

- **Interpretation:** The audit trail must span the entire action lifecycle, not
  just the decision moment — draft, approval, and the final external result are
  each logged.
- **Problem behind it:** If only the decision is recorded, failures that happen
  *after* approval (the send itself) are invisible.
- **Confidence:** **High** (reinforces Signal 10 — approval and result logged
  separately).

### 15. Stale data → auto-hold + flag for manual review
> "if a CRM contact record hasn't been updated in X days, the agent auto-holds and
> flags it for manual review" — *Summerzhangnj88*

- **Interpretation:** Stale source-of-truth doesn't just hard-block — it puts the
  action in a distinct **held / pending-review** state and surfaces it to a human.
- **Problem behind it:** Same root cause as the OP incident (stale CRM). The
  practical fix is a *hold* state, not a silent drop.
- **Confidence:** **High** (independent confirmation of Signal 8, and it adds the
  hold/review behavior the demo doesn't model yet).

### 16. The valuable MVP is small and fast to build
> "None of it is complex, an approval queue and a few rule checks, done in a week."
> — *Summerzhangnj88*

- **Interpretation:** Most of the value came from a simple **approval queue +
  a handful of deterministic rule checks** — shipped in about a week.
- **Problem behind it (for us):** Over-engineering governance delays the value.
  Customers got ~80% of the benefit from a small, boring system.
- **Confidence:** **High** (explicit, from someone who shipped it). Strong
  scope-discipline signal.

---

## Themes

Grouping the signals above:

- **External policy engine** — Signals 1, 2, 4 *(strongest, highest-voted)*
- **Action receipts / evidence-before-execution** — Signals 6, 7
- **Approval workflows** — Signals 5, 10, 12, 13
- **Category-based mandatory approval (money / external)** — Signal 13
- **Capabilities instead of prompts** — Signals 4, 5
- **Audit trail (append-only, separated facts)** — Signals 6, 10, 14
- **Lifecycle audit (draft → approval → send)** — Signal 14
- **Blast-radius / spend / rate limits** — Signal 9
- **Source-of-truth validation** — Signal 8
- **State freshness** — Signals 8, 15
- **Held / pending-review state (not just block)** — Signal 15
- **Simple, fast-to-build MVP (queue + rule checks)** — Signal 16
- **Independent verification** — Signals 1, 2
- **Action as the unit of control** — Signal 3
- **Narrow-first rollout** — Signal 11

---

## Product Insights

> Themes → product requirements.

- **Insight:** Customers do not want "better prompts" or smarter self-checks.
  **Need:** Independent execution governance that sits *outside* the agent runtime.

- **Insight:** Customers repeatedly, independently asked for receipts.
  **Need:** Every action must produce structured evidence (provenance, freshness,
  target, diff, cost/risk, permitting rule) *before* execution.

- **Insight:** Customers believe the model must never approve itself.
  **Need:** The policy engine and the agent that proposes actions must be
  separate systems with separate authority.

- **Insight:** The real incident was stale source-of-truth data trusted blindly.
  **Need:** Freshness and provenance of the system-of-record must be validated as
  a precondition to any external action.

- **Insight:** Soft warnings get ignored.
  **Need:** Missing or failing evidence is a hard block on the tool call, not a
  warning.

- **Insight:** Approval ≠ outcome.
  **Need:** Record human approval and the real-world result as separate,
  append-only facts.

- **Insight:** Whole-workflow governance is too big to land.
  **Need:** Govern a single high-risk action end-to-end first; expand by
  capability.

- **Insight:** Customers gate by *category*, not just by threshold — money and
  external-party actions are always human.
  **Need:** Policies support "this class of action always requires approval"
  (e.g. `touchesMoney`, `touchesExternalParty`), independent of amount.

- **Insight:** "Held for review" is a distinct outcome from "blocked."
  **Need:** The decision space includes a **hold** state (auto-hold + flag),
  not just allow / require-approval / block.

- **Insight:** A shipped, useful version was an approval queue + a few rule
  checks, built in a week.
  **Need:** Keep the core small, deterministic, and boring. Resist complexity;
  ship the queue + rules first.

---

## Product Principles

> Architecture-guiding principles. Print these on the wall.

1. **The model proposes. The governance layer decides.**
2. **Policy lives outside the LLM.** If the agent grades its own safety, you have
   vibes with nicer formatting.
3. **Execution is permissioned, not implied.** Acting requires an explicit
   capability grant, not a prompt instruction.
4. **No external action without evidence.** Every action carries a receipt before
   it runs.
5. **Missing evidence is a hard failure**, never a warning.
6. **Receipts are immutable. Audit logs are append-only.**
7. **Approval is independent from reasoning.** A separate authority approves; the
   agent never approves itself.
8. **Approval and outcome are separate facts**, logged separately.
9. **Blast radius is configurable** (spend, rate, reach) and enforced per run.
10. **Source-of-truth freshness is validated before execution.**
11. **Govern one action well before governing many.**
12. **Actions that touch money or external parties never auto-execute.**
13. **Govern the whole lifecycle: draft → approval → send** (each logged).
14. **Stale source-of-truth auto-holds for review** — a held state, not a silent drop.
15. **Keep the core simple** — an approval queue + deterministic rule checks beats a complex engine.

---

## MVP Implications

Minimum product to deliver the principles above:

- **Action Request** — the agent's proposed action as structured data (not a
  direct tool call).
- **Policy Engine** — deterministic-where-possible evaluation of an Action
  Request against capabilities + policies. *(First-class. The core.)*
- **Action Receipt** — required evidence bundle: source record id, freshness /
  last-sync check, intended recipient/target, diff vs current state, est.
  cost/risk, and the permitting rule.
- **Evidence Store** — where receipts and their inputs are persisted.
- **Approval Engine** — independent approval (auto within authority; human for
  exceptions); records who/what/when.
- **Execution Log** — append-only record of the external result, separate from
  approval.
- **Risk Scoring** — per-action risk used to route auto vs. human.
- **Capability Registry** — declared, enforceable list of what each agent may do
  (the "hard contract").
- **Replay** — re-run a receipt to verify the decision deterministically.
- **Approval Queue + Hold state** — a human-facing queue; actions can be `held`
  for review (stale data / money / external party), not just blocked.

> **Scope discipline (Signal 16):** a shipped, useful version was *"an approval
> queue and a few rule checks, done in a week."* Build that first — resist
> turning the engine into a platform before the queue + rules are boring.

---

## Open Questions

- How should policies be **authored**? (DSL, UI rule-builder, code, natural
  language compiled to rules?)
- Can approvals be **delegated**, and how is that delegation bounded/expired?
- Should policies be **versioned**? (Almost certainly yes — how, and how do
  receipts pin the version used?)
- How are receipts **signed** and made tamper-evident? (Key management,
  algorithm, chain.)
- How should **replay** work for actions with external side effects (dry-run vs.
  shadow vs. recorded)?
- What happens when **policies conflict**? (Precedence, deny-overrides, explicit
  resolution?)
- How is **source-of-truth freshness** measured across heterogeneous systems
  (CRM, billing, calendars)?
- Where does the **capability registry** live and who can edit it?
- What is the **interception point** — SDK wrapper, proxy, MCP middleware, tool
  gateway?

---

## Things NOT to Build Yet

Appeared adjacent, intentionally deferred — keep focus on governance:

- Model fine-tuning
- Prompt optimization
- Agent orchestration / multi-agent frameworks
- Workflow builders
- General observability / APM for agents
- Building our own CRM / source-of-truth (we *read* it, we don't own it)

---

## Architecture Consequences

How this feedback changes the system design:

- **The policy engine becomes first-class** — the product *is* the engine, not a
  feature bolted onto an agent framework.
- **LLMs never directly execute tools.** Every tool call is intercepted.
- **Every tool call becomes an Action Request** (proposed, not performed).
- **Every Action Request must generate an immutable receipt** before it can run.
- **Policy evaluation is deterministic where possible** (and clearly flagged when
  it is not).
- **Execution and reasoning are separate systems** with separate trust
  boundaries and separate logs.
- **Source-of-truth is read at decision time**, with freshness asserted, not
  assumed from the agent's context.
- **The decision space is `allow / require_approval / hold / block`** — `hold`
  is a distinct held-for-review state (stale data or a category flag), surfaced
  to a human rather than silently dropped.
- **Category gates are first-class** — `touchesMoney` / `touchesExternalParty`
  force human approval before any threshold logic runs.
- **Audit spans the lifecycle** — draft, approval, and final external result are
  separate logged events, so post-approval failures stay traceable.

---

## Product Positioning

**Move away from:** "AI Guardrails."
The thread shows the word "guardrails" is contested — commenters argued
guardrails must be *about the action* and *outside the model*. "Guardrails"
implies a soft, in-model safety layer, which this audience explicitly distrusts.

**Move toward:**
- **"Agent Execution Governance"**, or
- **"The policy engine between AI agents and the real world."**

**Why this matches customer language:** practitioners used the words *external*,
*outside the model*, *policy*, *capability / contract*, *receipt*, *approval*,
and *audit*. They did **not** ask for "guardrails inside the agent." Positioning
as the independent execution-governance layer mirrors the exact mental model the
highest-voted commenters already hold.

**One-line statement:**
> AgentGovernance is the execution governance layer between AI agents and the real
> world. The model proposes an action; AgentGovernance decides — independently —
> whether it runs, requires evidence and approval first, and records an
> immutable receipt.

---

## Validation note (against the current demo)

The existing AgentGovernance demo already embodies the strongest signals:
external policy engine, propose-don't-execute, human approval for over-authority
actions, signed receipts, and an audit trail. **The Reddit feedback is direct
validation of that direction.**

What the demo does **not** yet show, that this thread says is essential:
- **Source-of-truth freshness check** as a precondition (the actual root cause).
- **Diff vs. current state** inside the receipt.
- **Capability registry** as an enforced contract (vs. implied permissions).
- **Blast-radius / spend / rate caps** per run.
- **"Missing evidence = hard block"** as an explicit, visible rule.
- **Separate approval vs. external-result logs.**
- **Replay** of a receipt.

These become the roadmap for turning the demo into a real **Execution Policy
Engine**.
