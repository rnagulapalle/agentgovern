# Three-session proof-to-call experiment — October12–18

Internal worksheet, not evidence that sessions or customers exist. Target: three independent workflow owners, two confirmed qualified bookings and one attended qualified conversation. Do not put prospect names or contact details in public Git.

Before a session verify the invited account, the exact evaluation build, provider-twin scope, working sales intake and canonical booking link. The existing private quote recording is bounded evaluation evidence; it is not a live customer-system or whole-platform acceptance certificate. Public claims must match the released surface.

Use one fictional CRM-to-message case: an upstream update times out and a downstream customer message stays held until the actual effect is read back. Ask the participant, before explanation: what happened, what can happen next, and who may authorize it? Record their answer verbatim privately. Separately ask about their recurring handoff, its consequence, current tools, owner and an unresolved native-stack gap.

| Field | Required observation |
| --- | --- |
| Participant reference | Private anonymized ID; independent of founder/QA |
| Ownership | Role and workflow responsibility, observed rather than inferred from title |
| Pain | Concrete recurring consequence and current workaround |
| Stack and integration owner | Actual systems and person able to authorize access |
| Comprehension | Unaided explanation of the held message and uncertain upstream outcome |
| Native-control gap | Why existing tools are insufficient; unknown if not answered |
| Accepted sales request | Actual acceptance record; distinct from CTA click |
| Confirmed reservation | Authoritative calendar record and source correlation; no test bookings counted |
| Attendance | Actual conversation occurrence, separately verified |
| Willingness | Explicit next step for one bounded pilot; not assumed from politeness |

Continue if at least two of three independent owners explain the boundary and identify an unresolved native-stack gap, and at least one explicitly accepts a qualified next step. This is a learning threshold, not statistical validation. Revise if the native stack suffices, no integration owner exists, interest is only bespoke automation, or no qualified next step emerges. Do not broaden content to compensate.

The growth agent prepares and analyzes sessions. Raj/Pratibha identify willing participants; private invitations require explicit recipient authorization. No messages are sent by this worksheet.

The conversion change remains the existing scope correction plus verified booking correlation. Acceptance checks: anonymous overview describes invited access; bounded planner does not imply execution authority; sample/twin limits remain visible; sales request acceptance is distinguished from reservation; duplicate booking-created events do not inflate counts; cancellation updates the reservation without erasing its history; attendance and qualification are independent fields. Engineering implementation needs the normal tests and clean standard release; this worksheet does not waive them.

## November 2–8 protocol: one existing workflow, one measurable boundary

This extends the same worksheet; the October targets above remain historical. Current targets are 2 independent operator evaluations, 1 confirmed qualified booking, 1 attended qualified conversation and 1 explicit bounded-pilot fit decision. All are targets, not observed outcomes.

Ask the owner to choose one existing consequential action. Record this skeleton before proposing a LoopLabs integration:

| Contract field | Ask and require evidence | Refusal or uncertainty check |
| --- | --- | --- |
| Execution owner | Name the existing workflow/version, executor and state store. Identify the sole owner of the effect. | Can any other route perform the same write without this check? Do not add another executor. |
| Acting identity | Separate the authenticated initiator, workload agent, delegated employee and independent reviewer. | A department label or synthetic employee directory is not authenticated authority. |
| Exact scope | Identify the tool operation, allowed records/recipients and actual credential holder. | Test an out-of-scope record and recipient; unspecified scope stays denied. |
| Approval | Bind the actual payload, policy/source versions, reviewer authority and expiry. | Test self-review, wrong reviewer and changed/stale payload separately. |
| State and containment | Identify pause/revocation checks before dispatch and who can resume. | Pausing must not be represented as recalling an already dispatched effect. |
| Effect and retry | Record stable action key, provider lookup and uncertainty handling. | Lose the response after the write; inspect the effect before retry. A different action ID is a different request. |
| Evidence | Keep source/version, request, decision and independent effect receipts separate. | A deployed image or directory entry does not establish native acceptance. |
| Commercial fit | Capture recurring pain, consequence, current stack, integration owner and explicit willingness for one bounded pilot. | Native controls may suffice. Discussion, CTA click and accepted intake are not bookings. |

Use the existing CRM-to-message case first. [Recorded onboarding proof](../WORKFLOW_ONBOARDING_PROOF.md) describes fixed step identities, held downstream dispatch and controlled response-loss/reconciliation tests. [Connector limits](../CONNECTOR_VERIFICATION.md) distinguish fixture source-version checks, named approval and hosted email limits. Recheck the exact case/version selected for a session; these documents do not establish acceptance of an arbitrary customer workflow.

Optional second illustration: the separately recorded preparation-v5 API case on web f6e77f9 and native source3d96f14. Self/nonreviewer requests returned403, stale revision/replay409, and exact approval200; independent sandbox readback found one linked campaign/adset/creative/ad, paused delivery and four reconciliation matches. Its initiator was scripted/synthetic. Browser approval, authenticated initiating-human separation, live Meta delivery and other workflows remain unproved. Keep this receipt separate from the CRM case; do not reenact an effect just to fill a demo.

Ask what the current native stack already provides. LangGraph documents checkpointed interrupts and same-thread resume, including restarting the interrupted node from its beginning. Code before the interrupt can run again. This supports inspecting idempotence and boundary placement; it is not evidence of a vulnerability or a LoopLabs feature. Source: [LangGraph interrupts](https://docs.langchain.com/oss/python/langgraph/interrupts), read November2.

Stop after two independent owners find their native controls sufficient or cannot identify recurring pain/integration ownership. Record unknowns and the next evidence request privately; no invitations or public distribution are authorized by this worksheet. No participant has been counted by preparing it.


## November 4: exact email approval and response-loss evidence

Reuse this worksheet and the existing executor/harness; this is a proposed acceptance sequence, not a passing trace or invitation. Keep these fault paths separate before attempting a combined scenario:

| Path | Required observation | Refusal / uncertainty evidence |
| --- | --- | --- |
| Baseline | Independent approval binds exact recipient/content and relevant versions; permitted request uses the existing execution owner. | Record decision and actual provider result separately. |
| Offer changes after approval | Change approved content or its bound source version before dispatch. | Old approval cannot authorize the changed send; record refusal/fresh approval requirement and independently verify no unauthorized effect. |
| Accepted, response lost | Provider accepts the exact approved email, then transport response is lost. | Correlate stable action key/acceptance and independently retrieve exact recipient/content; no blind resend. Acceptance is not inbox delivery. |
| Acceptance cannot be resolved | Acceptance lookup/read-back is absent, contradictory or inaccessible. | Preserve uncertainty/containment; do not relabel timeout as success/failure, invent delivery or retry an irreversible send. |
| Replay | Retry the same logical action through its sole owner after verified outcome. | Independently show no duplicate effect; a new action ID is not the same replay test. |

For each actual receipt record build/workflow/tool-contract versions, execution owner, request/payload binding, policy/grant/source versions, decision, independent reviewer, transport observation, correlated provider acceptance, effect lookup and retry disposition. Keep IDs and payloads private. Record runner/provider and adapter prerequisites before promising compatibility. Separate fixtures, native provider behavior and deployed UI/account acceptance. A synthetic failure injection is not an observed customer incident. No production credentials/customer data are needed for the initial guided test; no general zero-code integration is implied.

Stop the trial if native controls already satisfy the owner or the exact proposed integration cannot enforce the boundary. Do not promise a passing trace or count agreement from preparing this protocol.
