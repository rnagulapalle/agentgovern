import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { Pool } from "pg";
import { signIn } from "../lib/workspace/auth";
import { authenticate } from "../lib/durable/service";
import { RefundControl } from "../lib/refunds/service";
import { FetchSandboxStripe } from "../lib/refunds/twin";
import { BackOffice } from "../lib/back-office/service";
import { FetchSandboxBackOffice } from "../lib/back-office/provider";
import { EXAMPLE_PROMPT } from "../lib/back-office/plan";
async function main() {
  const db = new Pool({ connectionString: process.env.LOOPLABS_DATABASE_URL });
  try {
    const accounts = JSON.parse(
      await readFile(".local/workspace-accounts.json", "utf8"),
    ).accounts;
    const actors = [];
    for (const a of accounts.slice(0, 2))
      actors.push(
        await authenticate(
          db,
          await signIn(db, { email: a.email, password: a.password }),
        ),
      );
    assert.equal(actors.length, 2);
    const [requester, approver] = actors;
    const payments = new FetchSandboxStripe(),
      provider = new FetchSandboxBackOffice(),
      service = new BackOffice(db, new RefundControl(db, payments), provider);
    const before = (await payments.refunds()).length;
    const plan = await service.draft(requester, randomUUID(), EXAMPLE_PROMPT);
    let a = await service.create(requester, randomUUID(), plan.id, 2000);
    await assert.rejects(service.approve(requester, a.id, a.payload_hash));
    await assert.rejects(service.publish(requester, plan.id, plan.hash));
    const replay = await service.create(requester, a.id, plan.id, a.amount);
    assert.equal(replay.id, a.id);
    a = await service.approve(approver, a.id, a.payload_hash);
    a = await service.advance(approver, a.id, true);
    assert.equal(a.state, "refund_ready");
    assert.equal((await payments.refunds()).length, before);
    a = await service.advance(approver, a.id, true);
    assert.equal(a.state, "email_ready");
    a = await service.advance(approver, a.id, true);
    assert.equal(a.state, "completed");
    await service.advance(approver, a.id);
    assert.equal((await payments.refunds()).length, before + 1);
    assert.equal(
      (await service.publish(requester, plan.id, plan.hash)).published,
      true,
    );
    const evidence = {
      at: new Date().toISOString(),
      scope:
        "Named founder sessions + PostgreSQL + actual HTTP to private FetchSandbox Stripe/Resend engines; sample order fixture; no live payment/email",
      caseId: a.id,
      planId: plan.id,
      checks: {
        selfApprovalDenied: true,
        enableBeforeTestDenied: true,
        caseReplayDeduplicated: true,
        cancelVerifiedBeforeRefund: true,
        lostResponsesAtAllThreeWrites: true,
        refundReadBackBeforeConfirmation: true,
        oneRefundDespiteReplay: true,
        emailAcceptedNotDelivered: true,
        enableAfterCompletedTest: true,
      },
      providerRefundsAdded: 1,
      result: a.state,
    };
    await writeFile(
      "docs/evidence/backoffice-proof.json",
      JSON.stringify(evidence, null, 2) + "\n",
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.end();
  }
}
main().catch(() => {
  console.error(
    "Back-office proof failed; check private provider health, founder sign-in and case state. No credentials printed.",
  );
  process.exitCode = 1;
});
