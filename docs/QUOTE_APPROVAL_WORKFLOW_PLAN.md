# Distributor quote approval: bounded implementation and acceptance

Status, October 10, 2026: planned workflow; not a completed end-to-end demo.

The intended story is a distributor requesting a 14% discount against a 10% delegated limit. A different named sales manager reviews the exact quote change. The provider accepts the write but its response is lost. LoopLabs must read back the effect, prevent a duplicate update, and permit the separately approved customer acknowledgement only after the exact quote change is verified.

## What can be reused, and what cannot be claimed

| Stage | Existing foundation | Missing work |
| --- | --- | --- |
| Identity and boundary | Registered scoped agents, invited members, persisted allowances and record grants | A quote/opportunity scope and connector capability; a contact lifecycle grant is insufficient |
| Discount decision | Controlled PostgreSQL discount action, soft/hard limits, record-version binding and approval expiry | The database test record is not a CRM opportunity or commercial quote |
| Independent approval | CRM/message requester separation | Discount separation added in the working branch; historical self-approvals must be refused at claim and effect time |
| CRM effect | Contact twin's atomic version contract, action journal and read-back | A quote adapter that atomically checks approved quote version, exact discount, workspace, record and action ID; provider support must be verified |
| Downstream message | Existing fixed acknowledgement, exact named approval and verified CRM-contact dependency | Quote-specific template and a persisted dependency on the verified quote effect; the current contact graph does not have this dependency |
| Durable scheduling | Pluggable admission interface and opt-in Temporal outbox/history | Quote graph registered behind the same interfaces, with current-source integration/recovery evidence |
| Product view | Chat, exact saved plan, inline decisions and outcome details | Typed quote request and deterministic validated quote-plan contract; never reinterpret a quote request as an acknowledgement |

The existing discount record is a controlled database connector. Showing its successful update does not establish CRM integration. The fixed acknowledgement cannot be described as a revised quote email. The current workflow table restricts steps to CRM-contact and email operations. Extend it with a new migration and versioned workflow kind; do not edit released migrations, overload the lifecycle field, or introduce another approval/policy engine.

## Build sequence

1. Close independent discount approval using the existing append-only proposal event; prove self-approval/replayed attribution, absent requester evidence, independent approval, old invalid approvals at dispatch and mid-lease revocation.
2. Define a narrow immutable quote plan: workspace, quote ID, distributor identity, source version, requested discount, active policy version, exact conditional provider request, prepared email recipient/body, dependency and action IDs. Save only validated plans. Unknown pricing, currency, line items, policy, approver or provider capability must stop or clarify.
3. Add one explicitly scoped quote provider-twin contract. Confirm its actual schema and support for atomic version enforcement. Reuse connector transport, binding, action journaling and observation; do not infer writes from a successful HTTP response or from another contact adapter.
4. Extend the persisted workflow's step adapter registry and migration for this graph. Reuse identity, grants, approvals, leases, outbox and orchestration admission. Email dispatch checks verified matching quote effect server-side, including after restart.
5. Render the plan, proposed discount, policy reason, independent decision, uncertain write, read-back and held/verified email in the chat artifact panel. Technical payloads remain inspectable behind details. Setup and execution authority remain separate.
6. Validate from the typed request with two actual named members against disposable provider twins. Run required regression gates and release only through the standard process.

## Demo acceptance (actual UI and provider evidence required)

- 14% above delegated 10% holds; above hard cap blocks.
- Requester self-approval and hostile-origin approvals are refused without effects.
- Correct independent approval binds the exact record, quote, policy, payload and expiry.
- Changed quote or policy after approval refuses the write and the email.
- Accepted write with lost response becomes uncertain; read-back finds exactly one effect.
- Duplicate request/replay produces no second quote update or customer message.
- Email cannot dispatch while quote is held, rejected, uncertain or conflicting.
- Worker restart resumes the same saved plan, IDs and dependency without renewing authority.
- Separate email refusal/lost response remains contained and independently reconciled.
- Another workspace/agent/record cannot read, approve, route or affect the run.
- Receipt reports observed twin effects, actor identities and unresolved checks; no live delivery, CRM parity, signed certificate or production-readiness claim.

## October 10 checks

35 focused working-branch UI/member/durable tests passed, including the independent discount approval prerequisite. These are not quote-workflow acceptance. The full repository gate has stale source-bound runtime evidence after application changes and must be rerun against fresh measured trials. Never update a receipt hash to make a changed implementation appear tested.

Latest full gate: 656 tests passed and 18 retained source-bound evidence tests refused changed code (674 total). These refusals are expected evidence invalidation, not passing runtime proof. No release or deployment was performed.

## Parallel contract increment: October 10

`lib/quotes/plan.ts` now implements the standalone `distributor-quote-plan-1`
proposal boundary. It accepts an exact proposal only against separately supplied
current server context: quote/source/pricing, policy limits, scoped agents,
independent quote-discount approval grants, quote-bound recipient and explicit
atomic/idempotent/read-back provider capability. It creates a deep-frozen proposed
conditional quote request and a separately approved message dependency. It neither
enrolls a provider nor grants execution authority. Approval and dispatch must
revalidate current database authority when this contract is integrated.

84 focused tests passed with 100% statements, branches, functions and lines for
the new contract. Adversarial cases include absent/malformed/duplicate grants,
self-approval, another workspace/quote/policy, stale source, unsupported capability,
wrong dependency and ambiguous pricing. The new folder is included in the shared
coverage gate at the existing 90/85/90/90 thresholds. Scoped lint and TypeScript
passed. Full quality reports 762 passes and two failures: stale reset evidence and
the existing local Docker enrollment timeout. No application commit or deployment.

The provider adapter, persistence, chat intent, quote graph, durable worker version
and actual UI/provider proof remain open. These unit tests are not an end-to-end
quote demonstration or evidence of a live commercial integration.

Provider implementation requirements and the observed contacts-only gap are recorded in `FETCHSANDBOX_QUOTE_HANDOFF.md`.
