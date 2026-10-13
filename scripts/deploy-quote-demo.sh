#!/usr/bin/env bash
# Install retained canonical sample runtime on the fixed new host. The root
# coordinator still validates proxy/TLS and performs DNS switch separately.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ $# == 0 ]] || { echo 'No arbitrary quote target/receipt arguments.' >&2; exit 1; }
bash "$REPO_DIR/scripts/quote-demo-source-gate.sh"
commit="$(git -C "$REPO_DIR" rev-parse HEAD)"
[[ "$commit" =~ ^[a-f0-9]{40}$ ]]
SSH_KEY="/Users/raj/.codex/looplabs-research/2026-10-11-cloud-staging-provision/looplabs-staging-rsa4096"
KNOWN_HOSTS="/Users/raj/.codex/looplabs-research/2026-10-11-cloud-staging-provision/known_hosts"
[[ -f "$SSH_KEY" && -f "$KNOWN_HOSTS" ]]
SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes -o "UserKnownHostsFile=$KNOWN_HOSTS" -o StrictHostKeyChecking=yes -o ServerAliveInterval=30 -o ConnectTimeout=20)
SERVER=looplabs@54.189.146.124
stage="/srv/looplabs-production/releases/$commit"
# Stage only Git source. Private member/planner files are independently prepared
# through the existing private ownership contract, never uploaded from shell env.
ssh "${SSH_ARGS[@]}" "$SERVER" "test ! -e '$stage' && mkdir -m 700 '$stage' && mkdir -m 755 '$stage/app'"
git -C "$REPO_DIR" archive HEAD | ssh "${SSH_ARGS[@]}" "$SERVER" "tar -xf - -C '$stage/app'"
ssh "${SSH_ARGS[@]}" "$SERVER" "cd '$stage/app' && env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/looplabs COREPACK_ENABLE_DOWNLOAD_PROMPT=0 pnpm install --frozen-lockfile && env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/home/looplabs node --import tsx scripts/retained-quote-demo-install.mjs"
printf 'Retained sample runtime installed for %s. DNS/TLS/auth/quote/manual acceptance remains separate.\n' "$commit"
