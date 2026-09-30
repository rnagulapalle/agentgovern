#!/usr/bin/env bash
set -euo pipefail

if [[ "${RENEWED_LINEAGE:-}" != "/etc/letsencrypt/live/looplabs.run" ]]; then
  exit 0
fi

app_dir=/home/ubuntu/agent-trust-demo
cert_dir="$app_dir/nginx/certs/looplabs"

install -d -m 755 "$cert_dir"
install -m 644 "$RENEWED_LINEAGE/fullchain.pem" "$cert_dir/fullchain.pem"
install -m 600 "$RENEWED_LINEAGE/privkey.pem" "$cert_dir/privkey.pem"

cd "$app_dir"
docker compose exec -T nginx nginx -t </dev/null
docker compose exec -T nginx nginx -s reload </dev/null
