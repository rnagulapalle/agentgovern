# Chat-created workflows: RawReply reuse and product experience

Research observed October 6, 2026. This is a proposed implementation direction, not a shipped feature claim. Read alongside `../CONVERSATIONAL_WORKSPACE.md` and `../ENQUIRY_WORKFLOW.md`.

## What was documented before this review

The conversational-workspace document specifies a structured planner, clarification, reviewed plans and controlled execution. It did not explicitly document the RawReply/Ember reuse decision. The current enquiry entry uses prepared fixtures; it does not run a model or accept arbitrary workflow descriptions. The draft implementation is not a complete self-service builder.

## RawReply reuse assessment

Read-only source inspection in `/Users/raj/ember` found:

| Capability | Local source | LoopLabs decision |
| --- | --- | --- |
| Authenticated threads and chat loading | `web/src/components/chat/chat-view.tsx` | Adapt the interaction to LoopLabs' existing named-member authentication; do not import a second auth system. |
| Streaming text and image messages, cancellation and stalled-stream handling | `web/src/store/chat-store.ts`, `api/routes/chat_stream.py` | Reuse patterns and selected components after separating RawReply-specific analytics, prompts and backend contracts. |
| Persistent user and project memory with provenance | `core/user_memory_retriever.py`, `core/project_memory_retriever.py` | Adapt to organisation/member/workflow isolation and reviewed business knowledge. Memory is context, never permission. |
| Retrieval relevance filtering | `core/memory_threshold.py` | Verify configured filtering and unrelated-task leakage before adoption; the source default is off. |
| Context-window pressure telemetry | `api/routes/chat_stream.py`, `llm/config.py` | Useful pattern. Full automatic compaction correctness was not established by this inspection; require a separate contract and test. |

RawReply's Python backend and Next.js frontend are not a drop-in dependency for LoopLabs' Next.js/PostgreSQL runtime. Keep the existing LoopLabs authority checks and durable runtime. Do not copy private data, tokens, personal model-account sessions or RawReply's production configuration. Model-provider selection and service credentials are a separate implementation decision.

RawReply's chat-context-isolation document records earlier context-bleed failures. Later memory code exists, so the older document is not the current feature inventory; its failure cases remain useful regression scenarios. A memory retrieval failure may allow a casual chat reply, but a consequential workflow must stop if required policy or source evidence is unavailable.

## Current product references

These observations come from public product demonstrations and official documentation, not authenticated end-to-end tests. They do not establish competitors' internal architecture or failure guarantees.

| Product | Observed experience | Useful pattern |
| --- | --- | --- |
| [Tasklet](https://tasklet.ai/) and its [guide](https://tasklet.ai/learn/guide) | Persistent agents and threads; connect services through authorization cards; choose tools per agent; ask for recurring or event-triggered work. The homepage shows drafting support replies and then scheduling that task. | Start with a business job, keep connection/permission actions in explicit cards, and keep recurring work attached to its thread. |
| [Gumloop Gummie](https://www.gumloop.com/blog/gummie-agent) and [lead-generation walkthrough](https://www.gumloop.com/blog/how-to-automate-lead-generation) | Chat plans and creates connected nodes; asks for missing destinations; users can inspect and revise the resulting flow. | Chat and a visible plan work together. Clarifying questions are part of building, not an error. |
| [Zapier Copilot](https://zapier.com/blog/zapier-copilot-guide/) and [testing guidance](https://help.zapier.com/hc/en-us/articles/45327353705997-Best-practices-for-using-Zapier-Copilot) | Natural-language creation and refinement, followed by step testing and publication. | Separate drafting, testing and enabling. Tests can create external records; clearly label where effects occur. |
| [Relay.app human handoffs](https://docs.relay.app/human-in-the-loop/human-in-the-loop-steps) | Runs pause for approvals, typed missing data, real-world tasks or human path selection. | Offer specific human tasks and a clear resolution owner instead of a generic chat confirmation. |

Tasklet already documents tool permissions and approval requests; Relay documents explicit approval steps. Approvals alone are not a defensible distinction. LoopLabs must demonstrate exact action scope, dispatch-time checks, downstream containment and recovery from uncertain effects in the selected workflow. Broader comparative reliability superiority remains unproven.

## Proposed LoopLabs employee experience

Entry: **What work would you like to automate?** IT configures allowed connections and action capabilities. Employees describe work within those boundaries.

Example request: “When a customer enquiry arrives, find their CRM record, prepare a reply using our approved information, ask the account owner to approve it, send it, and follow up after three days if they haven't replied.” This is the target experience, not what the prepared enquiry fixture currently does.

1. **Describe:** accept a request in an authenticated thread. Ask only consequential missing questions: which inbox, which CRM, whose approval, when to follow up, and what cancels it. Offer supported starter jobs.
2. **Connect:** show authorized connection cards and exact read/write/send scopes. Missing integrations are visibly unsupported; never collect secrets in chat.
3. **Review:** display a plain-language plan beside the conversation: trigger, inputs, recipients, changed fields, approved references, approver, limits, timing and cancellation conditions. Let the employee edit it through chat.
4. **Try:** test against FetchSandbox provider twins, including missing data, denied access, stale policy, duplicate events, lost responses and downstream dependency holds. Explain the difference between a twin test and a real provider test account.
5. **Enable:** save a versioned plan after review, with the allowed capability set. Enabling an automation does not approve future consequential actions. Apply independent approval where the configured policy requires it.
6. **Monitor:** show Completed, Needs approval, Needs information and Outcome uncertain. Let users open exact changes, evidence and next safe action. Pause recurring intake separately from handling an in-flight action.

Primary layout: conversation plus a plan/results panel; on mobile, switch between conversation and plan. Keep technical connector details in an IT view. Do not require employees to operate a node canvas, while retaining a readable sequence and dependencies for verification.

## Build boundary and acceptance

The model proposes a typed plan using an allowlisted capability catalog. It cannot invent tools, permissions, recipients or source evidence. A deterministic validator rejects unsupported actions, missing dependencies, ambiguous targets and invalid types. The durable runtime, not model prose or chat memory, owns policy, approvals, dispatch, effect verification and reconciliation. Deterministic checks validate specified contracts; they do not prove all natural-language intent correct.

First acceptance target: one customer-enquiry job, one team, one CRM and one messaging provider. Required proof:

- A nontechnical member describes and edits the supported job without developer help.
- Missing facts produce clarification and no executable plan.
- Changed plans invalidate review; stale facts or policy block delayed dispatch.
- Duplicate delivery/restarts do not duplicate a previously accepted effect under its stable action ID.
- A lost CRM response holds the message; read-back resolves the outcome before continuation.
- Revoked authority, cross-organisation memory and malicious retrieved instructions cannot authorize actions.
- Follow-up is canceled when a qualifying reply or changed customer state arrives; schedules survive restart.

Not yet built: general model planning, adapted RawReply chat/memory, live-provider onboarding, arbitrary workflows and the complete inbound/reply/scheduling loop. FetchSandbox can help prove supported connector behavior, but twin proof does not establish live-provider production guarantees.
