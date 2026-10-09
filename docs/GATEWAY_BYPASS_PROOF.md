# Mandatory gateway path: isolated proof

Private CI run `37960618067` passed this disposable experiment, its full regression
gate and owned cleanup. The retained receipt matches all 44 current source hashes
and all three independently rebuilt component byte hashes. This is not a deployed
gateway or customer-side sidecar. The existing control engine and connector/workflow
route handlers are reused unchanged; Temporal is not part of this transport trial.

## What this experiment established

An enrolled agent receives only its own scoped LoopLabs credential and immutable
workflow step IDs. Its container can reach LoopLabs over TLS, but must not reach
the private provider or PostgreSQL, including by their actual IP addresses.
PostgreSQL reachability is tested with a TCP connection, not an HTTP request that
might fail even while the database is reachable. The controller independently
checks that both backend services are healthy; denied access is not inferred from
stopping a backend. Before proposal, containment must be forbidden and no actions or effects may exist.
After the action is saved and held, raw attempts to approve, execute or contain
with the agent's credential must return forbidden without changing that state.
Approval and execution against an unproposed ID return not found; a separate
actual-HTTP regression checks that they create no action, reservation or effect.

The agent proposes the fixed CRM update and retries its original ID. The result
must stay held with one allowance reservation and no provider effect. Stopping
LoopLabs must leave the client outcome unconfirmed; the agent must not bypass
LoopLabs or retry a provider directly. Both reads and same-ID proposals must refuse
while the transport is down. Restart must preserve the held action. The unchanged
migration10 recovery fence is enrolled with an externally held epoch; a deliberately
mismatched database epoch must refuse access with no effects before the trusted
test controller restores the original epoch. This is not an archive-restore drill.
A separately named member approves the exact saved payload; a simulated lost CRM
response must become uncertain. Killing and restarting the transport process must
retain that uncertainty. Readback reconciliation must establish the original effect
without resending it. Only then can the dependent acknowledgement be submitted,
independently approved and executed. Native email readback must match the approved
recipient, sender, subject and text. Final workflow verification must find exactly
two actions, reservations and provider effects. Killing and restarting the twin
must preserve these effects. Post-restart readback checks the completed run and
exact native CRM/email records. Repeating final workflow verification must return
409, retain exactly one completion event and produce no new effect or reservation.
Revocation must deny subsequent agent access.

## Topology and resource boundaries

Two new internal Docker networks separate the agent-facing transport from the
backend. Only LoopLabs joins both. No host ports are published. Agent and transport
are non-root, read-only, drop capabilities and deny privilege escalation. The agent
mounts only its bundle, own configuration and public certificate authority; it
receives no provider, database, member, private TLS key or Docker credentials.
The test controller is deliberately privileged inside the trusted transport
container; it is not an agent tool or production administration interface.

The fixture uses the reviewed committed FetchSandbox source preparation mechanism.
Image construction uses the existing dedicated, bounded 3 GiB builder, which must
be removed before runtime admission. Runtime caps are 512 MiB each for transport
and database, 256 MiB for twin and 128 MiB for agent. The conservative 5 GiB host
capacity prerequisite remains unchanged. This trial runs on an authorized
**disposable private CI runner** because local Docker has about 2.85 GiB and local
disk is constrained. Do not resize Docker, stop other services, use another
project's builder or globally prune resources to make this trial pass.

## Evidence and limitations

The harness writes a sanitized receipt only after every assertion and owned-resource
cleanup succeeds. It fingerprints compiled application inputs, transport/agent/
controller bundles, private fixture source provenance and actual container images.
A failed stage writes no accepted receipt. CI retains the receipt for fourteen days;
that is temporary test evidence, not a long-term enterprise evidence service.

Run only with explicit isolated opt-in, prepared private fixture inputs and a new
absolute output directory:

```sh
LOOPLABS_GATEWAY_BYPASS_PROOF=isolated \
FETCHSANDBOX_BACKEND_PATH=/absolute/prepared-fixture/backend \
node scripts/gateway-bypass-proof.mjs /absolute/new-evidence-directory
```

This passing isolated trial establishes this specific Docker network boundary,
actual application route behavior and private provider-twin readback. It does not
prove customer installation, same-pod sidecar isolation, cloud workload federation,
live provider behavior, production certificate/secret operations, persistent
staging, HA, sustained scale or enterprise readiness. Those remain separate gates.

## Trial corrections retained

The first private run stopped at an incompatible runner archive-client binding;
the corrected run uses the existing dedicated PostgreSQL container client. Later
runs exposed a cleanup error and a transport startup failure. A local disposable
mount diagnostic reproduced Docker refusing to create a nested mountpoint inside
a read-only parent bind. The harness now prepares that empty mountpoint before
starting the transport. These failed runs produced no accepted receipts.

The corrected transport started in run `37958129262`, but enrollment refused
with HTTP503 because the trial had not enrolled the mandatory staging recovery
epoch. The harness now installs the unchanged recovery schema and external epoch;
it also tests mismatch refusal. The application fence is preserved unchanged.

Run `37959550920` passed the full regression gate and reached provider restart
after the network, role, epoch, approval, outage, lost-response and exact two-effect
checks. It refused the harness's repeated completion attempt with HTTP409. The
corrected post-restart check retains that refusal as a required assertion, reads
the completed run and both native effects, and requires one completion event.
No application terminal-state rule was weakened and no failed receipt was accepted.

## Accepted provenance

- Private run: https://github.com/rnagulapalle/sandbox/actions/runs/37960618067
- Private CI commit: `c2bf6faa32d964d3767b182207d44a0cafaf943b`.
- Public base: `46cf28cef76b6643aedacc5c1c1dd52e05826019`.
- Exact reviewed overlay SHA256: `e1de8ea2aff2e59c4c35c3cf1ae9676241c341b121ab9b93776824b41a05cfed`.
- Artifact ID: `11630554414`; archive SHA256: `c03c44513cc5abfa2abcae6f8244c7749a2c28fbcc7808b8083a383f00c36e10`.
- Retained [receipt](evidence/gateway-bypass-proof.json) SHA256: `41091ffd1c58124077c48dfcc5eaff4115b89363809116e00df4f9f8537135c3`.

The receipt has 19 required true assertions, actual image identities and committed
FetchSandbox fixture provenance. The regression test rejects missing/failed checks,
reduced source coverage, changed sources, different rebuilt component bytes and
omitted limitations. It checks consistency and freshness, not a signed attestation.
The authenticated CI result and downloaded artifact digest were independently
checked before retention. Later gates must still pass before application commit,
public push or release; production remains unchanged.
