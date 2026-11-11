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
run "Temporal service and workflow bundles" pnpm temporal:build
run "Quote Temporal integration-test bundles" node scripts/build-temporal-worker.mjs quote
run "Production build" pnpm build
proof_parent="$(mktemp -d "${TMPDIR:-/tmp}/ll-current-discovery.XXXXXXXX")"
trap 'rm -rf -- "$proof_parent"' EXIT
export LOOPLABS_CURRENT_DISCOVERY_PROOF_DIR="$proof_parent/proof"
export LOOPLABS_DISCOVERY_BROWSER_PROOF=isolated
run "Current installed discovery proof" node --import tsx scripts/discovery-browser-proof.mjs --owned-current
run "Adversarial tests and coverage" pnpm test:coverage
run "Isolated staging database bootstrap and refusal proof" node --import tsx scripts/staging-database-proof.mjs
run "Background runner bundle" node scripts/build-enquiry-worker.mjs
run "Rendered internal links" pnpm check:links
run "Diff hygiene" git diff --check

printf '\n✓ All quality gates passed.\n'
