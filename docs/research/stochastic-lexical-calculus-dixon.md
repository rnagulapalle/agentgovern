# Stochastic Lexical Calculus for Language-Model Risk in Finance

**Author:** Matthew F. Dixon (Artificial Intelligence Finance Institute · matthew.dixon@aifi.org)
**Source:** `~/Downloads/Ai_Governance_Dixon.pdf` (46-slide seminar deck), shared by Matt.
**Companion books:** Springer research monograph *Stochastic Lexical Calculus: Foundations of Semantic Measurement, Statistical Identification, and Filtering from Language Probabilities*; Wiley *Building Trust in Agentic AI for Finance: Quantitative Methods for AI Governance and Model Risk Management*.
**Public benchmark:** belieflens.org (research/reproducibility only; no vendor claim).
**Key arXiv refs:** 2607.17447 (calibrating semantic uncertainty), 2607.23130 (semantic observation kernels), 2606.29406 (adaptive AI delegation / Bayesian governance policy). Builds on Wonham (1965) nonlinear filtering, Birkhoff (1957), van Handel (2009), Davis (1993).

> **One-line thesis:** *Qualify the state. Filter the evidence. Govern the action.*
> Language-model probabilities are **measurements** with error; the paper builds the statistics to measure that error and use it to govern when an LLM is allowed to act.

---

## 1. The core idea — "lexical risk" as a new model-risk category

**Lexical risk** = uncertainty in a model's measured state or recommended action induced by **how fixed information is expressed, interpreted, or represented in language.**

Same authenticated evidence `e` → an LLM changes its probabilities when **wording, order, numeric format, or service conditions** change. This is distinct from:
- **not market risk** — the financial evidence can be unchanged;
- **not ordinary data error** — the evidence can be correct and authenticated;
- **not only parameter risk** — the same fitted service varies by presentation;
- **not captured by confidence** — a concentrated (high-confidence) answer can still be unstable.

**Goal of the framework:** *enable runtime governance of LLMs by identifying, measuring, and managing language-related model risk.* Prompt engineering can pick a presentation; it **cannot** establish identification, calibration, invariance, or stability.

---

## 2. The two probability spaces (the bridge problem)

- **Language space `L`:** the LLM assigns a probability law `Q_u(·|e)` over possible **text responses** (under prompt `u`, evidence `e`).
- **Declared-state simplex `Δ^{K-1}`:** the banking task is defined over `K` declared states (e.g. `{risk-on, mixed, risk-off, insufficient-info}`).

These are **different probability spaces.** The bridge is a **reference/target posterior** `π*(e) = L(X|e) ∈ Δ^{K-1}`, defined **independently of the LLM** (an independent reference model / expert-assessed benchmark). Everything hinges on comparing the LLM's language probabilities to this external target.

---

## 3. The five-step pipeline

`Semantic map → Calibration → Lexical algebra → Dynamics & filtering → Governance`
(*algebra precedes dynamics precedes governance* — a state is only meaningful if information-equivalent contexts stay equivalent after admissible updates.)

### Step 1 — Semantic measurement (map language → declared meanings)
Measurable **semantic map** `Φ : L → S ∪ {∂}` groups meaning-equivalent complete responses (`∂` = residual / uncovered probability mass). Its **pushforward** acts on the language law:

```
p^Φ_u(e) = Φ_# Q_u(·|e) ∈ Δ_K        p^Φ_{u,k}(e) = Q_u( Φ^{-1}{s_k} | e )
```

i.e. **add up the probability mass of every phrase that means the same declared state.**
Example: `"bullish"(.45) + "rally"(.15) → risk-on .60`, `"mixed signals"(.25) → mixed`, `"defensive"(.15) → risk-off` ⇒ semantic composition `(.60,.25,.15)` (+ residual mass `p_{u,∂}`).
Note the objects differ: `p^Φ ∈ Δ_K` (K masses **+ residual**) vs `π* ∈ Δ^{K-1}` (K states only).

### Step 2 — Identification & calibration
Fit a calibration map `ψ_u` so the calibrated estimate matches the target:

```
π̂_u(e) = ψ_u( p^Φ_u(e) )        fit ψ on frozen benchmark pairs  p ↦ π*,  then LOCK it
```

Corrects systematic over-/under-confidence learned on benchmark cases, then is **evaluated on held-out cases.** Example: semantic `(.60,.25,.15)` → calibrated `π̂ = (.53,.27,.20)` vs target `π* = (.50,.30,.20)`.

### Step 3 — Lexical qualification (prompt invariance + algebraic closure)
Keep evidence, states, horizon fixed; apply an **evidence-preserving prompt rewrite** (change wording, don't add/remove/reorder evidence). Do calibrated outputs stay equivalent? A paired difference diagnoses sensitivity, but you need a **lexical algebra** to say *which* changes are legitimate and how they compose. Operator family:

```
A = {id, r, o, a_Δe}     r = rephrase,  o = reorder,  a_Δe = add new evidence
```

Properties: identity; typed composition (`o∘r` when domains match); **evidence class** (`r,o` preserve evidence, `a_Δe` changes it); **descent** `Φ(g(c)) = ḡ(Φ(c))`.
Equivalence `u ∼_E u'` = "same evidence, different presentation."
**Closure criterion:** equivalent presentations must agree **now** *and* remain equivalent **after admissible compositions** — else the state has omitted relevant language information.

### Step 4 — Dynamics & filtering (infer the latent financial state)
Treat the qualified, calibrated measurement `Y_t := π̂_t` as a **noisy observation, not the state.** Combine with a financial-state model via a **Wonham (Bayesian) filter**:

```
π_t = F_{Y_t}(π_{t-1}) = (π_{t-1} P G_{Y_t}) / (π_{t-1} P G_{Y_t} 1)
G_y = diag{ g(y|1), …, g(y|K) }
```

- `P_ij = Pr(X_t=j | X_{t-1}=i)` — financial-state transition (economic regime model / estimation / stress design / expert restriction).
- `g(y|x)` — **validated** likelihood of the qualified lexical measurement given state `x`.
- **Critical:** *filtering cannot repair an invalid measurement likelihood* — which is why Steps 1–3 must pass first.

**Risk envelope (governance buffer):** validation leaves a *class* of plausible likelihoods `G_t`. The admissible posterior set is

```
Π_t = { F^g_y(π) : π ∈ Π_{t-1}, g ∈ G_t }
```

For a scalar exposure functional `q(π)`, report `[q_t, q̄_t] = [inf, sup] over Π_t`. The width **`q̄_t − q_t` is an observable lexical-model-risk buffer** → a wide buffer triggers review, reduced limits, or restricted LLM authority.

### Step 5 — Governance (authorize the action, or withhold authority)
**Decision regret** (action `a`, state `k`, declared loss `c(a,k)`):

```
R(a,π) = Σ_k c(a,k) π_k        a*(π) = argmin_a R(a,π)
Reg(π̂;π) = R{a*(π̂),π} − R{a*(π),π}          0 ≤ Reg ≤ 2 L_c d_TV(π,π̂)
```

`L_c` = largest statewise loss oscillation, `d_TV` = total-variation distance. This **prices lexical measurement error in the same units as the decision loss.**

**Authorization certificate** — let `Γ̂` = estimated gap between best and second-best action under `π̂`:

```
if   Γ̂ > 2 L_c d_TV(π,π̂)   then   a*(π̂) = a*(π)   →  action is robust → AUTHORIZE
else  →  WITHHOLD authority (review / abstain / acquire evidence)
```

**Authority control** blends AI with a reference by an authority weight `α(a_t)`:

```
u^exec_t = α(a_t) u^AI_t + {1 − α(a_t)} u^Ref_t
```

**Governance triggers / Belief-at-Risk (BaR):** the stochastic lexical process gives normalized uncertainty `H_t` and transition-adjusted instability `D_t = KL( p^lex_t ‖ T̂_t p^lex_{t-1} )` (innovation *unexplained by the fitted dynamics* — it doesn't penalize warranted belief change). Reliability-breach hazard and Bellman cost of waiting:

```
Λ_t = λ_H H_t(1+D_t) + λ_U(1−H_t) U_t + R_t
BaR_t = C_t · exp{ λ̃_H H_t (1+D_t) }         (consequence-weighted, NOT market VaR)
```

`U_t` = **unsupported confidence** (measured separately). `GRI = BaR + UCR` (governance risk index).

**What triggers governance (summary):** calibration/coverage failure · prompt sensitivity · unexplained innovation `D_t` · service/context drift · channel disagreement · unsupported confidence `U_t` · wide posterior envelope · insufficient decision margin (`Γ(π) ≤ 2 L_c d_TV`). Escalation ladder: *isolated diagnostic* → monitor/remeasure; *persistent/channel conflict* → acquire evidence/review; *consequential breach/failed certificate* → restrict authority/abstain.

---

## 4. Empirical results — **bounded** claims (this is honest, not hype)

Three questions organize the study:
1. **Are elicited belief probabilities reliable?** Calibration materially stabilizes information-equivalent prompts; held-out posterior recovery has explicit coverage (38/40 paths = 95%); **action agreement 93.4%** over 320 decisions; **mean regret 0.00375 vs a 0.02 ceiling**; **123/123 margin-certified actions matched the exact-posterior action**; raw word probabilities & printed confidence are **not** treated as beliefs.
2. **Can lexical movement be monitored?** Conditional contraction passes **narrowly** (upper-95% bound **0.992 < 1**); 20/20 untouched 9-update paths covered → **finite-horizon monitoring supported**. Limitations: dialogue state raises mean defect (8.255 vs 5.160); max fixed-evidence **service drift JS 0.0895**.
3. **When should uncertainty change LLM authority?** BaR acts as an **early-warning** state variable (governance responds before worst losses). GRI improves breach ranking (**AUC 0.632 → 0.698**). **Authority tracks externally-testable evidence *quality*, not the model's confidence declaration** — changing only reported confidence has negligible effect; improving evidence content raises delegated authority **0.262 → 0.761** while BaR falls (R² = 0.963, Spearman = 1.00).

**Portfolio illustration** (2025, 44 non-overlapping 5-day decisions, SPY vs SGOV, 5bp cost): frozen BaR-ranked intervention → return 16.9% → **21.5%**, vol 14.0% → **10.2%**, 5-day 90% CVaR 3.50% → **2.23%**, max drawdown 13.98% → **6.24%**. Explicitly **not** an alpha claim — one year / 44 decisions is too small; VIX also lowers CVaR; GRI doesn't significantly beat BaR.

**Four conclusions:**
1. Language probabilities are **measurements**; semantic/scoring/coverage/calibration errors are model risk.
2. **Dynamics require qualification** — lexical algebra tests invariance & closure before a composition is treated as a stochastic state.
3. **Filtering is the sequential bridge** — inherited error may decay, but persistent lexical defects create a tracking-error floor.
4. **The institution retains control** — review, abstention, evidence acquisition, and authority respond to *both* financial and measurement uncertainty.

**BeliefLens workflow (5 auditable stages):** 1. Declare (state semantics, horizon, reference target) → 2. Freeze (evidence cases, prompt families, scoring rule) → 3. Measure (semantic mass, calibration, coverage) → 4. Stress (prompt invariance, drift, recursion defects) → 5. Govern (review, abstention, restricted authority).

---

## 5. Why this matters for AgentGovernance

This is the **quantitative / model-risk foundation** for exactly what we build — runtime governance of an AI agent's actions with evidence and an authorization boundary. Strong conceptual alignment (their term ↔ ours):

| Dixon (this paper) | AgentGovernance |
|---|---|
| "The model proposes; governance decides authority `α(a_t)`" | "The model proposes an ActionRequest; the engine decides" |
| Evidence provenance + qualified measurement + auditable reasons for intervention | Action **receipt** — evidence bundle before execution, immutable audit trail |
| **Authority tracks evidence *quality*, not the model's confidence** | "A chat instruction is not permission; your policies are"; freshness/provenance gate |
| Service/context **drift** + stale-evidence triggers | Source-of-truth **freshness** guard (stale CRM/EHR → block) |
| Governance ladder: execute-in-limits / reduce weight / reacquire evidence / **abstain → human review** | Decision space: allow / require_approval / block / (hold) |
| **Belief-at-Risk (BaR) / GRI** — consequence-weighted governance risk | Risk score routing auto vs human |
| Authorization **certificate** `Γ̂ > 2 L_c d_TV` | "Is the certified error small enough that no admissible state changes the best action?" = a rigorous approval gate |

**Positioning value:** gives us a rigorous, **finance/BFSI-grade vocabulary** (lexical risk, calibration, Belief-at-Risk, authorization certificate, delegated authority) for the model-risk / governance-VP / regulated-industry buyer — the exact enterprise audience.

**Honest caveats:**
- It is **finance-specific, research-grade**, with deliberately **bounded** empirical claims (small samples; Monte-Carlo mechanism validation; not universal real-world lead time). It is a **conceptual + mathematical foundation, not a drop-in algorithm** for our engine.
- Matt Dixon is a **real named academic** (AI Finance Institute, book author). Treat as a credibility/advisory source; do **not** imply he endorses or is affiliated with AgentGovernance unless he actually agrees to it.
