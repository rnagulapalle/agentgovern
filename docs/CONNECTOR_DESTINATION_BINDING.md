# Frozen connector destinations

Before independent-record or multi-tenant execution, an exact-action approval must
also identify the connector destination. The existing source-version guard protects
one CRM record against concurrent changes; it does not establish which provider
instance a later worker will use.

New saved enquiry plans contain a server-created `connectorBinding` fingerprint.
New action payloads contain that fingerprint as `binding`, inside their existing
approval hash. Public proposals cannot supply it. Preparing a plan, starting a run
and proposing both CRM and messaging steps recheck the current binding. Independent
approval and dispatch require the saved action binding to match the current provider.
A same-ID replay retains its original payload and hash; it never silently rebinds.

Both actual adapters enforce the binding immediately before writing or inspecting.
The controller also rechecks after a write/readback. A destination change before
approval or dispatch cancels the action. A change during an in-flight request or
verification leaves uncertainty and does not resend. Revocation still cannot recall
an effect already sent. Restore the original configured destination and obtain
readback to investigate; a different destination cannot verify the old action.
No binder can automatically authorize a new destination.

## Identity and rotation

The private adapter fingerprint includes its fixed workspace, contract, sample
record/recipient and a digest involving its high-entropy fixture credential. The
credential itself is never saved in the plan or action. The two existing strictly
allowed loopback/Docker aliases address the same private fixture and canonicalize
to one identity. Arbitrary addresses remain refused. A different private fixture
credential represents a different isolated instance and invalidates prior authority.

The hosted adapter fingerprint includes origin, workspace, contact ID, CRM/email
sandbox IDs and the fixed recipient. Rotating access credentials within those same
sandboxes does not change their identity. Changing sandbox, contact or origin does.
Hosted CRM still refuses writes without atomic source-version enforcement. This
change does not remove that blocker or establish live provider delivery.

The fingerprint is a binding/checksum in trusted application state, **not** a
signature, independent certificate or defense against a database owner rewriting
all authority/evidence. Approved database fields still require further immutable
storage/least-privilege acceptance and independent security review.

## Upgrade boundary

Old plans/actions without destination metadata do not acquire it automatically.
They cannot start new execution under the new adapters. Prepare new work and obtain
fresh independent approvals. Completed history remains readable; verification of
an old unbound action stays uncertain until an operator establishes its original
destination through a reviewed recovery procedure. This change is not deployed to
production, and no existing approvals or stored payloads are rewritten by migration.
The production cutover must account for older pending runs explicitly.

## Evidence and next gate

Focused tests use real dedicated PostgreSQL for preparation, exact approval,
replays, changes during source lookup and in-flight containment. Adapter tests
prove refusal before HTTP, credential rotation and canonical private aliases.
The actual `connectors:proof` additionally changes the configured private instance
of an approved action, preserves its original ID/hash on replay, observes dispatch
cancellation and confirms the provider effect journal is unchanged.

The existing actual HTTP, Temporal, archive restore and browser proof suites are
rerun for this execution-boundary change. Their evidence remains local prototype
proof. This phase does **not** implement multiple customer records, arbitrary
recipients, an arbitrary workflow builder or multi-tenant capacity. Those next
features must put record/recipient scope into the approved plan, preserve per-record
atomic version enforcement and use separate tenant-bound provider instances before
sustained approved load can be measured.
