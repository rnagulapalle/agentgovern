# Bounded control demo web release

`./deploy.sh --profile control-demo` updates the existing new-host web service to
`isolated-control-demo-1`. It preserves the installed database, provider fixtures,
quote authority, background workers, member credentials, existing effects, DNS,
TLS and proxy addresses. This profile exposes Quotes, Agents, Actions, Workflow
runs and saved discount history behind existing named-member authentication.
It does not enable the unrelated cloud-discovery, refund or arbitrary workflow
surfaces and does not certify general enterprise release eligibility.

The entry requires clean `main` exactly matching `origin/main`, runs full
`pnpm quality`, rechecks source and remote state, archives that exact commit and
builds a Linux amd64 web image on the existing host. Immutable build/source
receipts bind the commit, source hashes and image. The default release path and
its separate staging eligibility requirement are unchanged; the existing
`quote-demo` installation path is also unchanged. Do not use the quote installer
to update this already populated database.

Activation takes the same exclusive directory lock as Temporal credential
renewal. It reads the current renewal generation, preserves every other service
container and image, and changes only the web image and deployment profile.
Existing web credentials, mounts, network IDs, private IPs and ports must match
before and after. The previous web selection and authority source hashes are
verified before switching. Failed activation restores the previous web image
and profile and verifies it. If rollback cannot be verified, the shared lock is
retained for operator inspection; a later process must not steal it.

Postactivation checks observe canonical HTTPS, anonymous API rejection,
named-member gates on the newly enabled pages, continued denial of unrelated
APIs, public footer destinations, and existing installed quote/member authority.
The private activation receipt records the source diff and these narrow checks.
It explicitly does not establish named-member workflow execution or acceptance.

The pricing script additionally needs its controlled sample record and separate
15/50 discount rules, agents enrolled through the existing product flow, and the
private CRM/email fixture. Never change the quote pricing policy or manager grants
to fit this script. Complete browser proof with two independent member sessions,
lost-response verification, CRM-before-email dependency, history export and scoped
containment remains required before declaring the recorded demo complete.
