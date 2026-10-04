---
name: looplabs-engineering
description: Implement and review LoopLabs product changes with product-truth, security, regression, and release gates.
---

# LoopLabs engineering workflow

Apply this workflow to every code, copy, design, configuration, dependency, and deployment change.

## 1. Establish the contract

Read `AGENTS.md`, the affected code, and its closest tests. For website copy or metadata, also read `docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md`. For control-plane behavior, read `docs/CONTROL_PLANE.md`.

Write down the user-visible behavior and the invariant that must remain true. Prefer an existing shared component or model over a parallel implementation.

## 2. Classify risk

- **Critical:** identity, permission, policy, approval, execution, persistence, output handling, reconciliation, secrets, deployment.
- **High:** forms, analytics, external links, SEO claims, dependencies, routing, shared navigation or design tokens.
- **Normal:** isolated presentation or copy that does not change a claim.

Critical and high-risk changes need a regression test for the expected result and an adversarial test for malformed, unauthorized, stale, duplicate, or conflicting input as applicable.

## 3. Implement defensively

Use default-deny behavior for safety decisions. Validate at the boundary and again when delayed authority is exercised. Make mutations idempotent. Never trust client state as production authority. Avoid new dependencies unless the standard library or current stack cannot solve the problem clearly.

Keep product language exact: original prepared demos remain browser-local. The invited workspace saves discount, refund, CRM and messaging controls on the server; provider twins and sample records are not live customer integrations. A future architecture or planned capability must be labeled as such.

## 4. Verify

During development, run the smallest relevant test. Before completion run:

```bash
pnpm quality
```

Inspect the change with `git diff --check` and `git diff`. Do not silence a failure by reducing coverage, excluding the changed file, weakening a rule, or deleting a test.

## 5. Release

Commits must be reviewable and contain no credentials or generated build output. Pull requests must pass the `quality-gates` check. Production releases use `./deploy.sh`, which only accepts a clean `main` commit that exactly matches `origin/main`.
