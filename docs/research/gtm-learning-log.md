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

### 2026-10-01 — Five-year market and initial ICP pressure test

- **Period:** October 1, 2026
- **Segment/persona:** Automation and applied-AI owners at 500–5,000 employee B2B companies moving cross-system RevOps or customer-operations agents into production
- **Pain or job:** Let an agent take a consequential action while preserving delegated authority, execution evidence, and a safe response to a duplicate, stale, partial, or uncertain external effect
- **Channel/query:** Company thesis, design-partner qualification, founder narrative, and product roadmap
- **Asset/URL:** `docs/research/2026-10-01-looplabs-five-year-thesis-and-icp.md`
- **Hypothesis:** A vendor-neutral execution-integrity and recovery layer can retain value as builders, identity, inventory, policy, approvals, and observability become native platform features.
- **Evidence observed:** Current platform roadmaps from ServiceNow, SAP, Microsoft, cloud vendors, and n8n show rapid bundling of generic control-plane capabilities. Gartner forecasts movement from assistive AI toward delegated, outcome-oriented workflow execution and specialized domain agents. NIST, the EU AI Act, and financial regulators emphasize identity, authorization, logging, human oversight, audit, and resilience. Current finance, retail, and supply-chain evidence points to agents taking actions across increasingly complex business workflows. The remaining cross-platform gap is proving and recovering the external business effect after authorization.
- **Sample size:** Current cross-industry platform, standards, regulatory, and vertical research plus the LoopLabs claim-to-proof audit; no qualified customer interviews yet
- **Result:** Narrowed the first ICP to a named company size, buyer, function, workflow shape, action type, and buying trigger. Ranked RevOps/customer operations first, finance operations/AP second, and procurement/supplier operations as the next expansion. Defined five mandatory qualification conditions and documented why highly regulated verticals should follow rather than lead.
- **What worked:** Comparing future platform ownership with action-level failure modes separated commoditizing governance features from a potentially durable recovery boundary.
- **What failed or remains unclear:** The thesis is still market inference. LoopLabs has not yet sat in a real execution path, prevented a duplicate effect, reconciled an unknown outcome, or shown that a customer will buy this separately from its workflow or system-of-record vendor.
- **Learning:** The durable company is not a general agent control dashboard. It is the independent execution record and recovery coordinator for workflows whose business effects cross platform boundaries. The first customer should have a bounded, reversible, API-accessible action and a production deadline, rather than the highest theoretical regulatory pain.
- **Confidence:** medium
- **Decision:** improve
- **Next experiment:** Recruit five qualified control-clinic conversations using the five-condition screen. Select one design partner for a live CRM action with server-side policy, an idempotency key, a durable receipt, an external-state check, and recovery before retry.

### 2026-10-01 — Workflow-building entry point versus n8n

- **Period:** October 1, 2026
- **Segment/persona:** Companies interested in agents but lacking a production workflow, plus teams with an existing n8n or custom workflow
- **Pain or job:** Move one business process into production without separating workflow implementation from permissions, approvals, evidence, and recovery
- **Channel/query:** Homepage positioning, founder sales motion, and design-partner offer
- **Asset/URL:** `docs/research/2026-10-01-looplabs-market-positioning.md`
- **Hypothesis:** LoopLabs can serve customers before they have an agent workflow if workflow implementation is a bounded entry into the control plane rather than an open-ended automation service.
- **Evidence observed:** n8n currently offers deterministic and agentic workflow building, RBAC, human approval, input and output guardrails, evaluations, execution history, log streaming, self-hosting, and an expert directory whose partners provide process analysis and production workflow implementation. n8n explicitly argues that governance can live in the execution workflow without a separate control plane.
- **Sample size:** n8n's current enterprise, governance, and expert-partner surfaces; LoopLabs claim audit
- **Result:** Defined two entry paths: build one governed workflow with the customer when none exists, or add action control and reconciliation to an existing workflow. Both must lead to the LoopLabs control plane. Defined the strongest differentiation as cross-runtime authority, separation of duties, shared state, and reconciliation before retry after an uncertain effect.
- **What worked:** Treating n8n as both a substrate and competitor produces a more honest offer than claiming a generic workflow-building advantage.
- **What failed or remains unclear:** LoopLabs has not yet proven that customers will pay separately for an independent control and recovery layer. The current tour does not connect to n8n or another live runtime.
- **Learning:** “We build workflows” is valuable as a service-led entry, but weak as a category. The service must be productized around one bounded consequential workflow and create durable control-plane adoption.
- **Confidence:** medium
- **Decision:** improve
- **Next experiment:** Offer five “Bring us one workflow” control clinics and test whether prospects ask primarily for implementation, approvals and authority, or uncertain-outcome recovery. Select one workflow for a live n8n-or-custom integration slice.

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

### 2026-10-02 — First Friday baseline and launch claim correction

- **Period:** Web analytics September 25–October 2 UTC; saved funnels September 2–October 2 UTC; observed October 2 at the scheduled 01:31 PDT run
- **Segment/persona:** RevOps/customer-operations operators evaluating one consequential agent workflow; segment remains unvalidated
- **Pain or job:** Understand action control and recovery proof without mistaking a prepared prototype for a production workflow builder
- **Channel/query:** Google discovery, PostHog proof funnel, Product Hunt draft
- **Asset/URL:** `docs/research/2026-10-02-friday-growth-baseline.md`; `https://www.producthunt.com/posts/looplabs/edit`
- **Hypothesis:** Trustworthy launch claims and a clean visit-to-proof baseline are prerequisites to deciding which content or conversion change will help.
- **Evidence observed:** Authenticated Chrome DOM access worked despite native Mac lock. Search Console reported zero clicks/impressions, indexing data processing, and sitemap Success with 33 discovered pages. PostHog showed 42 unfiltered web visitors; the test-filtered saved proof funnel showed 33 entrants → 3 CTA/tour starts → 1 simulation interaction → 0 recovery interactions. The separate conversation funnel showed 5 tour starts and zero subsequent booking clicks. The draft was unscheduled, its video field empty, and Raj was the only maker shown. Existing copy claimed production action control and workflow building beyond current proof. Convey's vendor case studies emphasize bounded taught recurring processes; Stripe documents connector-specific idempotency limits.
- **Sample size:** 42 unfiltered visitors and 33 saved-funnel entrants; no qualified buyer interviews, completed meeting evidence, or AEO benchmark
- **Result:** Saved and reloaded corrected prototype-specific Product Hunt copy and a source-tagged canonical-domain link. Recorded baseline, event-definition limitations, launch gaps, and the next proof experiment. No new SEO page or site deployment.
- **What worked:** Existing authenticated Chrome sessions provided aggregate analytics without requiring native unlock. Reviewing event definitions exposed that recovery events measure submitted interactions before validation, not successful state restoration.
- **What failed or remains unclear:** Founder/QA traffic is incompletely excluded. Sample size cannot establish a conversion cause or ICP fit. Google visibility and AEO citations are not yet measurable. Launch video, Pratibha attribution, gallery claim review, and scheduling remain incomplete.
- **Learning:** Separate acquisition, entry, accepted proof outcomes, and buyer intent. A funnel name must not become a success claim. External launch copy can drift after an owned-site claim audit and needs its own proof check.
- **Confidence:** high for observed counts and saved draft; low for market demand or conversion causality
- **Decision:** improve
- **Next experiment:** Follow through on the existing uploaded YouTube video and launch draft; observe five target operators using one CRM proof path. Add validated outcome instrumentation before treating recovery interaction counts as successful activation. Use `analytics_debug=1` for all future automated production QA.
# 2026-10-02 — CRM pilot qualification article

- **Evidence:** User requested a public explanation of the one-workflow design-partner offer. A current practitioner question describes concern about a CRM write timing out after creation and causing duplicates on retry: https://www.reddit.com/r/n8n/comments/1wvh8h1/help_preventing_duplicate_leads_when_a_crmapi/. This is one scenario question, not a verified incident or customer commitment. n8n's published outreach template already includes manual approval: https://n8n.io/workflows/9813-generate-personalized-sales-outreach-with-gpt-across-linkedin-email-and-whatsapp/ (checked October 2).
- **Persona / pain / channel:** RevOps and customer-operations workflow owners; “did the CRM update happen, and can I retry?”; owned blog with search discovery and design-partner evaluation intent. No keyword-volume estimate or ranking evidence is available for the new page.
- **Decision gate:** Buyer pain 4, trigger 4, product proof 4, differentiation 4, channel fit 4, conversion fit 5, measurement 4, originality 4; average 4.125. Proof is the existing browser-local approvals and version-aware reconciliation demos, not a live connector. The post labels proposed pilot acceptance criteria separately.
- **Variation:** RevOps + timeout-after-record-update + CRM write; pilot acceptance checklist. Compared with the permissions article, the persona, triggering incident, and format differ. Compared with the HubSpot recovery guide, this explains pilot qualification and responsibilities rather than implementation/rollback instructions. Internal links connect the two rather than creating another recovery landing page.
- **Action:** Build `/blog/2026-10-02-ai-crm-workflow-pilot`, link it from the homepage's founder-conversation section and permissions article, and use existing canonical metadata, Article/Breadcrumb structured data, generated social image, sitemap, RSS, and AI-readable writing index. Fix RSS freshness and disclose prototype limits in `llms.txt`.
- **Result / confidence:** Four focused regression checks pass before the full release gate. Publication and indexing are separate stages; no traffic gain is claimed. Confidence is moderate in relevance, low in acquisition volume until measured.
- **What worked / failed / lesson:** Existing proof can explain the offer without claiming a production platform. A previously suggested n8n human-review documentation URL returned a missing page; use the verified template instead. Native approval already exists, so qualify a specific authority/recovery gap before proposing LoopLabs.
- **Next experiment:** After publication, review this exact URL in Search Console after 7 and 14 days for index status, impressions, queries, and clicks. In PostHog, filter `site_page_viewed` by this landing path and organic search, then measure `product_tour_cta_clicked` and subsequent `demo_booking_clicked`. Count booking clicks as intent, not booked calls. With impressions but weak clicks, revise title/description; with visits but weak proof engagement, improve the example/CTA. Do not create adjacent posts without new evidence.
