# Invited record onboarding

This phase adds `/control-plane/records` and its authenticated `/api/workspace/records` API to the existing named-member workspace. It manages the migration-12 record enrollment and agent grants already enforced by connector actions and scoped Temporal routing.

## What a member can do

1. View administrator-configured isolated customer records in their own workspace.
2. Enroll a record with a stable request ID. A repeated request returns saved enrollment and does not restore revoked authority.
3. Explicitly grant an existing CRM or messaging agent access. Its named owner, agent token and connector capability must remain active.
4. Revoke or restore record/agent access. A changed authority version refuses stale restoration requests. Restoring access never revives old approvals.
5. Reload and inspect the persisted owner/access state. The mobile page uses the shared workspace layout.

None of these operations creates an action, grants action approval, starts a run, or delivers a real message. The current chat route still uses the prepared sample customer: selecting an enrolled record in chat is a separate integration phase. Do not infer end-to-end arbitrary-record chat support from this permission screen.

## Configuration and trust

The server-only `LOOPLABS_RECORD_CATALOG` is a JSON object with a `records` array using the strict `record-scope-1` contract documented in `SCOPED_RECORD_CONNECTORS.md`. It must match the private twin's configured records. It supports at most 100 isolated `.test` recipients. Browser input accepts only an opaque catalog key and enrollment request ID; no free URL, credentials, recipient or workspace override is accepted. This is test-fixture provisioning, not customer connector onboarding.

Missing migration 12 or a configured hosted connection disables onboarding. Hosted CRM atomic contact-version enforcement is still unavailable. The page neither downgrades nor bypasses it. Configured connection changes fail binding checks before authority changes. Cross-site cookie mutations and unauthenticated requests are denied. Ordinary permission mutation responses and metadata are private and must not be cached.

## Acceptance

The focused PostgreSQL tests exercise duplicate enrollment/grants, cross-workspace and agent denial, destination injection, changed connection binding, inactive hosted support, stale version changes and missing schema. API tests exercise authentication, same-origin/body validation, sanitized failures and no caching. The actual browser proof additionally exercises enrollment, explicit grant/revoke/restore, stale restoration denial, reload and 390px overflow checks without creating actions or workflows. See `docs/evidence/chat-ui-proof.json` and the record-onboarding screenshots after its current-source run completes.

This is a local invited-UX and authority proof. Enterprise acceptance, remote TLS/storage/provider guarantees, sustained independent-tenant capacity and production cutover remain open in `ENTERPRISE_ACCEPTANCE.md`.

## October 8 verification

All ten actual proof suites were rerun from this source, including the updated real-model/browser test with thirteen checks. The browser permission sequence created zero actions and zero workflows. Packaged record routing still completed nine approved customer workflows with exactly eighteen intended effects and zero effects for the revoked tenth record. `pnpm quality` passed all 348 tests in 48 files, coverage thresholds, worker bundles, production build and 52 rendered internal destinations. Global coverage: 97.43% statements, 95.74% branches, 99.48% functions and 98.22% lines. No production deployment was performed by this phase.
