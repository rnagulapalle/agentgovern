#!/usr/bin/env bash
# Explicit user-authorized sample-only path. Default release gate is unchanged.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
branch="$(git branch --show-current)"
[[ "$branch" == main || "$branch" == codex/new-server-cutover-oct13 ]] || { echo 'Quote install requires the approved main or cutover branch.' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || { echo 'Quote install requires clean committed source.' >&2; exit 1; }
git fetch --quiet origin "$branch"
[[ "$(git rev-parse HEAD)" == "$(git rev-parse "origin/$branch")" ]] || { echo 'Quote install requires the exact pushed approved branch.' >&2; exit 1; }
node scripts/release-ci.mjs
