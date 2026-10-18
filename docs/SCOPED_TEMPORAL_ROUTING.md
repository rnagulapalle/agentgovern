# Scoped background workflow routing

October 7, 2026. Local verification passed; not deployed or enterprise accepted.

Migration 13 adds immutable `ll_temporal_record_routes` and permits the explicit
`private-record-twin-2` Temporal contract. Applied migrations 1–12 are unchanged.
No old route, action, approval or historical contract is upgraded. Owner setup:
`pnpm workspace:record-routing`, with the separate migration-owner connection.
The CLI checks prerequisite and migration digests, grants runtime SELECT/INSERT
on routes only, and never transfers ownership or enables execution.

A scoped managed run requires existing named-owner agents and explicit record
grants. It cannot implicitly register or grant agents. The legacy runner excludes
scoped work even before transfer. Transfer freezes scope ID/version, binding and
an explicitly configured content-bound compatible worker build. Configure
`LOOPLABS_TEMPORAL_RECORD_BUILD_ID` to the verified deployed worker manifest ID;
absence is a refusal. Scheduler starts the run with an exact pinned deployment
override, regardless of which build is current. Existing v1 scheduling is unchanged.

The compatible activity resolves the route from the authenticated workload's
workspace and immutable saved plan. It checks current enrollment, exact plan hash,
record/recipient/binding and its own verified worker build. The configured private
provider must match that route. No URL, provider credential, record ID or recipient
comes from Temporal input or chat. A missing, changed, revoked or unsupported route
never falls back to the original sample or the hosted adapter. Both v1 and v2
contracts still recheck current approvals, grants, policy, identity, budget,
dependencies and observed effects through the existing control services.

Record-scoped hosted CRM remains unsupported without the required atomic source
condition. This contract supports only the fixed acknowledgement graph against
isolated private twins, not arbitrary agent orchestration or live integrations.

## Measured proof

`pnpm temporal:record-proof` starts real packaged worker and scheduler processes,
a real Temporal test service, dedicated PostgreSQL and an actual private HTTP
fixture. Ten customer records and twenty concurrent transfer requests create ten
routes without effects. Held histories are pinned explicitly. After confirmed
worker SIGKILL and replacement, nine independently approved workflows complete
with exactly eighteen correctly targeted CRM/email effects. One actual CRM HTTP
response is lost; readback completes its run without a second write. The tenth
scope is revoked and produces no effects, while the others continue. All nine
completed histories replay without additional effects or provider secrets.

This is one bounded, same-workspace local test, not sustained capacity, complete
tenant isolation, live provider parity, high availability or a production SLA.
Invited record enrollment/grant UX and browser-based selection remain to be built.
Earlier proof suites, coverage, production build, links and exact-head CI must be
fresh before this change is committed or promoted. Production is unchanged.

Regression verification: 340 tests across 45 files, including explicit coverage of the new record-routing module. Ten fresh actual proof suites match their source fingerprints. Aggregate coverage is 97.34% statements, 95.64% branches, 99.46% functions and 98.18% lines. The proof image is `sha256:cabd22c4b184843ebe1197ed3d8aa27f2c5afdfe97287c8f76ed4ecfc6e6e3da`. These checks do not replace named customer-environment acceptance.
