# Private control plane and sales journey

Updated October 4, 2026.

## Visitor experience

The landing page explains workflow automation, action boundaries and outcome verification. `/platform` gives a public three-step product overview. `/contact-sales` asks about the buyer and one workflow; an accepted request is persisted for the founders under `/control-plane/requests`. A meeting or email is **not** sent automatically. The separate calendar link lets the visitor choose a time.

All `/control-plane` pages require an invited named member session. Anonymous, expired and revoked sessions see the product explanation, contact-sales link and team sign-in. Server-rendered sales requests independently enforce membership and tenant scope. Legacy `/control-plane/durable` and `/control-plane/refunds` redirect to one Actions page with a workflow selector. `/agent-governance-demo` redirects into the same gate.

## What can be evaluated

| Area | Working scope | Boundary |
| --- | --- | --- |
| Agent onboarding | Saved ID, name, named owner, restricted role, sample connector and lifetime action allowance; scoped key shown once | New registrations support discount, CRM and messaging agents; no arbitrary roles or live connector credentials |
| Connectors | Versioned sample discount record and prepared simulated refund provider | CRM, email, live payments and model providers are not connected |
| Discount actions | Saved rules, allow/hold/block, exact approval, execution lease, replay protection, verification and version-safe compensation | One controlled sample record |
| CRM actions | Saved agent, exact named approval, fixture source-version bound, execution and read-back | One simulated contact; fixture CAS is not live HubSpot parity |
| Customer messages | Saved agent, exact template/recipient allowlist, named approval, execution and outcome lookup | Private Resend twin; no real email or delivery proof |
| Refund actions | Prepared refund agent, amount/budget policy, named approvals, execution and provider reconciliation | Private payment twin; no real money; irreversible refunds are not rolled back |
| Output/model/multi-step examples | Existing deterministic browser-local examples behind team sign-in | No live model execution, production output gateway or general workflow builder |

For CRM and messaging, an operator cannot approve a request they submitted; another named member must review it. Agent-originated requests need a named operator. This separation is not yet required by the older discount/refund walkthroughs.

Named human operators may configure the supported boundaries, approve and execute. Scoped agent keys may submit/read their own actions and cannot approve, execute or configure. Saved decisions record the authenticated member email. Revoking the approver invalidates delayed approval; logout ends the session, not the already reviewed approval, which retains its existing 15-minute expiry.

## Authentication and persistence

Migration 3 adds members, hashed sessions, persistent request throttles, agent profiles and sales requests. Applied migrations 1 and 2 are unchanged. Passwords use salted scrypt; raw passwords are never stored in PostgreSQL. Sessions are random 256-bit values stored as SHA-256 digests, expire after eight hours, and use HTTP-only, same-site strict cookies (Secure under HTTPS). Browser mutations require the server-owned same origin. Failed login responses do not enumerate accounts. Membership, organization and authority are rechecked server-side. Sessions and passwords are not stored in browser localStorage.

There is no public registration. Raj and Pratibha have separate founder accounts. Private initial passwords belong in an ignored mode-0600 credentials file, never this document, chat, Git or deployment output. This is basic invited-team authentication, **not** enterprise SSO, MFA, an account recovery service or an independently audited security product.

An explicitly opted-in isolated staging deployment (`LOOPLABS_TEMPORAL_WORKSPACE=staging`)
may set `LOOPLABS_DURABLE_ORIGIN` to its own canonical HTTPS origin. It must contain
only the origin, without credentials, path, trailing slash, query or fragment.
Browser mutations must match that exact server-owned value; Host/forwarded/Origin
headers cannot change the configured target. Session cookies retain HTTPS Secure
behavior through the same helper. Outside this staging opt-in, the existing two
production origins remain the only supported configured values. This fixes staging
configuration compatibility; it does not establish remote HTTPS/browser acceptance.

Provision locally after durable/refund setup:

```sh
pnpm workspace:setup
```

The command requires a privileged migration connection, applies migration 3 with a recorded digest, seeds founder memberships and prepared profiles, and grants only required runtime privileges. It preserves existing credentials on rerun. A database trigger rejects runtime insertion of operator or worker tokens; runtime provisioning is limited to agent keys. Owner credentials remain separate from app runtime credentials. Apply the same migration and restricted grants on the existing server before releasing this version; `deploy.sh` verifies migration 3.

## Reference and validation

The public navigation audit checked 29 Runlayer homepage destinations successfully and inspected the demo form without submitting it. [Runlayer's demo form](https://www.runlayer.com/book-a-demo) collects buyer and company context before a sales conversation. LoopLabs follows that visitor pattern with its own wording and product scope; it does not adopt Runlayer's certifications, integrations or readiness claims.

Authentication design references: [OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [OWASP session management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html).

Regression tests cover anonymous server-rendered gates, database failure, revoked members, tenant-scoped sales requests, bounded public intake, CSRF, login throttling, hashed credentials, cookie expiry/logout, named approval revocation, restricted agent registration and key authority. Existing durable/refund adversarial tests remain mandatory. Browser verification checks both founder identities, private API denial, unified workflows, logout and 390px layouts. A local browser walkthrough registered an agent owned by Pratibha, replayed a held request, approved as Pratibha, interrupted execution and verified one effect; the scoped agent key was denied execution. Private workspace text is masked in session replay and excluded from automatic interaction capture. Releases require `pnpm quality` and `./deploy.sh`.

Migration 4 adds shared CRM/messaging actions, policies and protected event history, and extends supported profile roles. Existing migrations 1–3 remain byte-for-byte unchanged. Use `pnpm connectors:setup` with migration-owner access, then run the private twins. The runtime role cannot update/delete their events. See [CONNECTOR_VERIFICATION.md](CONNECTOR_VERIFICATION.md).
