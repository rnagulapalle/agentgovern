import { readFile, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import { authenticate } from "../lib/durable/service";
import { RefundControl } from "../lib/refunds/service";
import { FetchSandboxStripe } from "../lib/refunds/twin";
import { PAYMENT } from "../lib/refunds/contracts";
async function main() {
  const db = new Pool({ connectionString: process.env.LOOPLABS_DATABASE_URL });
  try {
    const creds = JSON.parse(
      await readFile(".local/durable-credentials.json", "utf8"),
    );
    const scoped = JSON.parse(
      await readFile(".local/refund-agent.json", "utf8"),
    );
    const operator = await authenticate(db, creds.operator),
      agent = await authenticate(db, scoped.token);
    const provider = new FetchSandboxStripe(),
      control = new RefundControl(db, provider);
    await control.configure(operator, { agentActive: true });
    const initial = await control.snapshot(operator);
    if (initial.policy.auto_limit !== 1000)
      await control.configure(operator, { autoLimit: 1000 });
    const start = (await provider.refunds()).length;
    const p = {
      actionId: randomUUID(),
      agentId: "refund-agent",
      paymentId: PAYMENT,
      amount: 500,
      currency: "usd",
    };
    const a = await control.propose(agent, p);
    if (a.state !== "ready") throw new Error("Small refund must be ready.");
    await control.propose(agent, p);
    const lost = await control.execute(operator, a.id, true);
    if (lost.state !== "uncertain")
      throw new Error("Lost response must remain uncertain.");
    const resolved = await control.reconcile(operator, a.id);
    if (resolved.state !== "succeeded")
      throw new Error("Provider must verify the existing refund.");
    const original = resolved.provider_id;
    const replay = await provider.create(resolved, false);
    if (replay.id !== original)
      throw new Error(
        "Provider idempotency did not return the original refund.",
      );
    const afterReplay = await provider.refunds();
    if (afterReplay.length !== start + 1)
      throw new Error("Lost response/replay caused duplicate refunds.");
    let changedDenied = false;
    try {
      await provider.create({ ...resolved, amount: 600 }, false);
    } catch {
      changedDenied = true;
    }
    if (!changedDenied)
      throw new Error(
        "Changed payload with same idempotency key must conflict.",
      );
    const held = await control.propose(agent, {
      ...p,
      actionId: randomUUID(),
      amount: 2500,
    });
    if (held.state !== "held") throw new Error("Large refund must be held.");
    await control.review(operator, held.id, held.payload_hash, true);
    const success = await control.execute(operator, held.id);
    if (success.state !== "succeeded")
      throw new Error("Approved refund must succeed.");
    const blocked = await control.propose(agent, {
      ...p,
      actionId: randomUUID(),
      amount: 15000,
    });
    if (blocked.state !== "blocked")
      throw new Error("Over-limit refund must be blocked.");
    const final = await control.snapshot(operator);
    if (final.provider.refunds.length !== start + 2)
      throw new Error("Unexpected number of payment effects.");
    const evidence = {
      at: new Date().toISOString(),
      provider:
        "Local FetchSandbox Stripe engine; controlled fixture, no real money",
      checks: {
        allowed: true,
        exactApproval: true,
        hardLimitBlocked: true,
        agentCredential: true,
        responseLostAfterEffect: true,
        reconciledWithoutRetry: true,
        providerIdempotentReplay: true,
        changedPayloadRejected: true,
      },
      actions: [
        { id: a.id, state: resolved.state, providerId: original },
        { id: held.id, state: success.state, providerId: success.provider_id },
        { id: blocked.id, state: blocked.state },
      ],
      providerRefundsBefore: start,
      providerRefundsAfter: final.provider.refunds.length,
    };
    await writeFile(
      ".local/refund-proof.json",
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 },
    );
    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    await db.end();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : "Refund proof failed.");
  process.exitCode = 1;
});
