#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
backoffice_backend="${FETCHSANDBOX_BACKEND_PATH:-$HOME/sandbox/backend}"
exec "$backoffice_backend/.venv/bin/python" scripts/backoffice-twin.py
