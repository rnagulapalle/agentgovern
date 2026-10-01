# LoopLabs GTM learning log

This file is the persistent memory for LoopLabs SEO, AEO, PR, distribution, and conversion experiments. The nightly GTM automation reads it before taking action and updates it only with observed evidence.

## Operating rules

- Separate observation from inference.
- Include the source, date, sample size, and URL when available.
- Do not call a change successful without a measurable outcome.
- Do not infer buyer intent from one anonymous visit.
- Keep failed experiments. Record why they failed and what changes next.
- Use confidence levels: low, medium, or high.
- Every experiment ends with one decision: continue, improve, consolidate, or stop.
- Public claims still require product proof or a clearly labeled limitation.

## Current baseline — September 30, 2026

- Search Console property verified for `looplabs.run`.
- Sitemap submitted successfully with 32 discovered URLs.
- Initial Search Console performance and indexing reports are still processing.
- Googlebot, OAI-SearchBot, and GPTBot can reach the live homepage.
- PostHog records acquisition, landing pages, tour sections, proof interactions, and founder-conversation clicks.
- The fixed AEO benchmark contains 30 unbranded buyer questions.
- No reliable non-branded ranking, answer-engine citation, or conversion winner exists yet.
- Current hypothesis: buyers understand LoopLabs fastest through a concrete action failure followed by allow, hold, block, approve, and reconcile product proof.
- Current default wedge until evidence changes it: RevOps and vendor operations controlling CRM writes and external communication.

## Experiment record template

Copy this block for each material experiment or weekly synthesis.

```markdown
### YYYY-MM-DD — Short experiment name

- **Period:**
- **Segment/persona:**
- **Pain or job:**
- **Channel/query:**
- **Asset/URL:**
- **Hypothesis:**
- **Evidence observed:**
- **Sample size:**
- **Result:**
- **What worked:**
- **What failed or remains unclear:**
- **Learning:**
- **Confidence:** low | medium | high
- **Decision:** continue | improve | consolidate | stop
- **Next experiment:**
```

## Weekly synthesis template

```markdown
### Week ending YYYY-MM-DD

- **Strongest observed persona and pain:**
- **Best discovery query or referring source:**
- **Best proof interaction:**
- **Largest funnel drop:**
- **SEO movement:**
- **AEO citation and description movement:**
- **Earned mentions/backlinks:**
- **Qualified founder conversations:**
- **Claims or proof gaps:**
- **Continue:**
- **Improve:**
- **Consolidate:**
- **Stop:**
- **Next week's primary outcome:**
- **Next week's asset, distribution path, and conversion experiment:**
```

## Experiments

### 2026-10-01 — Control-plane category and wedge review

- **Period:** October 1, 2026
- **Segment/persona:** Applied-AI, agent-platform, automation, security-engineering, RevOps, and customer-operations teams operating agent workflows that mutate systems of record
- **Pain or job:** Control consequential agent actions and avoid unsafe retries when a multi-agent workflow leaves an external outcome uncertain
- **Channel/query:** Category positioning, SEO/AEO strategy, founder narrative, and design-partner targeting
- **Asset/URL:** `docs/research/2026-10-01-looplabs-market-positioning.md`
- **Hypothesis:** “Agent control plane” helps buyers understand the category, while execution integrity and recovery around consequential multi-agent workflows gives LoopLabs a more defensible wedge than generic identity, inventory, observability, or policy messaging.
- **Evidence observed:** Microsoft Agent 365 publicly positions a cross-platform control plane around registry, identity, observability, governance, security, and lifecycle management. AWS AgentCore Policy enforces deterministic agent-to-tool rules and now describes temporal controls for action order, prerequisites, data freshness, and human approval. Google Cloud describes Agent Identity and Agent Gateway for identity-aware agent-to-agent and agent-to-tool enforcement. Runlayer covers enablement, governed access, runtime security, observability, and spend. Agent Identity covers per-agent identity, secrets, communication channels, endpoints, permissions, and audit logs. The LoopLabs claim audit shows that its current prototype most clearly demonstrates a closed loop across delegated authority, action decisions, approval or containment, execution supervision, output checks, receipts, and version-aware sample-state reconciliation.
- **Sample size:** Five current product/category sources plus the shipped LoopLabs prototype and claim audit
- **Result:** Kept “agent control plane” as the category term. Changed the provisional wedge to execution integrity and recovery for consequential multi-agent workflows. Changed the initial customer hypothesis from broad traditional organizations adopting chat assistants to teams already operating an agent workflow that changes a system of record. Kept RevOps/customer operations as the first proof wedge because it has the closest current demo match. Clarified that workflow building is founder-led early-access implementation, not a shipped self-serve builder.
- **What worked:** Comparing current primary-source product language against the claim-to-proof matrix exposed where the category has commoditized and where LoopLabs has a more specific story.
- **What failed or remains unclear:** This is a strategic inference, not validated demand. No design-partner interview, qualified conversation, or meaningful funnel sample yet proves the chosen buyer or wedge.
- **Learning:** Category language and differentiation should be separated. LoopLabs can use “control plane” to be understood while testing a narrower action-to-recovery promise. The next evidence must come from buyer conversations and behavior, not more positioning copy.
- **Confidence:** medium
- **Decision:** improve
- **Next experiment:** Use Product Hunt and five targeted design-partner conversations to test whether buyers respond more strongly to action authorization, multi-agent run control, or uncertain-outcome reconciliation; measure which proof state they enter and which problem they describe in their own words.

### 2026-10-01 — Founder identity and claim-transparency surface

- **Period:** September 30–October 1, 2026
- **Segment/persona:** Security, compliance, and operations buyers evaluating a new agent-control product
- **Pain or job:** Verify who is behind the product, what the current demo proves, and which behaviors remain simulated
- **Channel/query:** Organic search and answer-engine entity/credibility checks
- **Asset/URL:** `https://looplabs.run/about`
- **Hypothesis:** A named-founder About page with explicit product-stage and publishing standards will make the company easier to verify and reduce ambiguity when a buyer or answer engine evaluates product claims.
- **Evidence observed:** Search Console still had no processed performance baseline at the prior check. The PostHog API returned HTTP 503 during this run, and the locked laptop prevented browser dashboard inspection, so there is no traffic or conversion conclusion. Current practitioner discussion continues to ask for agent identity, initiating human, policy version, approval identity, and external result in one audit record ([r/GRC, September 29](https://www.reddit.com/r/grc/comments/1wt40x8/how_are_you_auditing_actions_performed_by_ai/)); SAP describes human oversight and an audit trail for agent actions in its enterprise control model ([SAP Joule Agents Compliance Brief](https://www.sap.com/documents/2026/06/526001c1-567f-0010-bca6-c68f7e60039b.html)).
- **Sample size:** Two external evidence sources; no usable site-performance sample
- **Result:** Added and deployed a uniform `/about` page naming Raj Nagulapalle and Pratibha Sharma, documenting early-access scope, demo limitations, publishing standards, and founder contact. Added organization/founder structured data, internal footer links, and sitemap registration. The production build generated 58 routes; 30 tests passed. Release `looplabs-web:looplabs-20261001T121114Z` is live. The page returns HTTP 200 through Cloudflare, contains both founders and the disclosure copy, and the live sitemap now contains 33 URLs including `/about`. IndexNow accepted the new URL with HTTP 202. Google URL inspection remains pending because the laptop was locked during this run.
- **What worked:** The existing claim audit supplied exact, defensible language for demonstrated and simulated behavior.
- **What failed or remains unclear:** No evidence yet that founder attribution changes discovery or conversion. Analytics access was unavailable during the run.
- **Learning:** Entity and trust foundations were incomplete even though technical crawl foundations were present. Credibility work must remain explicit and demo-backed; it cannot be inferred from product UI alone.
- **Confidence:** medium
- **Decision:** improve
- **Next experiment:** Submit and inspect `/about`, then measure whether launch and organic visitors use the About-to-tour or About-to-founder paths. Strengthen the audit-record proof next if current practitioner language persists.
