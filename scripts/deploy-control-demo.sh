#!/usr/bin/env bash
# Bounded existing-installation web release. Does not provision another database,
# change worker authority, or assert general enterprise release eligibility.
set -euo pipefail
[[ $# == 0 ]] || { echo 'No caller target or eligibility arguments accepted.' >&2; exit 1; }
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR"
# Require explicitly supplied public browser inputs before CI or any SSH call.
export NEXT_PUBLIC_POSTHOG_KEY="${NEXT_PUBLIC_POSTHOG_KEY:-}"
export NEXT_PUBLIC_POSTHOG_HOST="${NEXT_PUBLIC_POSTHOG_HOST:-/ph}"
node scripts/control-demo-web-release.mjs analytics-check
readonly NEXT_PUBLIC_POSTHOG_KEY NEXT_PUBLIC_POSTHOG_HOST
[[ "$(git branch --show-current)" == main ]] || { echo 'Control demo release requires main.' >&2; exit 1; }
[[ -z "$(git status --porcelain --untracked-files=all)" ]] || { echo 'Control demo release requires clean committed source.' >&2; exit 1; }
git fetch --quiet origin main
commit="$(git rev-parse HEAD)"
[[ "$commit" =~ ^[a-f0-9]{40}$ && "$commit" == "$(git rev-parse origin/main)" ]] || { echo 'Control demo release requires exact pushed main.' >&2; exit 1; }
node scripts/release-ci.mjs
[[ "$(git rev-parse HEAD)" == "$commit" && -z "$(git status --porcelain --untracked-files=all)" ]] || { echo 'Source changed during CI verification.' >&2; exit 1; }
git fetch --quiet origin main
[[ "$commit" == "$(git rev-parse origin/main)" ]] || { echo 'Remote main changed during verification.' >&2; exit 1; }
SSH_KEY="/Users/raj/.codex/looplabs-research/2026-10-11-cloud-staging-provision/looplabs-staging-rsa4096"
KNOWN_HOSTS="/Users/raj/.codex/looplabs-research/2026-10-11-cloud-staging-provision/known_hosts"
[[ -f "$SSH_KEY" && -f "$KNOWN_HOSTS" ]]
SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes -o "UserKnownHostsFile=$KNOWN_HOSTS" -o StrictHostKeyChecking=yes -o ServerAliveInterval=30 -o ConnectTimeout=20)
SERVER=looplabs@54.189.146.124
stage="/srv/looplabs-production/web-releases/$commit"
ssh "${SSH_ARGS[@]}" "$SERVER" "test ! -e '$stage' && mkdir -m 700 '$stage' && mkdir -m 755 '$stage/app'"
git archive "$commit" | ssh "${SSH_ARGS[@]}" "$SERVER" "umask 022; tar --no-same-permissions --no-same-owner -xf - -C '$stage/app'"
ssh "${SSH_ARGS[@]}" "$SERVER" "cd '$stage/app' && env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/looplabs COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile && env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/looplabs NEXT_PUBLIC_POSTHOG_KEY='$NEXT_PUBLIC_POSTHOG_KEY' NEXT_PUBLIC_POSTHOG_HOST='$NEXT_PUBLIC_POSTHOG_HOST' node --import tsx scripts/control-demo-web-release.mjs build"
ssh "${SSH_ARGS[@]}" "$SERVER" "cd '$stage/app' && env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/looplabs node --import tsx scripts/control-demo-web-release.mjs activate"
printf 'Bounded control demo web release activated for %s. Named-member workflow acceptance and recording remain separate.\n' "$commit"
