# Security review pack — draft, October 21, 2026

Draft for PRD MVP #32: what is stored and where, which language model sees
what, and how access is controlled. Every statement is taken from this
repository at commit `14ee612` and names its source. Items marked **To confirm**
need founder input before this pack is shared with a buyer. This is not a
certification, an independent security review or a compliance claim.

## Scope

The hosted deployment is an invited evaluation workspace. Its profile exposes
Quotes, Agents, Actions, Workflow runs and saved discount history behind
named-member sign-in (`docs/CONTROL_DEMO_RELEASE.md`). Effects use sample
records or simulated systems; no customer email is delivered, and live customer
connectors, refunds and a general workflow builder are not available
(`components/marketing/product-overview.tsx`).

## What is stored and where

| Data | Stored as | Where | Source |
|---|---|---|---|
| Member accounts | Email, name, salted scrypt password hash; raw passwords are never stored | Application PostgreSQL | `docs/WORKSPACE_ACCESS.md`, `lib/workspace/schema.sql` |
| Sign-in sessions | SHA-256 digest of a random 256-bit value; 8-hour expiry | Application PostgreSQL | `docs/WORKSPACE_ACCESS.md` |
| Agent, operator and worker keys | Hash only, with role `operator`, `agent` or `worker` | Application PostgreSQL | `lib/durable/schema.sql` |
| Actions, approvals and decisions | Exact request, policy version, approver email, outcome | Application PostgreSQL | `docs/WORKSPACE_ACCESS.md` |
| Event history | Inserted and read by the app; the app cannot update or delete it | Application PostgreSQL | `docs/CONNECTOR_VERIFICATION.md` |
| Sales inquiries | Work email, name, company, company size, role, workflow description | Application PostgreSQL | `lib/workspace/schema.sql` |
| Company directory | Company name, departments, teams, agent purpose and environment | Application PostgreSQL | `docs/CONTROL_CENTER_UX.md` |
| AWS agent inventory | Account, region, runtime and version references from read-only discovery; owner review | Application PostgreSQL | `docs/AWS_CONNECTION_JOURNEY.md` |
| AWS observation enrollment | Runtime reference, version, log group, display name, owner and reviewer; append-only | Application PostgreSQL | `lib/workspace/cloud-observation-schema.sql` |
| AWS activity | Bounded projection read on demand from the customer's logs; request bodies, response bodies and customer content are discarded | Not stored as a history | `docs/AWS_AGENT_OBSERVATION_PROOF.md`, `docs/CONTROL_CENTER_UX.md` |
| Chat request text | Kept only in browser memory; raw chat is not persisted | Browser | `docs/CONVERSATIONAL_WORKSPACE.md`, `AGENTS.md` |
| Workflow scheduling history | Temporal history | Separate Temporal database | `docker-compose.temporal-platform.yml` |
| Sample CRM and email records | Simulated provider state | Connector twin's private state directory | `docs/CONNECTOR_VERIFICATION.md` |

**To confirm:** the production database location and whether it runs on the
same host as the web app (the repo's platform layout runs web, application
database, Temporal database, workers and connector twin as containers on one
host: `docker-compose.temporal-platform.yml`); encryption at rest; backup
schedule, retention and location; data retention and deletion on request.

## Which language model sees what

| Feature | Model | What is sent | What is not sent | Source |
|---|---|---|---|---|
| Quote planning | Amazon Bedrock, `us.amazon.nova-lite-v1:0` only, region us-west-2, temperature 0 | The user's typed turns | Pricing, source records, authority and credentials | `lib/quotes/chat-planner.ts` |
| Workflow chat (customer acknowledgement) | Same model and region | Typed request and clarification; for a refinement, the prepared message subject and text | Connector URLs, credentials, grants, approvals and action payloads, which the model cannot supply | `lib/enquiries/chat.ts`, `docs/SCOPED_CHAT_EXPERIENCE.md` |

The model interprets a request; deterministic server validation decides what
work is allowed. The model cannot create execution payloads, permissions or
approvals (`docs/CONVERSATIONAL_WORKSPACE.md`). Any other model is refused at
runtime (`lib/quotes/chat-planner.ts`, `lib/enquiries/chat.ts`). In the staging
trial the planner's cloud permission was limited to invoking that one inference
profile (`docs/STAGING_PLANNER_SESSION.md`).

**To confirm:** that production uses the same model, region and narrowly scoped
permission; Bedrock data-handling terms that apply to the account.

## How access is controlled

**People.** Only invited named members can sign in; there is no public
registration. Failed sign-in responses do not reveal whether an account exists,
sign-in attempts are throttled, changes require the server's own origin, and
membership and authority are rechecked on the server
(`docs/WORKSPACE_ACCESS.md`). There is no single sign-on or multi-factor
authentication (`docs/WORKSPACE_ACCESS.md`).

**Agents.** Agent keys can submit and read their own actions only. They cannot
approve, execute or configure (`docs/WORKSPACE_ACCESS.md`). The app's database
role cannot create operator or worker keys
(`lib/workspace/schema.sql`). Agents are never given twin, database, operator or
worker credentials (`docs/CONNECTOR_VERIFICATION.md`).

**Approvals.** An approval binds the exact request, policy version, source
version where relevant, and expiry (`docs/WORKFLOW_ONBOARDING_PROOF.md`). A
requester cannot approve their own request
(`components/control-plane/saved-workspace.tsx`,
`docs/SHARED_WORKFLOW_APPROVALS.md`). An approval expires after 15 minutes, and
revoking the approver invalidates a delayed approval
(`docs/WORKSPACE_ACCESS.md`).

**Uncertain outcomes.** Unknown outcomes are reconciled rather than resent
(`docs/CONTROL_PLANE.md`).

**Workspace isolation.** In installed deployments, tables such as AWS
observation enrollments and sales requests use forced PostgreSQL row-level
security bound to the workspace (`lib/workspace/cloud-observation-schema.sql`,
`docs/WORKSPACE_ACCESS.md`).

**Restores.** Restoring a backup cannot replay old approvals: recovery epochs
contain restored work until it is reviewed (`docs/WORKSPACE_DISASTER_RECOVERY.md`).

**Cloud access.** AWS discovery is read-only; the web process issues no
credentials and changes no IAM (`docs/AWS_CONNECTION_JOURNEY.md`).

**To confirm:** who has server and database administrator access, how it is
protected and reviewed, and how access is removed when someone leaves.

## Infrastructure and network

- Browser → Cloudflare HTTPS → nginx HTTPS on an AWS Lightsail server in
  us-west-2 → web container (`docs/DEPLOY.md`).
- Cloudflare proxies the domain with Full (strict) TLS; DNSSEC is enabled; the
  origin certificate is from Let's Encrypt (`docs/DEPLOY.md`).
- Internal database and provider connections use TLS with private certificate
  authorities (`docs/INTERNAL_TLS_RECOVERY.md`).
- Releases deploy only from a clean, pushed `main` with successful CI for the
  identical source tree, with rollback (`docs/RELEASE_WORKFLOW.md`, `AGENTS.md`).

## Outside services

| Service | Use | Source |
|---|---|---|
| Cloudflare | DNS, public HTTPS, reverse proxy, email routing | `docs/DEPLOY.md` |
| AWS | Lightsail hosting; Bedrock model calls; read-only discovery of a customer's AgentCore agents when connected | `docs/DEPLOY.md`, `lib/quotes/chat-planner.ts`, `docs/AWS_CONNECTION_JOURNEY.md` |
| PostHog | Product analytics on looplabs.run (US host), session recording with all inputs masked | `instrumentation-client.ts` |
| Cal.com | Booking link for sales calls | `app/contact-sales/page.tsx` |
| GitHub | Source code and CI | `.github/workflows/quality-gates.yml` |

In the private workspace, the whole workspace container is marked
`ph-no-capture`, which PostHog documents as excluding elements from
autocapture, and `data-private`, which this site's recording settings mask
(`components/control-plane/shell.tsx`, `instrumentation-client.ts`).

**To confirm:** the complete list of services that receive customer data, and
the agreements in place with each.

## Known limits

- No single sign-on or multi-factor authentication.
- Evidence is protected by database permissions, not cryptographically signed;
  database owners can administer it (`docs/CONNECTOR_VERIFICATION.md`).
- No live customer connectors; CRM and email effects use simulated systems.
- No independent security review or external audit.

## To confirm before sharing

1. Production database location, encryption at rest, backup schedule,
   retention and restore testing.
2. Who has server, database and cloud administrator access, and how it is
   granted, reviewed and removed.
3. Data retention and deletion on request.
4. Incident response contact and process.
5. Production model, region and permission scope.
6. Complete list of outside services that receive customer data.
7. Security certification plans, if any.
8. Whether this pack is shared publicly or privately with buyers.
