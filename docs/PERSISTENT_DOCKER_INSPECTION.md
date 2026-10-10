# Owned Docker inspection boundary

October 10, 2026. A standalone read-only helper is implemented in
`scripts/persistent-docker-inspection.mjs`. Its injected command/inspection tests
are separate from actual Linux fixture run `38082845227`, whose raw receipt was
independently verified against both measured sources and authenticated CI origin.
That run proves observation and cleanup of eight lightweight test containers,
including an actual added network and stopped container. Accepted platform
provenance, installation admission and transport replacement remain unsupported.

`inspectOwnedPersistentDocker({project, containers, images})` accepts precisely
the eight activation roles with independently supplied full container IDs and
pinned image IDs. It runs only `docker inspect <eight exact IDs>` through
`execFile`, without a shell, discovery, start, stop, prune or automatic retry.
Execution is bounded to ten seconds and two MiB. It checks exact project/service
labels, role inventory, distinct container IDs and actual image identity. Errors
are sanitized; returned configuration is private internal data and must never
be logged because environment fields contain credentials.

`normalizeOwnedDockerInspection(inspectJSON, identity)` returns the existing
activation observation shape. It sorts object/environment keys and mounts by
unique destination while retaining command/entrypoint order and complete mount
objects. Ambiguous duplicate environment keys, malformed/non-JSON data,
accessors, hidden fields, invalid resource/isolation fields, wrong ownership and
missing/extra/duplicate containers refuse. Absent/starting/unhealthy container
health never becomes healthy.

The configuration retains every `HostConfig` field and every remaining `Config`
field under `host.hostConfig` and `host.dockerConfig`, plus the complete actual
`NetworkSettings` under `host.networkSettings`. Extra network attachments are
therefore observable even when `HostConfig.NetworkMode` remains unchanged. In particular it does not
discard ports, capabilities, security options, network configuration, image
metadata, working directory, labels or future JSON configuration fields. It
preserves mounts including source, permission and propagation. Equality checks
can therefore detect a change beyond the allowed transport JWT.

The helper does not trust supplied identity as release provenance: those expected
IDs must still come from the independently authenticated accepted-artifact and
installation verifier. A correct label or matching digest alone is insufficient.
It neither computes workflow authority checkpoints nor probes namespace RPCs.

The future prepared-configuration adapter must normalize resolved configuration
plus inherited image defaults to this same complete shape, and independently hash
private generation files. Compose-generated configuration-hash labels can change
when environment inputs change; network IPs and endpoint IDs may also change
when a poller is recreated. This helper intentionally retains that change;
activation's environment-only invariant may therefore refuse it. Do not silently
drop these labels or weaken the primitive to claim a successful replacement.
Review any explicit metadata treatment separately and measure actual Linux
replacement, six retained roles, namespace success/foreign denial and unchanged
workflow authority before recording lifecycle acceptance.
