# LoopLabs engineering gates

The safety system assumes a contributor may be new to the product and may use any coding agent. Repository files provide context, while executable gates provide enforcement.

## Enforcement points

| Point | Enforcement | Purpose |
| --- | --- | --- |
| Agent/editor opens project | `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, Cursor and Copilot instructions | Establish product truth, invariants, and workflow |
| Local development | `pnpm quality` | Check repository policy, lint, types, adversarial tests, coverage, production build, and rendered internal links |
| Git push | optional versioned pre-push hook | Give fast feedback before CI |
| Pull request / main push | GitHub Actions `quality-gates` | Run the clean-room gate independently of the developer's machine |
| Production deploy | `scripts/release-gate.sh` from `deploy.sh` | Require clean, pushed `main`, rerun the complete gate, and verify current accepted staging-artifact provenance |
| Runtime release | candidate container and public health checks in `deploy.sh` | Verify core routes and assets before and after activation, with rollback |

## What the adversarial suite protects

The core tests exercise capability denial, restricted tools, stale or absent evidence, identity mismatch, invalid inputs, budget limits, approval invalidation, duplicate action replay, delegated-agent suspension, output redaction, sensitive-data non-persistence, containment, version-aware reconciliation, concurrent writes, and irreversible effects.

Coverage thresholds apply to the executable policy engine and control-plane state model. Scenario integrity has dedicated tests and is also checked by the production build. Coverage is a floor, not proof of safety; a behavior change still needs a test that demonstrates its failure mode.

## Local setup

The durable workspace also requires live PostgreSQL tests: actual worker SIGKILL
before/after an effect, simultaneous action replay, tenant isolation, approval
revocation/expiry, lease fencing, containment, and conflicting recovery writes.
CI supplies PostgreSQL 17. Local contributors must set a dedicated
`LOOPLABS_TEST_DATABASE_URL`; missing configuration fails rather than skips tests.
Coverage includes the durable protocol, HTTP/auth boundary, transactions, and
agent client. Runtime behavior is not certified by coverage alone.

Install pinned dependencies with `pnpm install --frozen-lockfile`. To enable the versioned pre-push check in this clone, run:

```bash
git config core.hooksPath .githooks
```

The hook is convenience only. CI and the deploy gate remain authoritative because local hooks can be skipped.

## Accepted staging artifact boundary

After the full quality gate, `scripts/staging-release-evidence.mjs` reads GitHub
run, job and artifact metadata through authenticated, read-only `gh api` calls to
the fixed private evidence repository. Missing access or incomplete observations
refuse release. The checker retains the existing successful-origin artifact
validator; candidate archives and partial CI results cannot become release inputs.

The current typed runtime receipt must match all 99 reviewed source files. Its
exact image archive, manifest, worker build and image IDs must match a successful
independent cold-retrieval receipt whose five loader sources also match the
checkout. The observed origin must have passed its full quality gate, artifact
retention and owned-input cleanup. The observed retrieval must have completed
exact-byte loading and cleanup. Expiry, changed bytes, skipped required steps,
ambiguous steps, failed jobs and incomplete job inventories refuse eligibility.

Release also requires `staging-release-package-proof.json`: two distinct accepted
origins and an independent successful promotion/reversion trial using their exact
images. All 99 origin sources and seven package helpers must match the checkout.
Pending action hashes, absence of self-approval, independent approval, mobile
reload, full typed execution/recovery and owned image cleanup remain required.
Observed artifact metadata and quality/retention/cleanup jobs must pass for both
origins and the package trial. The candidate rollback receipt cannot replace this
accepted-image envelope.

This added boundary does not establish an enterprise SLA, production connector
parity or a cryptographically signed certificate. Historical acceptance receipts
remain historical. As of October 10, the current candidate is intentionally refused:
full-gate origin acceptance, current accepted-artifact retrieval and accepted-image
transitions remain open. Quality now checks historical retrieval/package records
against their original immutable receipt bytes and measured sources, and separately
checks current candidate evidence. The stricter release-only boundary resolves the
ordering cycle without accepting partial artifacts or claiming old proof is current.

## Branch protection

Configure `main` to require the GitHub Actions check named `quality-gates`, require pull requests, dismiss stale approvals, and block force pushes. Keep administrative bypass limited to recovery. The repository workflow remains useful even where the GitHub plan does not support all protection settings.
