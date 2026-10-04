# Durable control plane: architecture and proof guide

## Current private workspace (October 4, 2026)

See [WORKSPACE_ACCESS.md](WORKSPACE_ACCESS.md) for the current sales and access journey. `/control-plane` is invitation-only. Raj and Pratibha sign in as separate named members at `/sign-in`; anonymous visitors see the overview and contact-sales path. The Actions page combines discount and refund views. Saved agent registration supports restricted discount, CRM and messaging roles over sample systems; the prepared refund agent retains its own boundary. See `CONNECTOR_VERIFICATION.md` for the private FetchSandbox CRM/messaging contracts and recorded failure proof. Other examples remain browser-local. No live customer systems, real payments, model execution or general workflow builder are connected. This section supersedes earlier references to a public tour and shared operator-token entry forms.


## Scope

`/control-plane/durable` is a separate authenticated, PostgreSQL-backed workspace.
It governs one controlled connector: updating a versioned discount test record.
These are real database transactions. The original product tour remains
browser-local. No external CRM, email, restaurant, payment, or model integration
is shipped, and this foundation does not establish industry-grade reliability.

## Product surface

The navigation and heading call this feature **Action workspace**. It presents
agent permissions, approval rules, requested discount changes, execution/recovery,
and saved decision history. The connected sample-data notice remains visible;
renaming does not expand connector support or production readiness. Setup paths,
commands and database details belong in this document, not the operator UI.
An absent or expired session opens the access form without an error banner;
a failed sign-in or operational request still reports its failure.

## Research and decisions

| Pattern | Implementation | Primary source |
| --- | --- | --- |
| Durable execution | Persist intent, transitions, and observed effects. Use Temporal later for long-running branching workflows rather than building a general scheduler. | [Temporal](https://docs.temporal.io/temporal) |
| Concurrency | Lock the workspace row in every mutation transaction. This gives a serial order for permissions, admissions, execution, and recovery, with limited per-workspace throughput. | [PostgreSQL row locking](https://www.postgresql.org/docs/current/explicit-locking.html) |
| Idempotency | Unique workspace/action ID, bound to a SHA-256 payload digest; changed payload returns a conflict. | [Stripe idempotent requests](https://docs.stripe.com/api/idempotent_requests) |
| Ambiguous effects | Expired execution leases and lost responses stop as uncertain; verification precedes any retry. | [Temporal on side-effect idempotency](https://temporal.io/blog/idempotency-and-durable-execution) |
| Recovery | Contain, verify observed record version/fields, compensate once as a new version. Never overwrite a newer write. | Connector-specific compare-and-swap contract |

```mermaid
stateDiagram-v2
    [*] --> blocked: missing authority / stale source / hard limit
    [*] --> held: needs approval
    [*] --> ready: policy allows
    held --> ready: exact-payload operator approval
    held --> rejected
    ready --> executing: fresh worker lease
    executing --> succeeded: observed effect acknowledged
    executing --> uncertain: crash / lost response / containment
    uncertain --> succeeded: existing effect verified
    uncertain --> ready: no effect proven; old lease fenced
    uncertain --> conflict: newer state exists
    held --> cancelled: authority changed
    ready --> cancelled: authority / policy / source / approval invalid
    succeeded --> recovered: contained + version-safe compensation
    succeeded --> conflict: recovery would overwrite newer state
```

## Implemented guarantees

- Organization and role come from authenticated, hashed credentials, not request
  fields. Agent identity must match the action. Operators approve; agents propose;
  workers execute the registered connector.
- Default deny for missing capability, identity, source state, or valid approval.
- Atomic lifetime action-admission reservations. Replays consume no second unit.
  This is not a monetary budget or automatically resetting quota.
- Exact-payload approval, policy-version binding, 15-minute approval expiry,
  and agent/approver authority revalidation before execution.
- Durable actions, unique effect records, 30-second execution leases, and fencing
  of expired/contained workers before the controlled connector can write.
- Containment invalidates pending authority. Uncertain actions do not auto-retry.
- Recovery preserves containment and refuses concurrent record changes.
- Persisted events identify the authenticated subject. The runtime role has only
  insert/read access to events. Database owners retain administrative control;
  evidence is not cryptographically signed.
- HTTP-only, same-site browser sessions with a one-hour lifetime. Browser
  mutations require the same origin. Responses do not expose credentials or SQL
  error details. Requests are size-bounded.

The connector writes its record and effect receipt in one PostgreSQL transaction,
then acknowledges the action in a separate transaction. This exposes a real
crash gap while making the effect independently observable. **External APIs do
not share that transaction.** Future connectors need stable idempotency keys,
authoritative effect lookup, fencing/version protection, and compensation rules.
If absence cannot be proven, retain containment and require manual resolution.

Service SQL is tenant-scoped and tested. Database row-level security is not
implemented; a compromised service database identity is a separate threat.
Runtime role restrictions do not substitute for SSO, rotation, security review,
backups, operational monitoring, or measured availability.

## Local setup

Use a dedicated PostgreSQL 17 database. Keep private connection values in ignored
`.env.local`, never source control:

```text
LOOPLABS_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:55432/looplabs_durable
LOOPLABS_TEST_DATABASE_URL=postgresql://OWNER:PASSWORD@127.0.0.1:55432/looplabs_durable
```

Optional Docker database: set a unique `LOOPLABS_POSTGRES_PASSWORD` in that private
file and run:

```sh
docker compose --env-file .env.local -f docker-compose.durable-local.yml up -d
pnpm durable:setup
pnpm durable:runtime-role
pnpm dev
```

Raj's laptop has a dedicated password-protected cluster under `.local/postgres`,
listening on loopback port 55432. The runtime-role command separates migration
owner credentials from the app connection. Restart the app after changing them.
Production app/worker environments must contain only the runtime connection.
Local private data is ignored by Git, Docker builds, and deployment transfers.

Read the operator token in `.local/durable-credentials.json` privately and use it
at `http://localhost:3007/control-plane/durable`. Do not share tokens in screenshots
or public JavaScript. Tests create/remove an isolated temporary schema and fail
instead of silently skipping when `LOOPLABS_TEST_DATABASE_URL` is unavailable.

## Stakeholder proof

1. Submit **5%** and execute the write. Observe one record version and effect.
2. Replay the same action ID. No second action, reservation, or write.
3. Prepare a new **25%** action. A named operator must approve its exact payload.
   **70%** is blocked by the hard policy limit.
4. Execute a fresh allowed action **with lost response**. The record changes once
   and execution becomes uncertain. Verify the outcome: it resolves without a
   second write.
5. Contain agents and restore a successful action. The previous discount becomes
   a new record version; agents remain contained. Intervening writes conflict.
6. Reload or use a second authorized browser: inspect/export the same server
   history. Browser storage deletion does not erase server state.
7. Run `pnpm quality`. Tests also SIGKILL a real worker before/after its effect.
   Lease expiration is injected in tests to avoid waiting 30 seconds.

Keep the background worker stopped during manual failure-injection walkthroughs
so it does not claim the action before the stakeholder clicks its controls.

## Agent integration

Any server-side framework capable of HTTPS/JSON can submit the **supported action
type**. This is provider-neutral transport, not support for arbitrary tools or
every workflow. All protected actions must pass through LoopLabs; independent
business-system credentials would bypass enforcement.

Provision a registered agent with the trusted administrative command:

```sh
pnpm durable:agent my-agent
```

Its scoped token is saved privately in `.local/agent-my-agent.json`. Never give
an agent operator, worker, or database credentials. A TypeScript client is in
`lib/durable/client.ts`; use it only in trusted server/agent runtimes:

```ts
const control = new LoopLabsClient(controlOrigin, agentToken);
const proposal = {
  actionId: crypto.randomUUID(), agentId: "my-agent",
  discount: 5, expectedVersion: trustedRecordVersion,
};
// Keep this exact proposal and ID across network retries.
const action = await control.propose(proposal);
const observed = await control.read(action.id);
```

- `POST /api/durable`: bearer token, JSON `{operation:"propose", actionId,
  agentId, discount, expectedVersion}`. Workspace is resolved from the credential.
- `GET /api/durable?action=ID`: agents read only their own action.
- Operators inspect, approve/reject, configure, contain, reconcile, and recover.
  Agents cannot execute, approve, recover, configure, or read the full snapshot.
- Configure `LOOPLABS_WORKER_TOKEN` privately and run `pnpm durable:worker`, or add
  `--once`. It executes persisted ready actions and flags expired leases as
  uncertain; it never automatically retries uncertain outcomes. A production
  supervisor and alerting are not configured by this release.

## Next production slice

Guarantees attach to operations, not industry names. The restaurant hypothesis
is catering quotes/customer replies with current pricing, owner approval, and
duplicate-send prevention. This connector is foundational logic, not a catering
integration. Exclude payments, reservations, and allergen decisions from a first
pilot. CRM/RevOps could instead start with one version-safe test-CRM connector.

Before either pilot: add one real adapter and authoritative effect lookup; trusted
human SSO and workload provisioning/rotation; the necessary output/model/budget
controls; managed PostgreSQL with PITR and a tested restore; worker supervision,
TLS, staged migrations, external network-fault tests, load tests, monitoring/SLOs,
and independent security review. Use Temporal when multi-step orchestration is
needed. Do not promise universal exactly-once effects or irreversible rollback.
