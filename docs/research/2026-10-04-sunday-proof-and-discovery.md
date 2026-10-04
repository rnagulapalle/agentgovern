# Sunday evidence review and Monday operator experiment

Observed October 4, 2026. Internal research and experiment preparation; no outreach,
public post, customer interview or live customer integration occurred in this run.

## Decision

Use the newly hosted refund walkthrough to test comprehension with customer-operations
owners and COOs responsible for refunds or customer credits. Keep restaurant
complaint handling as discovery, without changing the primary product promise.
The strongest new evidence is shipped technical proof, not validated demand.

Monday's asset should explain one uncertain refund and its recovery, with the
operator naming who approves it. Do not publish another general automation page
or claim production readiness from the test provider. Have five independent
operators try the proof before interpreting it as a market win; five is a target,
not an achieved sample.

## Evidence and independence

- The hosted `/control-plane/refunds` walkthrough passed public HTTPS login,
  Secure session, amount-bound approval, execution, hard-limit blocking,
  post-write response loss, reconciliation without a second refund, proposal
  replay and anonymous denial on October 4. The private verification artifact
  records two test-provider effects added. It is not a customer conversion event.
  Mobile at 390px had no horizontal overflow, 18px body copy, 16px minimum details
  and no browser errors. See `REFUND_AGENT_PROOF.md` and the separate durable
  workspace documentation for the scope and limitations.
- The [restaurant discussion](https://www.reddit.com/r/learnAIAgents/comments/1wwini3/ai_agents_are_everywhere_but_what_would_you/)
  accessible rendition still shows the three baseline comments. The
  [restaurant account](https://www.reddit.com/r/learnAIAgents/comments/1wwini3/comment/pdku6c1/)
  is second-hand: delayed complaint discovery, roughly four platforms, Make plus
  a spreadsheet and draft replies. No stated review volume, venue identity,
  willingness to pay or pilot commitment. Relative timestamps are insufficient
  to prove absence of live edits; no new verified owner signal was observed.
- A search surfaced a [duplicate-refund discussion](https://www.reddit.com/r/n8n/comments/1wqbmxn/my_refund_agent_went_rogue_in_prod_and_issued_the/).
  Its original poster matches the founder's account documented in the local
  account playbook. Exclude the original post and its replies by that author
  from independent demand evidence. Peer replies are qualitative feedback with
  unverified affiliation and identity, not independent customer incidents,
  purchasing intent or qualified leads. Do not recycle the post as market proof.
- [Stripe's official idempotency reference](https://docs.stripe.com/api/idempotent_requests)
  describes replaying the same result and parameter mismatch rejection. Keys
  may be removed after at least 24 hours; reusing a pruned key can create a new
  request. These limits support durable intent and outcome verification; they
  do not establish universal exactly-once effects for LoopLabs.
- [n8n's official human-review reference](https://github.com/n8n-io/skills/blob/main/skills/n8n-agents-official/references/HUMAN_REVIEW.md)
  already describes approval before a wrapped tool runs and displaying its actual
  parameters. Approval alone is insufficient differentiation. A previously
  suggested n8n documentation URL returned Page Not Found; use this verified
  reference instead.
- [Birdeye's response-agent instructions](https://support.birdeye.com/en/articles/12654785-how-to-configure-and-use-the-review-response-agent)
  already cover reply generation, human approval, locations and preview testing.
  [Make's Google connector](https://www.make.com/en/integrations/google-my-business)
  offers review-reply creation/update. The founder needs evidence of a gap beyond
  what the restaurant's existing software solves.
- [Google's reply endpoint](https://developers.google.com/my-business/reference/rest/v4/accounts.locations.reviews/updateReply)
  requires authorized access to a verified location.
  [API policy](https://developers.google.com/my-business/content/policies)
  requires prior specific express consent for automated actions. Supported
  account access and consent must precede any restaurant pilot. These are
  connector constraints, not a generic promise of one-click onboarding.

## Monday session: can an operator explain the control loop?

Target a COO or customer-operations owner with frequent refund or customer-credit
exceptions, an identifiable approver and an existing payment/support system.
An implementation engineer can accompany the owner; do not substitute an agent
inventory discussion for an operational problem. Restaurant discovery should
prefer warm, reachable Bay Area operators and ask about complaint or catering
handoffs; do not assume ethnicity or location establishes software demand.

Use an authorized private workspace invitation. Do not include operator tokens
in a public document, social post, video or outreach draft. Start the walkthrough
with the disclosure: PostgreSQL records actual control transactions; the payment
provider is a prepared FetchSandbox twin; no money moves and no model reasons
about a customer case. This is facilitated evaluation, not open self-service.

1. Before showing the product, ask for the last confusing refund or customer
   credit, current tools, who approves it, exception volume, and handling time.
   Ask whether it was a model, workflow, network or provider failure. Accept
   redacted cases; do not collect customer payment details.
2. Show $5 ready, $25 requiring exact approval and $150 blocked. Ask the operator
   to explain the difference without the founder supplying the answer.
3. Lose the response after a test refund is recorded. Ask, before reconciliation,
   whether they believe another refund should be sent and what evidence is needed.
4. Reconcile and replay the same proposal. Ask what happened to the provider
   record, who is accountable and what remains unproven for their live system.
5. Discuss a single bounded pilot only if the gap survives comparison with native
   controls. Agree an owner, integration rights, shadow-mode scope, acceptance
   checks and an exit criterion. Do not promise that sent refunds can be undone.

Record job role, existing stack, documented exception, independent source,
comprehension before/after, approval-owner clarity, requested integration,
manual assistance needed, explicit next step and willingness to discuss a paid
pilot. Ask permission separately before retaining any recording or testimonial.

Proposed decision rule: continue the wedge if at least three of five operators
identify an existing unresolved authority/recovery gap and at least two agree
an explicit follow-up on one real workflow. These thresholds are experimental,
not statistical validation or promised results. If native controls suffice or
participants only want a free bespoke automation build, revise the offer.
No private messages or emails were sent by this run.

## Measurement and launch status

Fresh Search Console and PostHog values were unavailable: the existing Chrome
Apple Events request did not return and local CDP was unavailable. Keep the
October 2 baseline dated; do not treat its 0 Google impressions or 33 funnel
entrants as today's numbers. The AEO results CSV still has only its header.
One empty exact-domain web search is a diagnostic, not a Google rank or a
30-prompt answer-engine benchmark. No measured acquisition improvement exists.

The local YouTube manifest records nine public Shorts and episode 10 blocked by
an upload quota; this run could not independently inspect the live channel.
The public Product Hunt lookup was unavailable, so launch/draft/scheduling status
is unverified today. Do not upload duplicate videos, claim a launch happened,
or attach an unverified video URL. The morning account follow-through should
inspect the existing authenticated Search Console, PostHog, PH draft and YouTube
channel, prioritizing today's launch status before further publishing.

Public-asset gate remains unmet: independent buyer pain and qualified conversion
fit are not established. This internal interview protocol closes an evidence gap;
it is not an SEO page or a public lead magnet. Current website code needs no
change from this research. Preserve the existing canonical site and release.
