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
