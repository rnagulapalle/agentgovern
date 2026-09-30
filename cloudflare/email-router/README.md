# LoopLabs founder email routing

Cloudflare Email Routing delivers these public addresses without exposing personal Gmail addresses on the website:

- `raj@looplabs.run` → Raj
- `pratibha@looplabs.run` → Pratibha
- `founders@looplabs.run` → both founders
- `hello@looplabs.run` → both founders

Cloudflare requires each destination address to be verified before a Worker can forward mail to it. The domain must also be active on Cloudflare DNS and onboarded to Email Routing so Cloudflare can add its MX, SPF, and DKIM records.

## Production status

Email Routing is active for `looplabs.run`. The dashboard-deployed Worker is
named `looplabs-founder-router` and contains the logic in `src/index.ts`.
`raj@looplabs.run` currently forwards directly to Raj's verified destination.
Pratibha's destination is pending verification, so the three routes that can
send to her must not be activated until she completes Cloudflare's email link:

- `pratibha@looplabs.run`
- `founders@looplabs.run`
- `hello@looplabs.run`

The Worker uses the top-level `addresses` configuration supported by Wrangler 4.113 or later. The checked-in Wrangler name matches the production Worker: `looplabs-founder-router`.

After deployment, test each alias from an address other than its destination mailbox. Confirm delivery in Cloudflare Email Routing logs and in the destination inboxes.
