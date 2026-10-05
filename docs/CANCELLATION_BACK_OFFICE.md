# Cancellation back office — bounded implementation

October 5, 2026. Private route: `/control-plane/back-office`.

Describe → review → test with a second person → enable the tested plan.
This is a **template compiler for one cancellation process**, not an LLM or
arbitrary natural-language workflow builder. Only the displayed five instructions
are supported; the refund ceiling is configurable from $1 to $100. Unknown,
missing, duplicated or contradictory instructions fail closed. Raw prompts are
not stored; the compiled immutable plan is saved instead.

## What the process does

1. Save a cancellation with an immutable case ID, exact amount, prepared payment,
   fixed sample recipient, plan digest and current refund-policy version.
2. Require a different active operator to approve that payload for 15 minutes.
3. Cancel the prepared order using its observed version; verify the cancellation.
4. Reuse the existing RefundControl admission, budget reservation, exact approval,
   execution lease, Stripe twin idempotency and effect reconciliation.
5. Release the confirmation only after a matching successful refund is observed.
6. Submit a factual confirmation to the FetchSandbox Resend engine, with stable
   case evidence, then read back acceptance. Acceptance does not establish inbox
   delivery or bank settlement.
7. Enable the exact plan only after one case for that plan completes.

A case's payment step must be released by its named approver. Even standalone
refund API entry points recheck the owning case's approval and permitted state.
No agent credential can approve, advance or inspect this back office. Invited
member sessions and existing operator credentials retain their existing scope.

## State and failure behavior

PostgreSQL migration 6 adds plans, cases and protected append-only transition
events. Applied migrations 1–5 are unchanged. Workspace-row transactions serialize
claims; a 30-second persisted lease precedes each outbound operation. Network
calls do not hold the case transaction. A second concurrent advance gets the
existing in-flight state and cannot dispatch again. Authority is rechecked after
source lookup and before a write.

Lost responses are resolved by read-back, not another write. Pending, absent,
conflicting or unavailable refund evidence holds email. Fulfilled or unverifiable
orders hold refund. Failed or uncertain email acceptance stays contained; this
version has **no automated email retry**. Approval expiry/revocation or changed
policy denies new effects. A crash leaves an inspectable lease; inspection is
refused while another operation's lease is live.

## Provider scope and important limits

- Orders are a bounded LoopLabs fixture, not Shopify or any live order API.
  A new case creates a prepared sample order with the same case ID.
- All cases share the dedicated `ch_looplabs_refund_demo` test payment. This is
  not multi-order accounting, customer matching or duplicate-order detection.
- Payments use the existing private FetchSandbox Stripe engine on port 8017.
- Email uses the actual FetchSandbox Resend engine on port 8019, behind a bounded
  sample payload and persisted fixture receipts. No real email is delivered.
- Fixture snapshots are single-process local files; production connector HA,
  distributed dispatch guarantees and performance are unestablished.
- UI runs one step at a time. There is no unattended scheduler, customer intake,
  signed incoming webhook, policy document extraction, arbitrary connector
  onboarding, customer consent exchange, model execution or live deployment.
- A completed twin test permits enabling further **sample cases only**. It is not
  certification or proof that a business policy is correct.
- Reconciliation proves observed effects; it does not promise exactly-once
  delivery across arbitrary providers. No irreversible refund is rolled back.

## Local setup and validation

First provision the existing durable/refund/workspace setup. Then:

```sh
pnpm backoffice:setup
pnpm refund:twin       # terminal 1
pnpm backoffice:twin   # terminal 2
pnpm dev              # terminal 3 (or an unused port)
pnpm backoffice:proof
pnpm quality
```

Setup applies migration 6 with a digest check, grants restricted runtime-table
permissions, and saves private fixture credentials in ignored local storage.
It does not provision an internet-accessible provider or deploy production.

The proof uses the existing two invited founder accounts without printing their
passwords. It creates an exact plan, refuses self-approval and premature enabling,
replays case creation, loses all three outbound responses, verifies the order
before refund, reads back payment before email, and confirms one additional
refund despite replay. Sanitized results: `docs/evidence/backoffice-proof.json`.
The PostgreSQL tests cover pending refunds, expired/revoked approval, changed
policy, fulfilled order, unavailable providers, conflicting email, in-flight
replay, stale leases and standalone refund bypass attempts.

For manual review: sign in locally, choose Cancellation back office, review a
draft, create a $20 case as Raj, sign out and sign in as Pratibha, approve the exact
case, then run each step. Try Test lost response and inspect the resulting state.
After a completed case, enable that plan. Reload to confirm saved state.
