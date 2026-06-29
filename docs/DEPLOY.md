# Deploy AgentGovernance — Lightsail + Docker + Cloudflare

Simple guide to put the site live at **https://agentgovern.ai**.

Same shape as the FetchSandbox setup: a Lightsail box runs **Docker Compose**
(the Next.js app + nginx). **Cloudflare** sits in front for DNS, HTTPS, and CDN.

```
visitor → Cloudflare (HTTPS, CDN) → Lightsail box → nginx :443 → web :3000 (Next.js)
```

---

## 1. Create the Lightsail box

1. AWS Lightsail → **Create instance**.
2. Platform: **Linux/Unix** · Blueprint: **Ubuntu 22.04 LTS**.
3. Plan: **4 GB RAM** (plenty for one Next.js app).
4. Create. Then **Networking → attach a Static IP** (so the IP never changes).
5. **Networking → Firewall**: open ports **80 (HTTP)** and **443 (HTTPS)**.
   (22/SSH is open by default.)

Your static IP is **184.32.118.87** (Oregon / us-west-2a).

---

## 2. Point Cloudflare at the box

In the Cloudflare dashboard for **agentgovern.ai**:

1. **DNS → Records**, add two **A** records (both **Proxied**, orange cloud):
   - `@`   → `184.32.118.87`
   - `www` → `184.32.118.87`
2. **SSL/TLS → Overview**: set mode to **Full (strict)**.

---

## 3. Make a Cloudflare Origin Certificate

This is the cert nginx uses. It lasts 15 years — no renewals.

1. **SSL/TLS → Origin Server → Create Certificate**.
2. Hostnames: `agentgovern.ai` and `*.agentgovern.ai`. Create.
3. Copy the two blocks into files **on the server** (step 5):
   - **Origin Certificate** → `nginx/certs/fullchain.pem`
   - **Private Key**        → `nginx/certs/privkey.pem`

---

## 4. Install Docker on the box

SSH in (Lightsail → Connect, or your key), then:

```bash
sudo apt-get update
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
exit   # log out and back in so the group applies
```

---

## 5. Get the code + certs onto the box

```bash
# clone your repo (or scp the folder up)
git clone <your-repo-url> agent-trust-demo
cd agent-trust-demo

# create the cert files (paste from step 3)
mkdir -p nginx/certs
nano nginx/certs/fullchain.pem    # paste Origin Certificate, save
nano nginx/certs/privkey.pem      # paste Private Key, save
```

If you don't use git yet, from your Mac:
```bash
rsync -az --exclude node_modules --exclude .next \
  ./agent-trust-demo/ ubuntu@184.32.118.87:~/agent-trust-demo/
```

---

## 6. (Optional) Real waitlist emails

The waitlist works without this (it just confirms locally). To collect real
emails, set an endpoint **before building** (it bakes into the page):

```bash
echo 'NEXT_PUBLIC_WAITLIST_ENDPOINT=https://your-form-endpoint' > .env
```
(Use Formspree, ConvertKit, Resend, or your own API.)

---

## 7. Build + run

```bash
docker compose up -d --build
```

First build takes a few minutes. Then open **https://agentgovern.ai**. Done.

---

## Everyday commands

```bash
docker compose logs -f web      # app logs
docker compose ps               # what's running
docker compose restart          # restart
```

**To deploy a new version:**
```bash
git pull
docker compose up -d --build
```

---

## Notes

- **4 GB is enough.** The app container is capped at ~1 GB; nginx ~64 MB.
- **Cloudflare is the CDN.** Your video and images are cached at the edge.
- **No certbot needed.** The Cloudflare Origin Cert + Full (strict) handles HTTPS
  end to end (browser↔Cloudflare↔your nginx).
- Simpler alternative without Docker: install Node 22, `pnpm install && pnpm build`,
  run `pnpm start` under `pm2`, and use host nginx as the reverse proxy. Docker is
  recommended — it matches the FetchSandbox setup and is reproducible.
