import { describe, expect, it } from "vitest";
import { ControlError } from "../durable/contracts";
import { validateQuotePlan, type QuotePlanContext, type QuotePlanProposal } from "./plan";

function fixture(): { proposal: QuotePlanProposal; context: QuotePlanContext } {
  const quote = { id: "quote-42", distributorId: "distributor-7", recipient: "distributor@example.test", sourceVersion: "v3",
    currency: "USD" as const, subtotalMinor: 100_000,
    lines: [{ id: "line-1", quantity: 10, unitPriceMinor: 10_000 }] };
  return {
    proposal: { version: "distributor-quote-plan-1", planId: "00000000-0000-4000-8000-000000000001",
      workspaceId: "workspace-1", requester: "requester@example.test", approver: "manager@example.test",
      policyVersion: 3, quote: structuredClone(quote), discountBps: 1400,
      update: { actionId: "00000000-0000-4000-8000-000000000002", agentId: "quote-agent" },
      message: { actionId: "00000000-0000-4000-8000-000000000003", agentId: "message-agent",
        dependsOn: "00000000-0000-4000-8000-000000000002" } },
    context: { workspaceId: "workspace-1", requester: "requester@example.test",
      approvalGrants: [{ member: "manager@example.test", workspaceId: "workspace-1", quoteId: "quote-42",
        policyVersion: 3, active: true, capability: "quote.discount.approve" }], quote: structuredClone(quote),
      policy: { version: 3, delegatedBps: 1000, hardCapBps: 2000, active: true },
      agents: [
        { id: "quote-agent", workspaceId: "workspace-1", active: true, quoteId: "quote-42", action: "quote.update" },
        { id: "message-agent", workspaceId: "workspace-1", active: true, quoteId: "quote-42", action: "quote.message" },
      ],
      provider: { workspaceId: "workspace-1", quoteId: "quote-42", binding: "a".repeat(64),
        contract: "quote-conditional-write-1", atomicSourceVersion: true, actionIdIdempotency: true, effectReadback: true },
      email: { workspaceId: "workspace-1", quoteId: "quote-42", from: "sales@example.test", recipient: "distributor@example.test", actionIdIdempotency: true, effectReadback: true },
    },
  };
}

function change(root: unknown, path: string, value: unknown, remove = false) {
  const keys = path.split(".");
  let object = root as Record<string, unknown>;
  for (const key of keys.slice(0, -1)) object = object[key] as Record<string, unknown>;
  if (remove) delete object[keys.at(-1)!]; else object[keys.at(-1)!] = value;
}

describe("narrow distributor quote proposal boundary (no execution authority)", () => {
  it("holds 14% against 10%, binds exact conditional request and verified quote dependency", () => {
    const { proposal, context } = fixture();
    const plan = validateQuotePlan(proposal, context);
    expect(plan.reason).toBe("above-delegation");
    expect(plan.decision).toBe("independent-review-required");
    expect(plan.totalMinor).toBe(86_000);
    expect(plan.update.request).toEqual({ contract: "quote-conditional-write-1", binding: "a".repeat(64),
      method: "PATCH", resource: "/quotes/quote-42", workspaceId: "workspace-1", sourceVersion: "v3",
      idempotencyKey: proposal.update.actionId, body: { distributorId: "distributor-7", currency: "USD",
        subtotalMinor: 100_000, discountBps: 1400, totalMinor: 86_000 } });
    expect(plan.message.dependency).toEqual({ actionId: proposal.update.actionId, requirement: "verified-matching-quote-effect" });
    expect(plan.message.request.body.to).toEqual([context.email.recipient]);
    expect(plan.message.request.body.text).toContain("USD 860.00");
    expect(plan.update.approvalRequired).toBe(true);
    expect(plan.message.approvalRequired).toBe(true);
    expect(plan).not.toHaveProperty("approved");
  });

  it("does not authorize even a discount within delegation; accepts the hard-cap boundary", () => {
    const { proposal, context } = fixture();
    proposal.discountBps = 1000;
    expect(validateQuotePlan(proposal, context).reason).toBe("named-review-required");
    proposal.discountBps = 2000;
    expect(validateQuotePlan(proposal, context).totalMinor).toBe(80_000);
    proposal.discountBps = 0;
    expect(validateQuotePlan(proposal, context).totalMinor).toBe(100_000);
  });

  it("snapshots all nested content and repeated validation preserves exact proposal IDs", () => {
    const { proposal, context } = fixture();
    const plan = validateQuotePlan(proposal, context);
    expect(validateQuotePlan(proposal, context)).toEqual(plan);
    proposal.quote.lines[0].quantity = 999;
    context.policy.hardCapBps = 9999;
    context.email.recipient = "changed@example.test";
    expect(plan.quote.lines[0].quantity).toBe(10);
    expect(plan.policy.hardCapBps).toBe(2000);
    expect(plan.message.request.body.to).toEqual(["distributor@example.test"]);
    expect(Object.isFrozen(plan.quote.lines[0])).toBe(true);
    expect(Object.isFrozen(plan.message.request.body.to)).toBe(true);
    expect(() => Reflect.set(plan.update.request.body, "totalMinor", 1)).not.toThrow();
    expect(Reflect.set(plan.update.request.body, "totalMinor", 1)).toBe(false);
  });

  const mutations: ["proposal" | "context", string, unknown][] = [
    ["proposal", "version", "other"], ["proposal", "planId", "random"],
    ["proposal", "workspaceId", "workspace-2"], ["proposal", "requester", "other@example.test"],
    ["proposal", "approver", "requester@example.test"], ["proposal", "approver", "unknown@example.test"],
    ["proposal", "approver", "Manager@EXAMPLE.TEST"], ["proposal", "policyVersion", 2],
    ["proposal", "discountBps", 2001], ["proposal", "discountBps", -1],
    ["proposal", "discountBps", 14.5], ["proposal", "discountBps", "1400"],
    ["proposal", "quote.currency", "INR"], ["proposal", "quote.sourceVersion", ""],
    ["proposal", "quote.sourceVersion", "v2"], ["proposal", "quote.id", "other-quote"],
    ["proposal", "quote.id", "../quote"], ["proposal", "quote.distributorId", "other-distributor"],
    ["proposal", "quote.recipient", "other@example.test"],
    ["proposal", "quote.subtotalMinor", 100_001], ["proposal", "quote.lines", []],
    ["proposal", "quote.lines.0.quantity", 0], ["proposal", "quote.lines.0.quantity", 0.5],
    ["proposal", "quote.lines.0.unitPriceMinor", -1], ["proposal", "quote.lines.0.unitPriceMinor", Number.MAX_SAFE_INTEGER + 1],
    ["proposal", "quote.lines.0.extra", "ignored"], ["proposal", "update.actionId", "invalid"],
    ["proposal", "message.actionId", "00000000-0000-4000-8000-000000000002"],
    ["proposal", "update.actionId", "00000000-0000-4000-8000-000000000001"],
    ["proposal", "message.dependsOn", "00000000-0000-4000-8000-000000000003"],
    ["proposal", "update.agentId", "message-agent"], ["proposal", "message.agentId", "quote-agent"],
    ["proposal", "update.request", { method: "DELETE" }], ["proposal", "approved", true],
    ["context", "workspaceId", "other"], ["context", "approvalGrants", []],
    ["context", "approvalGrants", [123]], ["context", "policy.active", false],
    ["context", "approvalGrants.0.member", "other@example.test"],
    ["context", "approvalGrants.0.workspaceId", "other"],
    ["context", "approvalGrants.0.quoteId", "other"],
    ["context", "approvalGrants.0.policyVersion", 2],
    ["context", "approvalGrants.0.active", false],
    ["context", "approvalGrants.0.capability", "quote.message.approve"],
    ["context", "approvalGrants.0.extra", "ignored"],
    ["context", "policy.delegatedBps", 3000], ["context", "policy.hardCapBps", 10_001],
    ["context", "agents", []], ["context", "agents.0.active", false],
    ["context", "agents.0.workspaceId", "other"], ["context", "agents.0.quoteId", "other"],
    ["context", "agents.0.action", "contact.update"], ["context", "agents.1.id", "quote-agent"],
    ["context", "provider.workspaceId", "other"], ["context", "provider.quoteId", "other"],
    ["context", "provider.binding", "unbound"], ["context", "provider.contract", "contact-conditional-write-1"],
    ["context", "provider.atomicSourceVersion", false], ["context", "provider.atomicSourceVersion", "true"],
    ["context", "provider.actionIdIdempotency", false], ["context", "provider.effectReadback", false],
    ["context", "email.from", "sales@example.test\r\nBcc: other@example.test"],
    ["context", "email.workspaceId", "other"], ["context", "email.quoteId", "other"],
    ["context", "email.recipient", "a@example.test,b@example.test"],
    ["context", "email.recipient", "other@example.test"],
    ["context", "email.actionIdIdempotency", false], ["context", "email.effectReadback", false],
  ];
  it.each(mutations)("refuses changed %s %s", (side, path, value) => {
    const data = fixture();
    change(data[side], path, value);
    expect(() => validateQuotePlan(data.proposal, data.context)).toThrow(ControlError);
  });

  it.each([null, [], "quote", 14, true, {}])("refuses malformed top-level input %s", (input) => {
    const { proposal, context } = fixture();
    expect(() => validateQuotePlan(input, context)).toThrow(ControlError);
    expect(() => validateQuotePlan(proposal, input)).toThrow(ControlError);
  });

  it.each(["quote.sourceVersion", "policyVersion", "message.dependsOn", "update.agentId", "approver"])("refuses missing proposal %s", (path) => {
    const { proposal, context } = fixture();
    change(proposal, path, undefined, true);
    expect(() => validateQuotePlan(proposal, context)).toThrow(ControlError);
  });

  it("refuses fractional minor units, duplicate lines and pricing overflow even when source matches", () => {
    const { proposal, context } = fixture();
    for (const q of [proposal.quote, context.quote]) {
      q.subtotalMinor = 101; q.lines = [{ id: "line-1", quantity: 1, unitPriceMinor: 101 }];
    }
    expect(() => validateQuotePlan(proposal, context)).toThrow(ControlError);
    for (const q of [proposal.quote, context.quote]) {
      q.subtotalMinor = 200_000;
      q.lines = [{ id: "same", quantity: 10, unitPriceMinor: 10_000 }, { id: "same", quantity: 10, unitPriceMinor: 10_000 }];
    }
    expect(() => validateQuotePlan(proposal, context)).toThrow(ControlError);
    for (const q of [proposal.quote, context.quote]) {
      q.subtotalMinor = Number.MAX_SAFE_INTEGER;
      q.lines = [{ id: "line-1", quantity: 2, unitPriceMinor: Number.MAX_SAFE_INTEGER }];
    }
    expect(() => validateQuotePlan(proposal, context)).toThrow(ControlError);
  });

  it("refuses accessors and inherited required fields without evaluating the accessor", () => {
    const { proposal, context } = fixture();
    const accessor = { ...proposal };
    const getter = () => { throw new Error("must not execute"); };
    Object.defineProperty(accessor, "discountBps", { get: getter, enumerable: true });
    expect(() => validateQuotePlan(accessor, context)).toThrow(ControlError);
    expect(() => validateQuotePlan(Object.create(proposal), context)).toThrow(ControlError);
    const hidden = { ...proposal };
    Object.defineProperty(hidden, "approved", { value: true, enumerable: false });
    expect(() => validateQuotePlan(hidden, context)).toThrow(ControlError);
    const sparse = fixture();
    sparse.context.agents.length = 3;
    expect(() => validateQuotePlan(sparse.proposal, sparse.context)).toThrow(ControlError);
    const sparseGrants = fixture();
    sparseGrants.context.approvalGrants.length = 2;
    expect(() => validateQuotePlan(sparseGrants.proposal, sparseGrants.context)).toThrow(ControlError);
    const duplicates = fixture();
    duplicates.context.approvalGrants.push(structuredClone(duplicates.context.approvalGrants[0]));
    expect(() => validateQuotePlan(duplicates.proposal, duplicates.context)).toThrow(ControlError);
  });
});
