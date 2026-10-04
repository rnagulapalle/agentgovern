# Durable control-plane proof — October 3, 2026

Scope: local implementation on `codex/durable-control-plane`, PostgreSQL 17.11,
Next.js server, controlled database-record connector. This is implementation
evidence, not an availability certification or proof of an external integration.

## Automated gate

`pnpm quality` passed with 72 tests across 10 test files, coverage thresholds,
repository/claim policy, lint, types, production build, 50 rendered internal
destinations, and diff hygiene. The original regression gates remain enabled.
PostgreSQL is mandatory in local tests and supplied as a service in GitHub CI.

The added tests prove scoped authorization, exact identity matching, tenant
isolation, same-origin browser mutations, secure operator cookies, bounded JSON,
duplicate/concurrent submissions, payload mismatch rejection, bounded admissions,
stale state and missing capabilities, exact-payload approvals, approval expiry
and revocation, policy invalidation, containment, lease fencing, uncertain effects,
version-safe compensation, concurrent-write refusal, and event edit refusal.

Two tests spawn a real worker subprocess and kill it with SIGKILL:

- Before effect: persisted execution becomes uncertain; reconciliation proves no
  effect and fences the old worker before a new execution creates one effect.
- After effect: reconciliation verifies the existing committed effect and does
  not execute it a second time.

Lease expiry is shortened by SQL in these isolated tests; production leases are
30 seconds. No production/customer database is used.

## Manual end-to-end proof

| Experiment | Result |
| --- | --- |
| Operator login through actual Next.js endpoint | Authenticated workspace opened; token absent from response body |
| Lost response after a real test-record write | Action stayed uncertain; reconciliation resolved it without a second write |
| Replay from the dashboard | Same action returned; no extra effect |
| Containment and compensation | Previous discount restored as a new version; agent stayed contained |
| Browser reload | Persisted server state remained visible |
| PostgreSQL stop/start with pending approval | Held action and source state survived; approval and execution afterward produced one effect |
| New scoped agent with TypeScript client | Submitted and read its own supported action |
| Independent worker command with `--once` | Executed the persisted ready action; client replay returned the same successful action |
| Desktop and 390px mobile browser | No page errors or horizontal overflow; mobile detail text at least 16px |

During database restart testing, idle-pool disconnections exposed a missing
error listener in the development process. A sanitized listener was added and
tested; the fresh production build survived a repeat restart and reconnected.
No connection details or credentials are logged by that listener.

Private operational evidence, screenshots, and credentials remain under ignored
`.local/`. PostgreSQL data, passwords, and local evidence are excluded from Git,
Docker build contexts, and deployment transfers. The runtime database login is
separate from the migration owner and cannot alter audit events.

## What this does not establish

No deployed customer control plane, actual CRM/email/payment connector, provider
SDK integration, complete model/output policy, SSO, automated production worker
supervision, PITR restore exercise, load/soak result, external-network fault
guarantee, database RLS, or cryptographically signed evidence is established.

Use `docs/DURABLE_CONTROL_PLANE.md` for architecture, current limits, stakeholder
steps, agent API contract, and the next bounded production slice.
