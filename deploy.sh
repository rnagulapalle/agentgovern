#!/usr/bin/env bash
# Deploy the app to the existing Lightsail server. DNS, TLS and nginx host
# configuration are managed separately; an app release must not replace them.
set -euo pipefail

SERVER="ubuntu@184.32.118.87"
APP_DIR="/home/ubuntu/agent-trust-demo"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RELEASE="${DEPLOY_RELEASE:-looplabs-$(date -u +%Y%m%dT%H%M%SZ)}"
HEALTH_HOST="${DEPLOY_CHECK_HOST:-looplabs.run}"
[[ "$RELEASE" =~ ^looplabs-[a-zA-Z0-9-]+$ ]] || { echo 'Invalid release name'; exit 1; }
[[ "$HEALTH_HOST" == looplabs.run || "$HEALTH_HOST" == agentgovern.ai ]] || { echo 'Invalid health-check host'; exit 1; }

SSH_KEY="${LIGHTSAIL_KEY:-$HOME/work/aws/LightsailDefaultKey-us-west-2.pem}"
[[ -f "$SSH_KEY" ]] || { echo 'Set LIGHTSAIL_KEY to the Lightsail SSH key path.'; exit 1; }
SSH_ARGS=(-i "$SSH_KEY" -o BatchMode=yes -o StrictHostKeyChecking=yes -o ServerAliveInterval=30 -o ConnectTimeout=20)
printf -v RSYNC_SSH '%q ' ssh "${SSH_ARGS[@]}"

bash "$REPO_DIR/scripts/release-gate.sh"
STAGE="/home/ubuntu/releases/$RELEASE"
BACKUP="/home/ubuntu/deploy-backups/$RELEASE"
printf -v PREPARE 'bash -s -- %q %q %q %q' "$APP_DIR" "$STAGE" "$BACKUP" "$RELEASE"
ssh "${SSH_ARGS[@]}" "$SERVER" "$PREPARE" <<'REMOTE'
set -euo pipefail
app=$1 stage=$2 backup=$3 release=$4
# Never overwrite a previous release or backup.
test ! -e "$stage"
test ! -e "$backup"
mkdir -p "$stage" "$backup"
chmod 700 "$stage" "$backup"
cd "$app"
container=$(sudo docker compose ps -q web)
test -n "$container"
previous=$(sudo docker inspect --format '{{.Image}}' "$container")
sudo docker tag "$previous" "looplabs-web:rollback-$release"
printf '%s\n' "$previous" > "$backup/previous-image.txt"
cp docker-compose.yml "$backup/docker-compose.yml"
cp nginx/nginx.conf "$backup/nginx.conf"
sudo tar --exclude='./node_modules' --exclude='./.next' --exclude='./.git' -czf "$backup/app-before.tar.gz" .
# Keep server-owned configuration local to the server. .dockerignore prevents
# these files from entering the Docker context; Compose reads build settings.
if [ -f .env ]; then cp .env "$stage/.env"; chmod 600 "$stage/.env"; fi
REMOTE

rsync -az \
  --exclude node_modules --exclude .next --exclude .git --exclude '.env*' \
  --exclude nginx/certs --exclude certbot --exclude '*.tsbuildinfo' --exclude .DS_Store \
  --exclude .local --exclude coverage \
  -e "$RSYNC_SSH" "$REPO_DIR/" "$SERVER:$STAGE/"

printf -v DEPLOY 'bash -s -- %q %q %q %q %q' "$APP_DIR" "$STAGE" "$BACKUP" "$RELEASE" "$HEALTH_HOST"
ssh "${SSH_ARGS[@]}" "$SERVER" "$DEPLOY" <<'REMOTE'
set -euo pipefail
app=$1 stage=$2 backup=$3 release=$4 health_host=$5
image="looplabs-web:$release"
candidate="candidate-$release"
activated=0
cleanup() {
  code=$?
  trap - EXIT
  sudo docker rm -f "$candidate" >/dev/null 2>&1 || true
  if [ "$code" -ne 0 ] && [ "$activated" -eq 1 ]; then
    echo 'Release check failed. Restoring the previous application image.' >&2
    cd "$app"
    cp "$backup/docker-compose.yml" docker-compose.yml
    printf 'services:\n  web:\n    image: looplabs-web:rollback-%s\n' "$release" > "$backup/rollback.yml"
    sudo docker compose -f docker-compose.yml -f "$backup/rollback.yml" up -d --no-deps --no-build web
    if sudo docker compose config --services | grep -qx enquiry-worker; then
      printf '  enquiry-worker:\n    image: looplabs-web:rollback-%s\n' "$release" >> "$backup/rollback.yml"
      sudo docker compose -f docker-compose.yml -f "$backup/rollback.yml" up -d --no-deps --no-build enquiry-worker
    else
      project=$(sudo docker inspect --format '{{index .Config.Labels "com.docker.compose.project"}}' "$(sudo docker compose ps -q web)")
      sudo docker ps -aq --filter "label=com.docker.compose.project=$project" --filter label=com.docker.compose.service=enquiry-worker | xargs -r sudo docker rm -f >/dev/null
    fi
    sudo docker compose exec -T nginx nginx -t </dev/null
    sudo docker compose exec -T nginx nginx -s reload </dev/null
  fi
  exit "$code"
}
trap cleanup EXIT

cd "$stage"
sudo env LOOPLABS_IMAGE="$image" docker compose build web
cd "$app"
web=$(sudo docker compose ps -q web)
network=$(sudo docker inspect --format '{{range $name, $_ := .NetworkSettings.Networks}}{{$name}}{{end}}' "$web")
# Forward only runtime credentials; never migration/owner credentials.
python3 - "$app/.env" "$backup/candidate-runtime.env" <<'PYENV'
import sys
from pathlib import Path
allowed = {"LOOPLABS_DURABLE_ORIGIN", "LOOPLABS_DATABASE_URL", "LOOPLABS_REFUND_TWIN_URL", "LOOPLABS_REFUND_TWIN_TOKEN", "LOOPLABS_CONNECTOR_TWIN_URL", "LOOPLABS_CONNECTOR_TWIN_TOKEN", "LOOPLABS_FETCHSANDBOX_BINDING", "LOOPLABS_CHAT_MODEL", "LOOPLABS_RECORD_CATALOG", "LOOPLABS_TEMPORAL_WORKSPACE", "LOOPLABS_TEMPORAL_RECORD_BUILD_ID", "AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN"}
source = Path(sys.argv[1])
values = [line for line in source.read_text().splitlines() if line.split("=", 1)[0] in allowed] if source.exists() else []
target = Path(sys.argv[2]); target.touch(mode=0o600); target.write_text("\n".join(values) + "\n")
PYENV
sudo docker run -d --name "$candidate" --network "$network" \
  --env-file "$backup/candidate-runtime.env" --memory=1024m --memory-swap=1280m "$image" >/dev/null

check_app() {
  sudo docker exec "$1" node -e '
    (async () => {
      let html;
      for (const path of ["/", "/platform", "/contact-sales", "/sign-in", "/control-plane", "/control-plane/agents", "/control-plane/actions", "/control-plane/durable", "/control-plane/refunds"]) {
        const response = await fetch("http://127.0.0.1:3000" + path);
        const body = await response.text();
        if (response.status !== 200 || !body.includes("LoopLabs")) throw new Error("Page failed: " + path);
        if (path.startsWith("/control-plane") && !body.includes("PRIVATE TEAM WORKSPACE")) throw new Error("Private page gate failed: " + path);
        if (path === "/") html = body;
      }
      if (process.env.LOOPLABS_REFUND_TWIN_URL) {
        const { Pool } = require("pg");
        const pool = new Pool({ connectionString: process.env.LOOPLABS_DATABASE_URL, connectionTimeoutMillis: 3000 });
        try {
          const result = await pool.query("SELECT version FROM ll_migrations ORDER BY version");
          if (!result.rows.some(row => row.version === 2)) throw new Error("Refund schema missing");
          if (!result.rows.some(row => row.version === 3)) throw new Error("Workspace membership schema missing");
          if (!result.rows.some(row => row.version === 4)) throw new Error("Connector action schema missing");
          if (!result.rows.some(row => row.version === 5)) throw new Error("Workflow schema missing");
          if (!result.rows.some(row => row.version === 7)) throw new Error("Saved enquiry schema missing; apply enquiries:setup before release");
        } finally { await pool.end(); }
        const evidence = await fetch(process.env.LOOPLABS_REFUND_TWIN_URL + "/v1/charges/ch_looplabs_refund_demo", {
          headers: { Authorization: "Bearer " + process.env.LOOPLABS_REFUND_TWIN_TOKEN },
          redirect: "error", signal: AbortSignal.timeout(3000)
        });
        if (!evidence.ok || (await evidence.json()).livemode !== false) throw new Error("Test provider unavailable");
        const anonymous = await fetch("http://127.0.0.1:3000/api/durable/refunds");
        if (anonymous.status !== 401) throw new Error("Refund API must deny anonymous access");
        const invalidLogin = await fetch("http://127.0.0.1:3000/api/durable/session", {
          method: "POST", headers: { "Content-Type": "application/json", Origin: process.env.LOOPLABS_DURABLE_ORIGIN },
          body: JSON.stringify({ token: "release-check-invalid-credential" })
        });
        if (invalidLogin.status !== 401) throw new Error("Browser origin or login boundary failed");
        const workspace = await fetch("http://127.0.0.1:3000/api/workspace/agents");
        if (workspace.status !== 401) throw new Error("Agent directory must deny anonymous access");
        const connectorAccess = await fetch("http://127.0.0.1:3000/api/durable/connectors");
        if (connectorAccess.status !== 401) throw new Error("Connector actions must deny anonymous access");
        const connectorEvidence = await fetch(process.env.LOOPLABS_CONNECTOR_TWIN_URL + "/crm/crm/v3/objects/contacts/1001", {
          headers: { Authorization: "Bearer " + process.env.LOOPLABS_CONNECTOR_TWIN_TOKEN },
          redirect: "error", signal: AbortSignal.timeout(3000)
        });
        if (!connectorEvidence.ok || (await connectorEvidence.json()).id !== "1001") throw new Error("Sample CRM provider unavailable");
        const memberLogin = await fetch("http://127.0.0.1:3000/api/workspace/session", {
          method: "POST", headers: { "Content-Type": "application/json", Origin: process.env.LOOPLABS_DURABLE_ORIGIN },
          body: JSON.stringify({ email: "release-check@example.invalid", password: "release-check-invalid-password" })
        });
        if (memberLogin.status !== 401) throw new Error("Named member login boundary failed");
      }
      const asset = html.match(/src="([^\"]+\/_next\/static\/[^\"]+\.js[^\"]*)"/)
        || html.match(/src="(\/_next\/static\/[^\"]+\.js[^\"]*)"/);
      if (!asset) throw new Error("No application script found");
      const response = await fetch(new URL(asset[1], "http://127.0.0.1:3000"));
      if (!response.ok) throw new Error("Application asset failed");
      console.log("Landing page, control plane and JavaScript asset passed");
    })().catch(error => { console.error(error.message); process.exit(1); });
  '
}
ready=0
for attempt in $(seq 1 30); do
  if check_app "$candidate"; then ready=1; break; fi
  sleep 2
done
[ "$ready" -eq 1 ]

# Keep active TLS/nginx settings and secrets. Source is a reference copy;
# the tested immutable image is what actually runs.
rsync -a --exclude '.env*' --exclude nginx/nginx.conf --exclude nginx/certs \
  --exclude certbot --exclude .local --exclude coverage "$stage/" "$app/"
sudo docker tag "$image" looplabs-web:latest
activated=1
sudo env LOOPLABS_IMAGE="$image" docker compose up -d --no-deps --no-build web enquiry-worker
web=$(sudo docker compose ps -q web)
ready=0
for attempt in $(seq 1 30); do
  if check_app "$web"; then ready=1; break; fi
  sleep 2
done
[ "$ready" -eq 1 ]
# A web-only release is incomplete: the separately deployed runner must publish
# a fresh heartbeat after this container started, without borrowing a human session.
worker=$(sudo docker compose ps -q enquiry-worker)
test -n "$worker"
worker_started=$(sudo docker inspect --format '{{.State.StartedAt}}' "$worker")
worker_ready=0
for attempt in $(seq 1 12); do
  if [ "$(sudo docker inspect --format '{{.State.Running}}' "$worker")" = true ] && sudo docker exec "$web" node -e '
    const { Pool } = require("pg");
    const db = new Pool({connectionString:process.env.LOOPLABS_DATABASE_URL,connectionTimeoutMillis:3000});
    db.query("SELECT 1 FROM ll_enquiry_worker_status WHERE last_tick>$1::timestamptz AND last_tick>now()-make_interval(secs=>30)", [process.argv[1]])
      .then(r=>{if(!r.rows.length) process.exitCode=1;}).catch(()=>{process.exitCode=1;}).finally(()=>db.end());
  ' "$worker_started"; then worker_ready=1; break; fi
  sleep 5
done
[ "$worker_ready" -eq 1 ]
# nginx resolves the Compose service when it loads its configuration.
sudo docker compose exec -T nginx nginx -t </dev/null
sudo docker compose exec -T nginx nginx -s reload </dev/null
curl --fail --silent --show-error --retry 3 --retry-delay 2 \
  "https://$health_host/?release=$release" -o "$backup/deployed-home.html"
python3 - "$backup/deployed-home.html" <<'PY'
import sys
from pathlib import Path
assert 'LoopLabs' in Path(sys.argv[1]).read_text(), 'Public endpoint did not return LoopLabs'
PY
printf '%s\n' "$image" > "$app/.deployed-image"
sudo docker compose ps
printf 'Deployed %s at https://%s; rollback: %s\n' "$image" "$health_host" "$backup"
REMOTE
