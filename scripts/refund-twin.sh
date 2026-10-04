#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
refund_backend="${FETCHSANDBOX_BACKEND_PATH:-$HOME/sandbox/backend}"
if [[ ! -x "$refund_backend/.venv/bin/python" ]]; then
  echo "Set FETCHSANDBOX_BACKEND_PATH to the existing FetchSandbox backend with its Python environment."
  exit 1
fi
exec "$refund_backend/.venv/bin/python" scripts/refund-twin.py
