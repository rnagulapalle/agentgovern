# LoopLabs deployment

LoopLabs runs on the existing AgentGovern AWS Lightsail server. Cloudflare
provides authoritative DNS, the public HTTPS endpoint and its reverse proxy.
Squarespace remains the domain registrar.

```
Browser → Cloudflare HTTPS → Lightsail nginx HTTPS → Next.js container
```

## Infrastructure

- Server: `184.32.118.87` (`ubuntu`, AWS Lightsail, us-west-2)
- Application: `/home/ubuntu/agent-trust-demo`
- Staged releases: `/home/ubuntu/releases/`
- Backups and rollback images: `/home/ubuntu/deploy-backups/`
- New public address: `https://looplabs.run`
- Legacy address: `https://agentgovern.ai`

### AgentGovern review environment — active October 1, 2026

`https://agentgovern.ai` temporarily serves an isolated LoopLabs landing-page
review container while the execution-integrity analytics design is evaluated.
It does not replace the `looplabs.run` production container. The preview
response carries `X-Robots-Tag: noindex, nofollow`; canonical metadata continues
to point to `looplabs.run`.

- Preview container: `looplabs-agentgovern-preview`
- Preview image: recorded in `/home/ubuntu/.looplabs-preview-release`
- Production image: recorded in `/home/ubuntu/agent-trust-demo/.deployed-image`
- Live nginx backup: recorded in `/home/ubuntu/.looplabs-preview-nginx-backup`

The repository nginx configuration remains the intended production
configuration, where AgentGovern redirects to LoopLabs. The live review route
is a reversible server-side override and must be removed after the design
decision. The saved nginx backup restores the redirect.

### Landing promotion — October 1, 2026

The execution-integrity landing page was promoted in image
`looplabs-web:looplabs-20261001T162604Z`. The release passed repository policy,
lint, strict TypeScript, 36 tests, coverage thresholds, all 58 production routes,
candidate-container checks, production app and asset checks, and public HTTPS
verification. The hero control caption was widened and centered before release.

### Rollout status — September 30, 2026

The LoopLabs landing page, interactive product tour, logo, social image, blog, and
SEO routes are deployed in image `looplabs-web:looplabs-20260930T174317Z`
(Next.js 15.5.26). The release includes content-driven article metadata,
per-article social images, RSS, `llms.txt`, and the shared public-page design.
The production build, 30 tests, app/asset checks, sitemap,
legacy blog redirects, and public AgentGovern endpoint passed.

The public cutover completed on September 30, 2026. Squarespace remains the
registrar and delegates the zone to `burt.ns.cloudflare.com` and
`eleanor.ns.cloudflare.com`. Cloudflare reports the zone active, proxies the
apex and `www`, and uses Full (strict). The edge returns the LoopLabs app and
the final nginx configuration redirects AgentGovern and `www` URLs to the
LoopLabs apex while preserving paths and query strings.

A Let's Encrypt certificate for `looplabs.run` and `www.looplabs.run` is
installed under `nginx/certs/looplabs/` and expires December 29, 2026. Its
renewal dry run passed after the cutover. Cloudflare DNSSEC was enabled and its
DS record (key tag 2371, algorithm 13, digest type 2) was published at
Squarespace. The registrar UI contains the correct Cloudflare DS record; the
`.run` registry publication is still propagating. Google Public DNS's stale
Squarespace answers were flushed and it now returns the Cloudflare edge.
Google Search Console ownership is verified, and
`https://looplabs.run/sitemap.xml` is successfully processed with 32 discovered
pages.

The control plane is currently an interactive product tour. Its state is
stored in the visitor's browser. Deploying it does not connect the Python LLM
gateway or enable enforcement against real agents or external systems.

Founder mail routing is defined in `cloudflare/email-router`. Email Routing is
enabled with Cloudflare MX, DKIM and SPF records, and the
`looplabs-founder-router` Worker is deployed. `raj@looplabs.run` actively routes
to Raj's verified destination. Pratibha's destination remains pending until she
clicks Cloudflare's verification email; after verification, add the
`pratibha@`, `founders@`, and `hello@` routes to the deployed Worker.

## App releases

```bash
./deploy.sh
```

To verify through the legacy address and its production redirect:

```bash
DEPLOY_CHECK_HOST=agentgovern.ai ./deploy.sh
```

Set `LIGHTSAIL_KEY` if the SSH key is not at
`~/work/aws/LightsailDefaultKey-us-west-2.pem`. The server must already be in
`known_hosts`; the script never bypasses host verification.

The script runs the preflight, saves the previous image and server files, uploads
a separate source directory, builds an immutable image, and checks the landing
page, control plane and JavaScript asset in a private candidate container. It
then replaces only the web container, reloads nginx to resolve its new address,
and verifies the public page. A failure after the switch restores the previous
image and Compose configuration.

App releases preserve the live nginx configuration, certificates and `.env`.
Secrets and certificates are excluded from Docker build contexts. Do not run
`docker compose up --build` directly during the domain transition: the repository
nginx file describes the final domain setup, which must be activated separately.

## Move looplabs.run to Cloudflare

1. In the existing Cloudflare account, add `looplabs.run` on the Free plan. Review
   imported records; preserve any mail and verification records in use.
2. Replace Squarespace website records for the apex and `www` with:

   | Type | Name | Target | Proxy |
   | --- | --- | --- | --- |
   | A | `@` | `184.32.118.87` | Proxied |
   | CNAME | `www` | `looplabs.run` | Proxied |

   Remove conflicting website A/AAAA/CNAME records for these names. Do not remove
   unrelated MX, TXT or other service records.
3. In **SSL/TLS → Origin Server**, issue a certificate for `looplabs.run` and
   `www.looplabs.run`. Prefer generating the private key and CSR on the server,
   then submitting only the public CSR to Cloudflare. Install the certificate and
   its matching private key under:

   ```text
   /home/ubuntu/agent-trust-demo/nginx/certs/looplabs/fullchain.pem
   /home/ubuntu/agent-trust-demo/nginx/certs/looplabs/privkey.pem
   ```

   Keep the private key restricted to its owner. The existing AgentGovern
   certificate stays at `nginx/certs/fullchain.pem` and `privkey.pem`; its current
   Let's Encrypt renewal hooks must not overwrite the LoopLabs certificate.
4. Set Cloudflare **SSL/TLS → Overview → Full (strict)**. Do not use Flexible or
   downgrade certificate validation. A Cloudflare Origin CA certificate is
   trusted by Cloudflare, but not by a browser connecting directly to the origin.
5. In Squarespace's domain settings, use custom nameservers and enter the exact
   two nameservers assigned to **this Cloudflare zone**. Do not copy the old
   AgentGovern nameservers unless Cloudflare explicitly assigns the same pair.
   Check DNSSEC before the move; any old DS record must match the new provider's
   signing configuration. Enable Cloudflare DNSSEC after the zone is active and
   publish the DS values Cloudflare supplies at the registrar.
6. Activate the nginx host configuration only when the new certificate is
   installed and valid. Start by serving the app on both domains; activate the
   final legacy redirects only after Cloudflare reports the zone active, its
   edge certificate is active, and `https://looplabs.run` returns the app.

   The repository's `nginx/nginx.conf` is the final configuration: it serves
   LoopLabs, redirects `www` to the apex, and redirects AgentGovern URLs while
   preserving their path and query string. Keep a backup of the current file,
   validate a candidate with `nginx -t`, then reload. Since the configuration is
   bind-mounted as a file, write into the existing file rather than replacing
   its inode, or explicitly recreate the nginx container.
7. Verify HTTPS for the apex and `www`, old URL redirects, `/control-plane`,
   application assets and `/sitemap.xml`. Responses through the proxy should
   include Cloudflare headers such as `cf-ray`. Keep both domains proxied.

Do not enable a blanket cache-everything rule for app/API routes. Cloudflare can
cache static assets under its normal policy; runtime/API responses need their
own appropriate cache controls.

## Recovery

Each release saves the old Compose file and image ID in its backup directory and
creates `looplabs-web:rollback-<release>`. To restore an app release, use the
backup Compose configuration with an override selecting that rollback image,
start only `web` using `--no-deps --no-build`, then run `nginx -t` and reload
nginx. Verify the public page. Source archives include server files and
certificates: keep them private on the server.

A domain rollback is separate from an app rollback. Restore the prior nginx
configuration and DNS values if necessary; do not overwrite or discard either
domain's certificate.
