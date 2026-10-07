#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

run() {
  printf '\n▸ %s\n' "$1"
  shift
  "$@"
}

run "Repository policy and claim gate" pnpm check:repo
run "Lint" pnpm lint
run "TypeScript" pnpm typecheck
run "Adversarial tests and coverage" pnpm test:coverage
run "Background runner bundle" node scripts/build-enquiry-worker.mjs
run "Temporal service and workflow bundles" pnpm temporal:build
run "Production build" pnpm build
run "Rendered internal links" pnpm check:links
run "Diff hygiene" git diff --check

printf '\n✓ All quality gates passed.\n'
