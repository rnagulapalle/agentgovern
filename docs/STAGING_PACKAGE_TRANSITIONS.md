# Pending-work application package transitions

Implementation under validation. No actual promotion/reversion acceptance yet;
production remains on its existing runner.

The next disposable trial will cold-load the two independently retrieved private
release artifacts from runs `37877500571` and `37881876443`. Their web and worker
image IDs differ, but their content-bound acknowledgement worker build is the same.
Both GitHub artifacts were observed unexpired on October 9 UTC. Seven-day
availability remains a temporary retention policy, not a production registry.

`scripts/staging-package-transition.mjs` implements the application switch used by
that forthcoming trial. Its caller must first verify successful origin/artifact
provenance, the externally retained manifest digest, archive bytes and the exact
loaded image identities. The switch rechecks the target images and packaged worker
build. It refuses different worker builds; semantic workflow upgrades require
separate compatibility/replay acceptance.

Only the owned disposable project's web, worker and scheduler containers can be
replaced. All three must actually stop first. The database, Temporal, public-key
authorization and provider containers must retain their identities and configuration.
Runtime environments, mounted state, commands and hardening must remain unchanged.
The switch does not apply schemas, restore archives, enroll authority, approve
actions, change dispatch ownership or reset reservations. It does not switch the
offline provisioner or provider package. Those roles need separate acceptance.

Pending-state verification is a required callback before stopping, after stopping,
and after healthy replacement. Command tests exercise the callback and failure
containment; they do not prove database authority or provider effects. The actual
trial still has to bind that callback to independently read saved plans, action
IDs/payload hashes, held approvals, policy/grant versions, pinned routes, Temporal
ownership and provider state. It must also verify the same saved work through the
authenticated interface after promotion and reversion, then independently approve
and finish it without duplicate effects. Existing crash, lost-response, replay,
restore and typed-browser checks remain required.

On a failed transition, the helper attempts to stop all application writers and
verifies that they are stopped. It propagates failed containment. It never
automatically resumes old code, returns a success receipt or rewinds business state.
Caller configuration is copied and frozen; the new selection is returned only
after all postconditions pass.

Six focused tests cover both transition directions, malformed/no-op/stale input,
foreign containers, wrong loaded images/builds, failed stops/startup/health,
configuration and retained-container drift, failed pending checks and failed
containment. The unchanged full repository quality gate passed 441 tests and
52 rendered destinations with this implementation. Real retained-image acceptance,
exact-head release checks and public merge are still outstanding for this phase.

This work does not establish persistent staging, an operational rollback policy,
long-term history/image retention, live-provider safety, high availability, an
enterprise production SLA or Temporal superiority.
