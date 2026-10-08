# Two-company API and execution boundary

October 8, 2026. Local acceptance evidence; not an independent security audit or deployed tenant guarantee.

`pnpm workspace:tenant-proof` starts the real built Next application against a dedicated temporary PostgreSQL schema and the real private HTTP twin. Two companies enroll different customers with identical CRM/email agent IDs and separate member, reviewer, agent and worker credentials. The harness uses authenticated HTTP requests rather than direct route mocks.

Each company sees only its configured catalog, enrollment and saved plans. Sixty-four hostile cross-company reads and approval, execution, reconciliation, pause, submission and grant requests return 403/404 without leaking the other recipient or saved hash. The action-state snapshot remains unchanged and there are no effects. Cross-company record-aware activity routing is also refused.

Two separate real Chromium contexts now sign in through the visible form. Each renders only its company record. Eight additional cross-company API and hostile-Origin approval attempts fail; the session cookie is HttpOnly/Strict and unavailable to page scripts. Expiring each stored session removes API access without effects. This is local HTTP, so the cookie Secure flag under remote HTTPS is not established by this run.

Each company's own independent reviewer then approves its exact actions through HTTP. The production record-aware activity function runs against the actual twin; two CRM and two email effects target only the intended records and recipients. Repeating completed activity calls creates no additional effects. This is activity-boundary testing, not a new packaged-worker or Temporal replay proof; those remain covered by the separate existing suites.

The harness never uses production data, modifies applied migrations, changes release ownership or enables customer integrations. Source-fingerprinted evidence is in `docs/evidence/tenant-isolation-proof.json`. Build the application and worker manifest first. A dedicated `LOOPLABS_TEST_DATABASE_URL`, the FetchSandbox Python runtime, free local ports 3117/8018 and existing dependencies are required. Cleanup confirms process termination and removes its temporary schema/state.

Remaining security acceptance includes broader browser/session attack coverage and remote HTTPS cookie checks, independent review, database runtime-role/row-security coverage, tenant quotas and noisy-neighbor load, secure remote operations, SSO/MFA, and provider-side tenant credentials. The private twin's shared test credential and distinct fixture IDs are not real-provider tenant isolation. Application query scoping is not protection against a database owner or compromised global service credential.
