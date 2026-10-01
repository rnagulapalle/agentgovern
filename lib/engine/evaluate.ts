/**
 * The Execution Policy Engine core.
 *
 * evaluate(request, context) → decision + deterministic demo receipt.
 *
 * Deterministic and pure: same inputs always produce the same output (no Date.now,
 * no randomness — `now` is supplied via context). The agent never executes a tool
 * directly; it submits an ActionRequest and the engine decides whether it may run.
 */

import type {
  ActionRequest,
  ActionReceipt,
  CheckStatus,
  EvalContext,
  EvaluationResult,
  PolicyCheck,
  ReceiptEvidence,
} from "./types";
import { getCapability } from "./registry";
import { evidenceHash, receiptId, signEvidence } from "./hash";

const DAY_MS = 86_400_000;

function daysBetween(aIso: string, bIso: string): number {
  return Math.abs(new Date(aIso).getTime() - new Date(bIso).getTime()) / DAY_MS;
}

/** Worst status wins: fail > approval > pass. */
function rollup(checks: PolicyCheck[]): CheckStatus {
  if (checks.some((c) => c.status === "fail")) return "fail";
  if (checks.some((c) => c.status === "approval")) return "approval";
  return "pass";
}

const BASE_RISK: Record<string, number> = {
  "email.send": 30,
  "crm.update": 20,
  "calendar.schedule": 10,
  "agent.delegate": 15,
  "payment.refund": 60,
  "data.export": 50,
};

export function evaluate(
  request: ActionRequest,
  context: EvalContext
): EvaluationResult {
  const { agent, now } = context;
  const checks: PolicyCheck[] = [];

  // The identity in the signed context must own the submitted request. This
  // prevents a caller from borrowing another agent's capability contract.
  if (request.agentId !== agent.id) {
    checks.push({
      id: "identity",
      label: "Agent identity",
      status: "fail",
      detail: "Request agent does not match the evaluated identity.",
      policyId: "POL-IDENTITY-001",
      severity: "high",
    });
  }

  if (
    !Number.isFinite(new Date(now).getTime()) ||
    !Number.isFinite(new Date(request.at).getTime())
  ) {
    checks.push({
      id: "request-time",
      label: "Request timestamp",
      status: "fail",
      detail: "Request or evaluation timestamp is invalid.",
      policyId: "POL-INPUT-VALIDATION-001",
      severity: "high",
    });
  }

  const capability = getCapability(agent, request.capability);

  // 1. Capability contract — is this action even granted to the agent?
  if (!capability) {
    checks.push({
      id: "capability",
      label: "Capability granted",
      status: "fail",
      detail: `Agent has no '${request.capability}' capability.`,
      policyId: "CAP-REGISTRY",
      severity: "high",
    });
  } else {
    checks.push({
      id: "capability",
      label: "Capability granted",
      status: "pass",
      detail: `'${request.capability}' is in the agent's contract.`,
      policyId: "CAP-REGISTRY",
      severity: "info",
    });
  }

  // 2. Restricted tool check.
  if (agent.restrictedTools.includes(request.tool)) {
    checks.push({
      id: "tool",
      label: "Tool access",
      status: "fail",
      detail: `Tool '${request.tool}' is restricted for this agent.`,
      policyId: "POL-TOOL-RESTRICT-001",
      severity: "high",
    });
  }

  // 3. Source-of-truth freshness — the root-cause guard.
  let freshnessOk: boolean | null = null;
  let freshnessAgeDays: number | null = null;
  if (capability?.requiresFreshSourceWithinDays != null) {
    if (!request.sourceRecord) {
      // Missing evidence is a HARD FAILURE, not a warning.
      checks.push({
        id: "freshness",
        label: "Source-of-truth freshness",
        status: "fail",
        detail: "No source record attached — cannot verify data freshness.",
        policyId: "POL-FRESHNESS-005",
        severity: "high",
      });
      freshnessOk = false;
    } else {
      const age = daysBetween(now, request.sourceRecord.lastSyncedAt);
      freshnessAgeDays = Math.round(age * 10) / 10;
      freshnessOk = age <= capability.requiresFreshSourceWithinDays;
      checks.push({
        id: "freshness",
        label: "Source-of-truth freshness",
        status: freshnessOk ? "pass" : "fail",
        detail: freshnessOk
          ? `${request.sourceRecord.system} record synced ${freshnessAgeDays}d ago (≤ ${capability.requiresFreshSourceWithinDays}d).`
          : `${request.sourceRecord.system} record is ${freshnessAgeDays}d stale (> ${capability.requiresFreshSourceWithinDays}d).`,
        policyId: "POL-FRESHNESS-005",
        severity: "high",
      });
    }
  }

  // 4. Required evidence completeness (target, diff).
  if (capability?.requiresTarget && !request.target?.trim()) {
    checks.push({
      id: "evidence.target",
      label: "Intended target",
      status: "fail",
      detail: "No intended recipient/target on the request.",
      policyId: "POL-EVIDENCE-006",
      severity: "high",
    });
  }
  if (capability?.requiresDiff && !request.diff) {
    checks.push({
      id: "evidence.diff",
      label: "Change diff",
      status: "fail",
      detail: "No diff vs. current state attached.",
      policyId: "POL-EVIDENCE-006",
      severity: "medium",
    });
  }

  // 5. Discount authority (delegated cap).
  let permittingRule: string | null = capability ? "CAP-REGISTRY" : null;
  const discount = Number(request.params.discountPct);
  if (capability?.maxDiscountPct != null) {
    if (!Number.isFinite(discount) || discount < 0 || discount > 100) {
      checks.push({
        id: "discount",
        label: "Discount authority",
        status: "fail",
        detail: "Discount must be a finite percentage between 0 and 100.",
        policyId: "POL-INPUT-VALIDATION-001",
        severity: "high",
      });
    } else if (discount > capability.maxDiscountPct) {
      checks.push({
        id: "discount",
        label: "Discount authority",
        status: "approval",
        detail: `Discount ${discount}% exceeds delegated authority of ${capability.maxDiscountPct}%.`,
        policyId: "POL-SDR-DISCOUNT-002",
        severity: "medium",
      });
      permittingRule = "POL-SDR-DISCOUNT-002 · human approval";
    } else {
      checks.push({
        id: "discount",
        label: "Discount authority",
        status: "pass",
        detail: `Discount ${discount}% is within the ${capability.maxDiscountPct}% cap.`,
        policyId: "POL-SDR-DISCOUNT-002",
        severity: "info",
      });
      permittingRule = "POL-SDR-DISCOUNT-002 · within authority";
    }
  }

  // 6. Spend / blast-radius.
  const cost = request.estCostUsd ?? 0;
  if (!Number.isFinite(cost) || cost < 0) {
    checks.push({
      id: "cost",
      label: "Estimated cost",
      status: "fail",
      detail: "Estimated cost must be a finite non-negative number.",
      policyId: "POL-INPUT-VALIDATION-001",
      severity: "high",
    });
  }
  if (capability?.maxSpendUsd != null && cost > capability.maxSpendUsd) {
    checks.push({
      id: "spend",
      label: "Spend authority",
      status: "approval",
      detail: `Cost $${cost} exceeds the $${capability.maxSpendUsd} per-action cap.`,
      policyId: "POL-SPEND-LIMIT-004",
      severity: "medium",
    });
  }
  if (context.budget) {
    const b = context.budget;
    if (b.spentUsd + cost > b.maxSpendUsd || b.actionCount + 1 > b.maxActions) {
      checks.push({
        id: "blast-radius",
        label: "Run blast radius",
        status: "fail",
        detail: "Run spend/action budget exceeded.",
        policyId: "POL-BLAST-RADIUS-008",
        severity: "high",
      });
    }
  }

  // ── Decision ────────────────────────────────────────────────────────────
  const status = rollup(checks);
  const decision =
    status === "fail" ? "block" : status === "approval" ? "require_approval" : "allow";

  const blockingReasons = checks
    .filter((c) => c.status === "fail")
    .map((c) => c.detail);

  // ── Risk score (deterministic) ──────────────────────────────────────────
  let risk = BASE_RISK[request.capability] ?? 25;
  if (checks.some((c) => c.id === "discount" && c.status === "approval")) risk += 25;
  if (checks.some((c) => c.id === "spend" && c.status === "approval")) risk += 20;
  if (freshnessOk === false) risk += 25;
  if (status === "fail") risk += 25;
  risk = Math.max(0, Math.min(100, risk));

  // ── Evidence + deterministic demo receipt ──────────────────────────────
  const evidence: ReceiptEvidence = {
    sourceRecordId: request.sourceRecord?.id ?? null,
    sourceSystem: request.sourceRecord?.system ?? null,
    sourceLastSyncedAt: request.sourceRecord?.lastSyncedAt ?? null,
    freshnessOk,
    freshnessAgeDays,
    intendedTarget: request.target ?? null,
    diff: request.diff ?? null,
    estCostUsd: request.estCostUsd ?? null,
    permittingRule,
  };

  // Evidence is "complete" when no evidence-class check failed.
  const evidenceComplete = !checks.some(
    (c) =>
      (c.id === "freshness" || c.id.startsWith("evidence.")) && c.status === "fail"
  );

  const hash = evidenceHash(evidence);
  const receipt: ActionReceipt = {
    id: receiptId(request.id),
    actionId: request.id,
    agentId: request.agentId,
    capability: request.capability,
    decision,
    riskScore: risk,
    evidence,
    evidenceComplete,
    checks,
    createdAt: now,
    evidenceHash: hash,
    signature: signEvidence(hash, agent.id),
  };

  return { decision, riskScore: risk, checks, receipt, blockingReasons };
}
