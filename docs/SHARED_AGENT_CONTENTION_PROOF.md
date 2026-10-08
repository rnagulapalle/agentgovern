# Shared-agent allowance contention

October 8, 2026. Bounded local contention proof; not production capacity acceptance.

`pnpm temporal:shared-agent-proof` runs the actual packaged worker/scheduler, Temporal, PostgreSQL and private HTTP twins from the existing record harness. Twelve customers have explicit grants to the same CRM agent and the same messaging agent. Each agent has a lifetime action allowance of ten.

Nine customer workflows reserve nine actions per agent without approval or effects. The remaining three customer submissions run concurrently against the final slot. Exactly one must obtain both action reservations and a pinned Temporal route; the other two receive 403, create no connector actions and acquire no Temporal ownership. Both agents retain exactly ten reservations. Rejected customers retain saved plans/run intents with incomplete submission; the harness does not delete drafts or raise limits to force success.

After actual worker SIGKILL, the final admitted enrollment is revoked. Independent approval of the other nine workflows and a replacement packaged worker must produce exactly eighteen intended effects. The actual lost CRM HTTP response is read back without resend. All nine completed histories replay without effects, and the revoked customer has no effects. Reservation counts remain ten after completion/replay; containment must not silently return lifetime authority.

This closes one measured shared-agent final-slot race and target-correctness case. It is not a steady-state throughput benchmark, fairness/quota test, distributed multi-region acceptance, proof of every possible interleaving or a cryptographic audit. The shared workspace transaction lock currently serializes admission; no narrower-lock performance claim is made. Remote operational acceptance and real-provider guarantees remain open.

Evidence is `docs/evidence/temporal-shared-agent-proof.json`, checked against actual source fingerprints. The default ten-record proof and the forty-customer paced load mode are preserved and rerun after harness changes. Use the dedicated test PostgreSQL database, built worker manifest and private FetchSandbox Python runtime; never production credentials or data.
