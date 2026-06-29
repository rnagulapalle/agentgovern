import { describe, it, expect } from "vitest";
import { evaluate } from "./evaluate";
import { SDR_AGENT_17 } from "./registry";
import type { ActionRequest, EvalContext } from "./types";

const NOW = "2026-06-28T23:41:00Z";
const FRESH = "2026-06-26T23:41:00Z"; // 2 days old
const STALE = "2026-05-20T23:41:00Z"; // ~39 days old

const ctx: EvalContext = { agent: SDR_AGENT_17, now: NOW };

function emailReq(over: Partial<ActionRequest> = {}): ActionRequest {
  return {
    id: "act_email_1",
    agentId: "SDR-Agent-17",
    capability: "email.send",
    tool: "Gmail",
    summary: "Send follow-up email",
    target: "john@acme.com",
    params: { discountPct: 10 },
    sourceRecord: { id: "hubspot/contact/8842", system: "HubSpot", lastSyncedAt: FRESH },
    at: NOW,
    ...over,
  };
}

describe("execution policy engine", () => {
  it("ALLOWS a within-authority email with fresh source", () => {
    const r = evaluate(emailReq({ params: { discountPct: 10 } }), ctx);
    expect(r.decision).toBe("allow");
    expect(r.receipt.evidenceComplete).toBe(true);
    expect(r.receipt.evidence.freshnessOk).toBe(true);
  });

  it("REQUIRES APPROVAL when discount exceeds delegated authority", () => {
    const r = evaluate(emailReq({ params: { discountPct: 25 } }), ctx);
    expect(r.decision).toBe("require_approval");
    expect(r.checks.find((c) => c.id === "discount")?.status).toBe("approval");
    expect(r.riskScore).toBeGreaterThan(evaluate(emailReq(), ctx).riskScore);
  });

  it("BLOCKS on stale source-of-truth (the root-cause guard)", () => {
    const r = evaluate(
      emailReq({
        params: { discountPct: 10 },
        sourceRecord: { id: "hubspot/contact/8842", system: "HubSpot", lastSyncedAt: STALE },
      }),
      ctx
    );
    expect(r.decision).toBe("block");
    expect(r.receipt.evidence.freshnessOk).toBe(false);
    expect(r.blockingReasons.join(" ")).toMatch(/stale/i);
  });

  it("BLOCKS when required evidence is missing (hard failure, not a warning)", () => {
    const r = evaluate(emailReq({ sourceRecord: undefined, target: undefined }), ctx);
    expect(r.decision).toBe("block");
    expect(r.receipt.evidenceComplete).toBe(false);
  });

  it("BLOCKS a restricted tool", () => {
    const r = evaluate(
      emailReq({ capability: "email.send", tool: "Stripe" }),
      ctx
    );
    expect(r.decision).toBe("block");
    expect(r.checks.find((c) => c.id === "tool")?.status).toBe("fail");
  });

  it("BLOCKS a capability the agent does not have", () => {
    const r = evaluate(
      emailReq({ capability: "payment.refund", tool: "Stripe" }),
      ctx
    );
    expect(r.decision).toBe("block");
  });

  it("is DETERMINISTIC — same input, identical receipt hash", () => {
    const a = evaluate(emailReq({ params: { discountPct: 25 } }), ctx);
    const b = evaluate(emailReq({ params: { discountPct: 25 } }), ctx);
    expect(a.receipt.evidenceHash).toBe(b.receipt.evidenceHash);
    expect(a.receipt.signature).toBe(b.receipt.signature);
  });

  it("produces a signed, immutable receipt for every decision", () => {
    const r = evaluate(emailReq(), ctx);
    expect(r.receipt.evidenceHash).toMatch(/^0x[0-9a-f]{16}$/);
    expect(r.receipt.signature).toMatch(/^ed25519:/);
    expect(r.receipt.id).toMatch(/^rcpt_/);
  });

  it("enforces per-run blast radius", () => {
    const r = evaluate(emailReq(), {
      ...ctx,
      budget: { maxSpendUsd: 0, spentUsd: 0, maxActions: 0, actionCount: 0 },
    });
    expect(r.decision).toBe("block");
    expect(r.checks.find((c) => c.id === "blast-radius")?.status).toBe("fail");
  });
});
