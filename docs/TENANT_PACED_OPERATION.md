# Paced operation across two tenant queues

The actual local trial passed on October 8, 2026. Its 207787 ms observation window completed all 24 additional workflows; enterprise acceptance remains incomplete.
This extends `TENANT_BOUNDARY_PROOF.md` without replacing its original refusal,
restricted database, browser-session, lost-response and packaged-worker checks.

The explicit `LOOPLABS_TENANT_LOAD_PROOF=1` mode enrolls twelve additional independent
test records per company. Each company reuses its own CRM and messaging agents
with a fixed lifetime allowance of thirteen (the original run plus twelve new
runs). Plan submission is repeated using the same identities. All new actions
must remain held and effect-free until the other named member approves them.

Six waves independently approve two workflows per company, with thirty-second
arrival gaps. Exact provider effects, unapproved later holds, per-run observed
completion delay and the shared-agent reservation counts are checked. During the
third wave one company's packaged worker receives SIGKILL; the other queue must
finish while the stopped company's effects remain absent. Replacement must resume
the same histories/actions. Two additional lost CRM responses require readback.
Every completed workload history is replayed without new provider effects.

Run with a dedicated local test database, built application/worker artifacts,
private provider runtime and unused trial ports:

```sh
LOOPLABS_TENANT_LOAD_PROOF=1 node --env-file=.env.local --import tsx scripts/tenant-isolation-proof.ts
```

The default command must be rerun too, preserving the original two-company receipt.
The measured workload receipt is `evidence/tenant-paced-operation-proof.json`; it
contains the observed wave counts and per-run timing, bound to the actual sources.
Neither mode changes production ownership, applied migrations or live providers.

This is a bounded paced test, not steady-state saturation, a sustained remote SLO,
provider-rate-limit parity, database tenant RLS, independent security review or a
production-ready multi-tenant service. Completion timing includes polling, approval
transactions and deliberate fault downtime. The pilot workload and SLO still need
agreement and measurement on allocated persistent staging.
