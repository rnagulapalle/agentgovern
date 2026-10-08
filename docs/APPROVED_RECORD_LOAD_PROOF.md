# Paced approved customer load

October 8, 2026. Bounded local measurement, not enterprise capacity acceptance.

`pnpm temporal:approved-load-proof` runs the same actual packaged worker/scheduler, Temporal, PostgreSQL and HTTP twin harness as the preserved ten-record restart proof. The larger mode enrolls forty independent customers, eighty scoped single-action agents and forty immutable build-pinned routes. Eighty paired transfer requests must produce only forty routes. Held work remains effect-free before independent approval.

After a confirmed worker SIGKILL and replacement, a named reviewer approves four paced batches of 10, 10, 10 and 9 customers, with twenty-second gaps. Each exact action receives duplicate approval requests. Later batches must remain held. The fortieth enrollment is revoked and must never execute. Thirty-nine completed workflows must produce exactly seventy-eight effects for the intended records and recipients. Four actual lost CRM HTTP responses require read-back without resend. All completed histories must replay without effects or provider secrets.

The artifact `docs/evidence/temporal-approved-load-proof.json` stores the measured observation window and each customer's elapsed milliseconds from its first automated approval attempt to observed database completion. Timing includes approval transactions, queueing, connector execution and polling delay; it is not isolated engine latency or human decision time. The observation window includes deliberate pacing gaps. Do not divide effects by that window and advertise it as peak throughput. No timing threshold is used to claim an SLO. Source fingerprint gates reject stale proof.

This single-laptop, single-workspace sample does not measure steady-state saturation, remote database/Temporal failover, real-provider rate limits, delivery, tenant quotas or noisy neighbors. Its separate one-action agents avoid a shared-agent budget contention workload; that needs its own test. Remote representative load and an agreed pilot workload/SLO remain required by `ENTERPRISE_ACCEPTANCE.md`. Production ownership is unchanged.

Build the worker manifest first, configure the dedicated test database and private FetchSandbox Python runtime, and keep port 8018 free. Both the original record proof and this larger mode must pass alongside `pnpm quality`; the original nine-completion/eighteen-effect gate is retained.
