# LoopLabs engineering gates

The safety system assumes a contributor may be new to the product and may use any coding agent. Repository files provide context, while executable gates provide enforcement.

## Enforcement points

| Point | Enforcement | Purpose |
| --- | --- | --- |
| Agent/editor opens project | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor and Copilot instructions | Establish product truth, invariants, and workflow |
| Local development | `pnpm quality` | Check repository policy, lint, types, adversarial tests, coverage, production build, and rendered internal links |
| Git push | optional versioned pre-push hook | Give fast feedback before CI |
| Pull request / main push | GitHub Actions `quality-gates` | Run the clean-room gate independently of the developer's machine |
| Production deploy | `scripts/release-gate.sh` from `deploy.sh` | Require clean, pushed `main`, then rerun the complete gate |
| Runtime release | candidate container and public health checks in `deploy.sh` | Verify core routes and assets before and after activation, with rollback |

## What the adversarial suite protects

The core tests exercise capability denial, restricted tools, stale or absent evidence, identity mismatch, invalid inputs, budget limits, approval invalidation, duplicate action replay, delegated-agent suspension, output redaction, sensitive-data non-persistence, containment, version-aware reconciliation, concurrent writes, and irreversible effects.

Coverage thresholds apply to the executable policy engine and control-plane state model. Scenario integrity has dedicated tests and is also checked by the production build. Coverage is a floor, not proof of safety; a behavior change still needs a test that demonstrates its failure mode.

## Local setup

Install pinned dependencies with `pnpm install --frozen-lockfile`. To enable the versioned pre-push check in this clone, run:

```bash
git config core.hooksPath .githooks
```

The hook is convenience only. CI and the deploy gate remain authoritative because local hooks can be skipped.

## Branch protection

Configure `main` to require the GitHub Actions check named `quality-gates`, require pull requests, dismiss stale approvals, and block force pushes. Keep administrative bypass limited to recovery. The repository workflow remains useful even where the GitHub plan does not support all protection settings.
