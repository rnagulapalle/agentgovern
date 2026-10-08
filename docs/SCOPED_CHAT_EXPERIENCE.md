# Selected customer record → approved durable acknowledgement

October 8, 2026. Isolated local application proof; production is not cut over.

The invited Work with agents page can now select an already enrolled private test customer record, interpret a typed acknowledgement request, save its exact plan, choose existing agents with explicit record access, and submit held actions to the compatible durable runner. It still supports only the fixed two-step CRM/acknowledgement graph. This does not create arbitrary workflows, import arbitrary agents, monitor an inbox or connect a real customer's CRM/email.

## Stakeholder journey

1. Sign in as an invited named member. Register a CRM agent and a messaging agent with active accountable owners and allowed action limits.
2. In Records and access, enroll an administrator-configured test record and explicitly grant each agent access.
3. In Work with agents, select that record and type: “Check the CRM record for alice@example.test, prepare an acknowledgement, and ask me before sending. Rehearse it with FetchSandbox first.” Use the selected record's actual test address.
4. Inspect the matched record, retained lifecycle, exact recipient, subject and message. Missing or conflicting recipients are clarified; the model cannot supply connector URLs, credentials, grants, approvals or arbitrary action payloads.
5. Select the explicitly granted agents, confirm exact review, and submit for independent approval. This saves held actions and an immutable content-bound Temporal route. It grants no action approval and creates no provider effect.
6. A different invited member opens the saved enquiry and approves each exact action. CRM readback must verify before the acknowledgement can dispatch.
7. Follow saved progress and its observed effect receipt. Reload preserves the same record, recipient and run. The background engine continues without an open browser.

If submission is interrupted, reopen the saved work and use Confirm saved submission. The server resumes existing immutable agents/action IDs and scheduling intent. It never duplicates reservations or grants approval. Already completed/paused/revoked work is not resumed into new authority.

## Server authority

All saved plan/run/action API contexts resolve the enrolled destination from server-owned metadata under the authenticated workspace. A supplied selection cannot retarget existing work or adopt a default sample connector. Missing or inconsistent scoped metadata and changed connector binding fail closed. Independent approvers do not need a client-supplied destination. Standalone legacy sample operations retain their original path.

The acknowledgement card displays the message body stored with its exact action. It no longer substitutes today's sample template for a historical recipient. Missing saved content disables message approval in the interface; server-side request/approval checks remain authoritative.

Scoped submission requires migration 13, active versioned scope/grants, named owners and a compatible content-bound build configured by the operator. The scoped UI API rejects weaker legacy start/rehearsal shortcuts. Owner, policy, source version, action hashes, grants, dependencies and effects remain rechecked by the existing control services. Restored authority is quarantined through the recovery contract; permissions are not pinned by workflow versioning.

Runtime web settings: `LOOPLABS_RECORD_CATALOG`, `LOOPLABS_TEMPORAL_WORKSPACE=staging`, and `LOOPLABS_TEMPORAL_RECORD_BUILD_ID` matching the verified deployed worker manifest. Compose and release-candidate settings forward these server values without enabling them by default. Local Compose rendering was checked both configured and disabled. The operator must provision migrations, matching isolated twin records, authenticated workload, Temporal namespace and compatible worker/scheduler before enabling this path. Configuration alone is not a health or enterprise-readiness signal. Real hosted CRM atomic contact-version enforcement remains unavailable.

## Proof and limitations

The real-model/browser harness selects two enrolled records, saves exact plans from typed requests, submits both through the invited API using existing grants, denies another-record retargeting and self-approval, and repeats submission without duplicating actions. Actual packaged worker/scheduler processes receive pinned routes; both actions remain held without effects before approval. Confirmed worker SIGKILL and a real app restart preserve the saved work. Independent named approvals produce exactly one CRM and one email effect per intended record. A deliberately lost CRM HTTP response reconciles through readback; completed histories replay and reload without extra effects. Mobile checks include no horizontal overflow and progress text at least 16px.

This is a bounded local proof, not independent tenant security acceptance, sustained capacity, remote TLS/HA operations, a production SLA, real delivery or Temporal superiority. `ENTERPRISE_ACCEPTANCE.md` retains those gates. Production deployment remains separate and must use `./deploy.sh` from clean pushed main after all release checks.

Validation: all ten actual proof suites were refreshed, including hosted refusal, packaged workers, restore, versioning and real-model/browser checks. The final browser run also checks completed-run scheduling copy does not falsely say approval is still pending. `pnpm quality` passed 353 tests in 49 files, coverage gates, types, lint, production build and 52 rendered internal-link checks. Source fingerprints in the checked-in evidence reject stale proof.
