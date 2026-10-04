# Refund agent: bounded FetchSandbox proof

## Current private workspace (October 4, 2026)

See [WORKSPACE_ACCESS.md](WORKSPACE_ACCESS.md) for the current sales and access journey. `/control-plane` is invitation-only. Raj and Pratibha sign in as separate named members at `/sign-in`; anonymous visitors see the overview and contact-sales path. The Actions page combines discount and refund views. Saved agent registration currently supports the discount connector and restricted discount role; the prepared refund agent retains its own boundary. Other examples remain browser-local. No live customer systems, real payments, model execution or general workflow builder are connected. This section supersedes earlier references to a public tour and shared operator-token entry forms.


## What a stakeholder can try

Open **http://localhost:3007/control-plane/refunds**. Sign in with the same local
operator token used by the durable workspace. The token lives in the ignored
`.local/durable-credentials.json`; do not share it in chat or screenshots.

This is a prepared customer-support refund workflow for order LL-1001:

1. **Boundaries:** `refund-agent` has `stripe.refund` authority over one prepared
   $1,000 USD payment. No agent receives payment, worker, operator, or DB credentials.
2. **Propose $5:** ready under the default $10 automatic threshold.
3. **Propose $25:** held until the operator approves the exact payload. Approval
   lasts 15 minutes and binds the policy version and active approver identity.
4. **Propose $150:** blocked above the $100 hard per-action limit. No provider write.
5. On a ready action, click **Execute · lose the response**. The FetchSandbox
   engine commits the refund and replay record, then delays HTTP response three
   seconds. The adapter times out at 1.5 seconds and persists `uncertain`.
6. Click **Reconcile with provider**. It reads the complete bounded refund list,
   matches action metadata, payment, amount, currency and provider status, and
   marks the existing refund verified. It does not POST another refund.
7. Replay the original proposal, refresh, or use another authorized browser:
   the action and reservation remain singular and server-backed.
8. Contain the agent or require approval for every refund. Pending approvals and
   queued actions are invalidated. Previously sent payments cannot be recalled.

The UI is an operator-driven walkthrough of a prepared agent proposal. No LLM
is called; this proves authorization and execution handling, not autonomous
customer-support reasoning. The scoped agent HTTP path is separately exercised
by the end-to-end proof script.

## State machine

```text
proposal -> blocked / held / ready
held -> ready (exact approval) / rejected / cancelled
ready -> executing (persisted lease)
executing -> succeeded (matching successful provider refund)
executing -> uncertain (timeout, pending refund, worker crash, revoked authority)
uncertain -> succeeded (matching successful refund observed)
uncertain -> conflict (mismatched or duplicate provider records)
uncertain -> uncertain (lookup unavailable, no matching refund, failed/pending refund)
succeeded -> conflict (later re-verification finds duplicate provider records)
```

There is **no automatic retry from uncertain** and **no refund rollback**.
Absence in a list is not proof that an in-flight request cannot complete. A failed
or canceled provider refund stays reserved for manual resolution in this release.

## Local setup and runtime

Requires the existing LoopLabs PostgreSQL setup and the FetchSandbox backend's
Python environment. The latter is not downloaded or vendored into LoopLabs.

```sh
pnpm durable:setup
pnpm refund:setup
pnpm refund:twin
# In a separate terminal:
pnpm dev
# Optional recorded proof against the actual twin:
pnpm refund:proof
```

Set `FETCHSANDBOX_BACKEND_PATH` if FetchSandbox is not at `~/sandbox/backend`.
The twin listens only on `127.0.0.1:8017`; LoopLabs rejects any other adapter
origin, except the fixed private Docker service `http://refund-twin:8017`, including live Stripe. Setup creates ignored private scoped agent/twin
credentials and app environment values. Restart Next after provisioning.
The existing runtime DB role receives read/insert/update on refund state and only
read/insert on refund events; events reject update/delete.

The twin adapter imports FetchSandbox's actual `SandboxEngine`, vendored Stripe
OpenAPI, rules and resources. The dedicated refund fixture adds:

- parameter-bound `Idempotency-Key` replay on `POST /v1/refunds`, using the existing
  configurable FetchSandbox idempotency engine;
- a successful-refund fixture outcome, original-payment balance enforcement, and
  an authoritative complete list for the bounded fixture;
- a post-write transport delay, not a fabricated browser animation;
- private atomic state-file replacement preserving refund and replay records
  across normal twin restarts, including the internal protocol replay cache.
  Older replay-less fixture state refuses another write for an already observed
  action and requires reconciliation. The single-process fixture isn't a production DB.

These are controlled fixture contracts based on Stripe documentation, not
measured full provider parity. No shared FetchSandbox deployed twin is modified.
The MCP `validate_integration` tool was inspected and invoked for Stripe discovery;
its generic request logs alone are not an application-state proof. The refund
proof instead drives LoopLabs through scoped agent credentials against the local
engine and inspects persisted state plus actual twin records. It is not a claim
that the hosted MCP's payment-to-email receipt suite verified this refund workflow.

## API and proof boundaries

`POST /api/durable/refunds` supports `propose`, `approve`, `reject`, `execute`,
`reconcile`, and `configure`. Agent tokens can only propose and read their own
`GET /api/durable/refunds?action=UUID`. The full snapshot and controls require an
operator; trusted workers can execute. The operator can drive a prepared proposal
for the walkthrough; event subjects identify the actual submitting operator.
Browser requests use the existing HTTP-only, same-site cookie and origin checks.

Proposal fields: `actionId` (UUID v4), `agentId: "refund-agent"`,
`paymentId: "ch_looplabs_refund_demo"`, integer `amount` in cents, `currency: "usd"`.
Unknown fields, currencies, agents or payments are refused. Keep the same action
ID and payload across network retries. Amount changes require a new proposal.

The provider adapter is bound to `local-proof`; other workspace credentials are
refused before payment evidence or mutations are accessed. This is one dedicated
workspace/payment fixture, not a multi-customer billing service.

Workspace locks serialize budget reservations and control changes. The $250
allowance is lifetime, shared across this demo; it does not reset daily. The
payment balance also checks outstanding reservations. Identity, tool authority,
policy version and exact approval are rechecked at execution. Intent/lease are
committed before HTTP execution. Duplicate workers don't get a second send.
Expired leases require reconciliation; no automatic refund retry is enabled.

No universal external fencing is claimed: a payment already submitted can finish
when authority is later contained. Provider idempotency bounds duplicate requests;
LoopLabs retains uncertainty instead of pretending revocation reverses money.
The fixture's original-payment balance checks provide the final external bound.

## Validation and remaining work

`pnpm quality` includes PostgreSQL-backed refund tests, actual API handlers,
adapter validation, changed payloads, spoofed/revoked identities, expired approvals,
concurrent workers, missing evidence, duplicate provider records and containment.
`pnpm refund:proof` additionally sends real HTTP through the local FetchSandbox
engine and saves sanitized evidence to `.local/refund-proof.json`.

Before live refunds: real provider test-mode contract tests, SSO and provisioning,
credential isolation/rotation, account/customer scope, eligibility and fraud rules,
a daily budget reset/reservation lifecycle, authoritative paginated lookup,
webhook signature handling, pending/failed resolution, managed DB backups,
worker supervision, monitoring and independent security review. Multi-step workflow
orchestration and autonomous support reasoning remain separate work.

References:
- https://docs.stripe.com/api/idempotent_requests
- https://docs.stripe.com/api/refunds/create
- FetchSandbox source: `~/sandbox/backend/app/sandbox/engine.py`
- FetchSandbox MCP: `~/sandbox/mcp/README.md`

## Hosted test workspace

Deployment uses a separate PostgreSQL database with a restricted runtime role,
a persistent private FetchSandbox fixture, and fresh server-owned credentials.
The Docker fixture listens inside the private service network; port 8017 and
PostgreSQL are not published to the internet. Only the fixed `refund-twin`
service origin is permitted in addition to local loopback. The runtime web
container receives neither database-owner credentials nor agent/operator tokens.
Operators sign in with a separately shared private token. This is still a
bounded test-payment proof, not a live refund integration or general agent gateway.

The infrastructure reference files are in `infrastructure/`. The fixture build
context uses the existing FetchSandbox source; its Docker ignore rules exclude
private state, credentials and node dependencies. PostgreSQL uses a named volume;
fixture state uses private host storage. Both services restart after reboot.
`deploy.sh` verifies migration 2, test-provider availability, anonymous denial,
pages and assets before activating the release. This single-server deployment
does not establish high availability or tested disaster recovery.

Behind HTTPS reverse proxies, set the server-owned `LOOPLABS_DURABLE_ORIGIN`
to `https://looplabs.run` (or the separate AgentGovern preview origin). Browser
mutations compare with this fixed origin, not caller-supplied forwarded headers
or the container address; sessions remain Secure. Release checks exercise this
proxy path with an invalid credential and require authentication denial (401).
Provisioning must grant the runtime role SELECT on `ll_migrations` for release
checks; it must not grant migration writes or schema ownership.
