# Actual Docker inspection fixture trial

Actual isolated run `38082845227` completed successfully on October 10, 2026.
Its raw receipt is retained in `docs/evidence/persistent-docker-inspection-proof.json`;
root independently authenticated terminal run/job/artifact metadata, checked the
archive digest and both current source hashes, and verified six observations
plus owned cleanup. This is fixture observation evidence, not platform activation.
Run only on an explicitly allocated Linux/AMD64 GitHub Actions worker:

```sh
LOOPLABS_DOCKER_INSPECTION_PROOF=isolated-fixture node scripts/persistent-docker-inspection-proof.mjs
```

The script additionally requires actual `GITHUB_ACTIONS=true`. This admission
condition limits intended use; environment variables are not accepted-artifact
provenance or a security boundary against the host owner.

It pulls the official `alpine:3.20` fixture tag, resolves its actual immutable image
ID and repository digest before creating containers, and retains those identities
in its receipt. The mutable selection tag is deliberately a disposable fixture
choice, not an accepted LoopLabs runtime dependency or supply-chain attestation.
The pulled image is preserved; no shared image/cache cleanup or daemon restart is
performed.

Eight lightweight containers receive distinct exact IDs and owned project/service
labels, a read-only root/volume, memory/PID bounds, no published ports,
capabilities dropped, no-new-privileges and a private internal network. This is
not the eight-role application platform: all roles run the same tiny fixture.
The unchanged read-only inspection helper must observe all eight actually running
and healthy and retain their security/mount/network configuration.

The trial validates refusal cases derived from actual measured inspect data.
Wrong expected IDs/images, missing/extra inventory and foreign project/service
labels are deliberate alterations of the measured input, not evidence of an
actual adversarial tenant. It also attaches an owned extra network to one real
owned container, verifies that the configuration changes while seven other
observations remain unchanged, detaches it, and stops that container to verify
`running:false`. Detachment restores the attachment set; it does not claim Docker
restored identical IP or endpoint bytes.

Cleanup checks ownership before removing only this trial's containers, volume
and networks and verifies no matching project resources remain. Partial command
failures are contained through attempted-resource ownership checks; unavailable
inspection or cleanup prevents a success receipt. Docker commands and inspection
output are bounded; raw output, environment secrets and stderr are suppressed.

The measured receipt includes module/proof source hashes and actual fixture
image identities, validated GitHub run/head metadata and `productionChanged:false`, while explicitly retaining `activationEstablished:false`,
`acceptedProvenanceEstablished:false` and `enterpriseSlaEstablished:false`.
It cannot establish transport credential rotation, namespace authorization,
workflow authority retention, accepted platform readiness or persistent staging.
The accompanying guard tests do not establish that this actual Docker trial ran.
