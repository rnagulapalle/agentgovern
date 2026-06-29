#!/usr/bin/env bash
# ╔══════════════════════════════════════════════════════════════════════╗
# ║  AgentGovernance — Deploy to AWS Lightsail (agentgovern.ai)                ║
# ║                                                                      ║
# ║  Mirrors the FetchSandbox deploy: rsync the repo to the box, then    ║
# ║  `docker compose up -d --build` over SSH. nginx terminates TLS with  ║
# ║  the Cloudflare Origin Cert; Cloudflare sits in front for DNS/CDN.   ║
# ║                                                                      ║
# ║  Usage:   ./deploy.sh                                                 ║
# ║  Key:     $LIGHTSAIL_KEY env, or ~/work/aws/LightsailDefaultKey-*    ║
# ╚══════════════════════════════════════════════════════════════════════╝
set -euo pipefail

# ─── Config ───────────────────────────────────────────────────────────────
SERVER_IP="184.32.118.87"
SERVER="ubuntu@${SERVER_IP}"
APP_DIR="/home/ubuntu/agent-trust-demo"
DOMAIN="agentgovern.ai"
EMAIL="raj.jsp@gmail.com"   # Let's Encrypt account / renewal notices
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ─── SSH key discovery (same order as FetchSandbox) ───────────────────────
if [ -n "${LIGHTSAIL_KEY:-}" ] && [ -f "$LIGHTSAIL_KEY" ]; then
  SSH_KEY="$LIGHTSAIL_KEY"
elif [ -f "$HOME/work/aws/LightsailDefaultKey-us-west-2.pem" ]; then
  SSH_KEY="$HOME/work/aws/LightsailDefaultKey-us-west-2.pem"
elif [ -f "$HOME/work/LightsailDefaultKey-us-west-2.pem" ]; then
  SSH_KEY="$HOME/work/LightsailDefaultKey-us-west-2.pem"
elif [ -f "$HOME/.ssh/LightsailDefaultKey-us-west-2.pem" ]; then
  SSH_KEY="$HOME/.ssh/LightsailDefaultKey-us-west-2.pem"
else
  echo "ERROR: Lightsail SSH key not found. Set LIGHTSAIL_KEY or place it at:"
  echo "  ~/work/aws/LightsailDefaultKey-us-west-2.pem"
  exit 1
fi
chmod 400 "$SSH_KEY" 2>/dev/null || true

SSH_OPTS="-i $SSH_KEY -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=30 -o ServerAliveCountMax=6 -o ConnectTimeout=20"
SSH="ssh $SSH_OPTS"
SCP="scp $SSH_OPTS"

log() { printf "\n\033[1;34m▸ %s\033[0m\n" "$*"; }

# ─── 1. Pre-flight ────────────────────────────────────────────────────────
log "Checking connection to $SERVER"
$SSH "$SERVER" 'echo "  connected: $(lsb_release -ds)"'

# ─── 2. Copy the repo up (preserve server-side certs) ─────────────────────
log "Syncing code → $SERVER:$APP_DIR"
$SSH "$SERVER" "mkdir -p $APP_DIR/nginx/certs $APP_DIR/certbot/www"
rsync -az --delete \
  --exclude node_modules \
  --exclude .next \
  --exclude .git \
  --exclude 'nginx/certs/*' \
  --exclude 'certbot' \
  -e "$SSH" \
  "$REPO_DIR/" "$SERVER:$APP_DIR/"

# Ship local certs if present (otherwise the box must already have them).
if [ -f "$REPO_DIR/nginx/certs/fullchain.pem" ] && [ -f "$REPO_DIR/nginx/certs/privkey.pem" ]; then
  log "Shipping local Cloudflare Origin Cert"
  $SCP "$REPO_DIR/nginx/certs/fullchain.pem" "$SERVER:$APP_DIR/nginx/certs/fullchain.pem"
  $SCP "$REPO_DIR/nginx/certs/privkey.pem" "$SERVER:$APP_DIR/nginx/certs/privkey.pem"
fi

# ─── 3. Build, run, and auto-provision a real TLS cert ────────────────────
# nginx boots with a self-signed cert, then certbot gets a real Let's Encrypt
# cert through the webroot (works behind Cloudflare) and configures auto-renew.
log "Building & starting containers + provisioning TLS on $SERVER"
$SSH "$SERVER" "DOMAIN='$DOMAIN' APP_DIR='$APP_DIR' EMAIL='$EMAIL' bash -s" <<'REMOTE'
set -euo pipefail
cd "$APP_DIR"
mkdir -p nginx/certs certbot/www

# Docker (first run only)
if ! command -v docker >/dev/null 2>&1; then
  echo "  installing Docker…"
  sudo apt-get update -y -qq
  curl -fsSL https://get.docker.com | sudo sh
fi

# Bootstrap a self-signed cert so nginx can start (only if none present yet)
if [ ! -s nginx/certs/fullchain.pem ]; then
  echo "  creating temporary self-signed cert…"
  sudo openssl req -x509 -nodes -newkey rsa:2048 -days 365 \
    -keyout nginx/certs/privkey.pem -out nginx/certs/fullchain.pem \
    -subj "/CN=$DOMAIN" >/dev/null 2>&1
  sudo chown $USER:$USER nginx/certs/*.pem
  sudo chmod 600 nginx/certs/privkey.pem
fi

# Bring everything up
sudo docker compose up -d --build

# Issue/renew a real Let's Encrypt cert via the nginx webroot
if ! command -v certbot >/dev/null 2>&1; then
  echo "  installing certbot…"
  sudo apt-get install -y -qq certbot
fi
echo "  requesting Let's Encrypt certificate for $DOMAIN…"
if sudo certbot certonly --webroot -w "$APP_DIR/certbot/www" \
     -d "$DOMAIN" -d "www.$DOMAIN" \
     --email "$EMAIL" --agree-tos --non-interactive --keep-until-expiring 2>&1 | tail -6 \
   && sudo test -s /etc/letsencrypt/live/$DOMAIN/fullchain.pem; then
  sudo cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem nginx/certs/fullchain.pem
  sudo cp /etc/letsencrypt/live/$DOMAIN/privkey.pem  nginx/certs/privkey.pem
  sudo chown $USER:$USER nginx/certs/*.pem
  sudo chmod 600 nginx/certs/privkey.pem
  sudo docker compose exec -T nginx nginx -s reload 2>/dev/null || sudo docker compose restart nginx
  # Auto-renew: copy renewed certs into the app + reload nginx
  HOOK=/etc/letsencrypt/renewal-hooks/deploy/agentgovernance.sh
  sudo mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  printf '%s\n' '#!/bin/sh' \
    "cp /etc/letsencrypt/live/$DOMAIN/fullchain.pem $APP_DIR/nginx/certs/fullchain.pem" \
    "cp /etc/letsencrypt/live/$DOMAIN/privkey.pem  $APP_DIR/nginx/certs/privkey.pem" \
    "cd $APP_DIR && docker compose exec -T nginx nginx -s reload" \
    | sudo tee $HOOK >/dev/null
  sudo chmod +x $HOOK
  echo "  ✅ Real TLS cert installed; auto-renew configured."
else
  echo "  ⚠ certbot could not issue a cert yet (nginx is up on a self-signed cert)."
  echo "    With Cloudflare 'Full (strict)' the site shows 526 until a real cert exists."
  echo "    Fallbacks: set Cloudflare SSL to 'Full', or add a CF Origin Cert and re-run."
fi

sudo docker compose ps
REMOTE

# ─── 5. Health check ──────────────────────────────────────────────────────
log "Health check"
code=$($SSH "$SERVER" "curl -s -o /dev/null -w '%{http_code}' http://localhost/ || true")
echo "  nginx http://localhost → $code (301 = redirecting to HTTPS, good)"

log "Done → https://$DOMAIN"
echo "  Logs:    $SSH $SERVER 'cd $APP_DIR && sudo docker compose logs -f web'"
echo "  Status:  $SSH $SERVER 'cd $APP_DIR && sudo docker compose ps'"
