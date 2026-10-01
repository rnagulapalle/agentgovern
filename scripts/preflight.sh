#!/usr/bin/env bash
# Backward-compatible local quality entry point. Production uses release-gate.sh.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
exec pnpm quality
