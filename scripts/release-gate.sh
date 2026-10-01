#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

[[ "$(git branch --show-current)" == "main" ]] || {
  echo "Release blocked: production deploys must run from main." >&2
  exit 1
}
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || {
  echo "Release blocked: commit or remove all working-tree changes first." >&2
  exit 1
}

git fetch --quiet origin main
head_sha="$(git rev-parse HEAD)"
remote_sha="$(git rev-parse origin/main)"
[[ "$head_sha" == "$remote_sha" ]] || {
  echo "Release blocked: HEAD must exactly match origin/main." >&2
  echo "Local:  $head_sha" >&2
  echo "Remote: $remote_sha" >&2
  exit 1
}

pnpm quality
printf '\n✓ Release gate passed for %s.\n' "$head_sha"
