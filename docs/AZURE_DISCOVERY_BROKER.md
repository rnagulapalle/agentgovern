# Reviewed Azure discovery broker candidate

This candidate extends the existing project scan service, membership/recovery
checks and inventory persistence. It adds no execution engine, approval bypass or
cloud-agent enrollment. Production and native Azure access remain unverified.

An administrator provisions an explicit private JSON file selected by server-only
`LOOPLABS_AZURE_DISCOVERY_BINDING_FILE`. It contains exactly `scope`, `executable`
and `configDirectory`. Scope must match the saved Azure tenant/connection,
Microsoft directory ID and Foundry project endpoint. No token, executable or
configuration path is accepted from browser requests.

The file uses the existing private reader. The executable must be a regular,
current-owner executable without group/other write permission; the config directory
must be a current-owner directory without group/other permission. Final symlinks
are refused. Administrator review must cover the installed CLI and configuration,
including ancestors and cache contents; these filesystem checks do not sandbox
an untrusted executable. Symlink-based installations need an explicitly reviewed
real executable path. No automatic installation or account creation occurs.

Readiness validates only local configuration. Each native operation rereads the
binding, refuses changed scope/executable/configuration paths and invokes the
reviewed Azure CLI with a fresh bounded process. It verifies AzureCloud's selected
authority/management endpoints, then requests the exact Foundry audience and
reviewed directory. The child inherits no parent secrets, proxy, planner credentials
or ambient home configuration. No shell is invoked. JSON output is limited to64KiB;
processes are killed on cancellation and errors/stderr are sanitized. The adapter's
shared15-second deadline includes both commands and its native request.

The broker checks the CLI's returned directory, Bearer type and UTC `expires_on`
against the supported short-lived-session contract. It never decodes opaque API
access tokens. CLI managed-identity and Cloud Shell modes do not support explicit
`--tenant` and must refuse; no fallback omits the directory. Sovereign/custom clouds
are unsupported. Authentication/token refresh may update the administrator's
explicit CLI cache; no agent or business-system mutation is performed.

A successful fixed Foundry GET proves access to that endpoint. Directory association
is supplied by the trusted supported broker, not an API-returned directory check.
It proves neither workload principal nor effective tool permissions. Discovery
still cannot authorize actions. Owner mapping, workload attestation, mandatory
network enforcement and actual cloud acceptance remain separate requirements.

Tests run temporary executable fixtures and controlled native-shaped HTTP. They
cover fixed directory/audience, isolated environment, readiness without acquisition,
changed/malformed bindings, wrong directory/type/expiry, custom clouds, oversized
output, aborts and stalled processes. These are process/HTTP contract tests, not an
actual Azure login or live Foundry compatibility test. Full regression, dedicated
PostgreSQL and browser/gateway proof must pass before commit. Nothing is deployed
or enterprise-ready merely because the binding is configured.

Sources: [Azure CLI token contract](https://learn.microsoft.com/en-us/cli/azure/account?view=azure-cli-latest#az-account-get-access-token),
[Azure CLI authentication](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli?view=azure-cli-latest),
[opaque token client guidance](https://learn.microsoft.com/en-us/entra/identity-platform/claims-validation).
