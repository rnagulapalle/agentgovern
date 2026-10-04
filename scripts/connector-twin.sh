#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
connector_backend="${FETCHSANDBOX_BACKEND_PATH:-$HOME/sandbox/backend}"
exec "$connector_backend/.venv/bin/python" scripts/connector-twin.py
