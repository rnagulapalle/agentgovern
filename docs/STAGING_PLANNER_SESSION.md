# Temporary planner input for the staging trial

October 8, 2026. This prepares the next assembled typed-chat trial. It does not
change production or establish that the assembled web container can call Bedrock.
The merged HTTPS proof still begins with an API-prepared plan.

The isolated web needs one bounded model permission. Temporal workers, scheduler,
provider twin and database provisioner need none. `staging-planner-inputs.mjs`
creates a separate private `web-planner.env` from an explicitly supplied temporary
STS session. It does not inherit a shell profile or copy the existing long-lived
model key. It rejects other models/regions, ordinary IAM keys, missing session
tokens, malformed values, expired/near-expiry or excessive-lifetime sessions,
symlinks, hard links and group/world-readable input. Output is exclusive, owner-only
and separate from assembled role authority. Repeated preparation cannot replace it.

The input JSON has exactly `model`, `region`, `accessKeyId`, `secretAccessKey`,
`sessionToken` and `expiresAt`. Use `us.amazon.nova-lite-v1:0` in `us-west-2` and a
session with 30 minutes to three hours remaining. **Format checks do not verify IAM
permissions or credential provenance.** Independently review the issuer and
session policy before supplying it to any runner. Use only test request data.

The October 8 local trial issued a two-hour STS federated session using an explicit
session policy copied from the existing bounded planner policy: only
`bedrock:InvokeModel` for the Nova Lite inference profile and its three approved
foundation-model destinations. The privileged issuer remained local. No cloud
credential was uploaded to GitHub. The real application `BedrockPlanner` returned
and validated the expected acknowledgement intent. AWS refused an alternate-model
call; a separate read-only infrastructure call also returned AccessDeniedException.
These are observed checks, not a comprehensive IAM/security audit. The retained
[measured result](evidence/staging-planner-session-proof.json) covers the exact
helper, real-model proof and planner source fingerprints. Its freshness test does
not replace the actual AWS invocation.

Repeat with newly issued reviewed credentials, never the expired session:

```sh
LOOPLABS_STAGING_BOOTSTRAP=isolated pnpm exec tsx \
  scripts/staging-planner-proof.ts /private/session.json /private/new-proof-directory
```

The script validates real model output, requires actual AWS alternate-model
AccessDeniedException, records source fingerprints and writes a sanitized result.
It does not save prompts, model output or credentials in a public artifact. The
private generated environment contains credentials and must stay outside Git.
Remove owned credential inputs after the trial; expiry is not a deletion guarantee.

Before closing the typed-chat acceptance gate, attach this input only to the
assembled **web** role, verify worker/scheduler environments contain no AWS
credentials, then type the request and clarification through the trusted HTTPS UI.
Prove that interpretation saves the exact scoped plan without authorizing actions;
retain separate named approvals, actual effects, crash/replay checks and mobile
reload. Do not replace that journey with a mocked model or prepared fixture.

AWS references:

- [STS session permission intersection](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_control-access_getfederationtoken.html)
- [Temporary session credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp_request.html)
- [Nova invocation](https://docs.aws.amazon.com/nova/latest/userguide/using-invoke-api.html)
