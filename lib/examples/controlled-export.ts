import { evaluate } from "@/lib/engine";
import { getScenario } from "@/lib/scenarios";

/** Public example only. Reuses the original evaluator; never dispatches an effect. */
export function checkExampleExport(rows: number) {
  if (!Number.isSafeInteger(rows) || rows < 0 || rows > 5000) return null;
  const scenario = getScenario("ferpa-data-export");
  return evaluate(scenario.buildRequest(rows), { agent: scenario.agent, now: scenario.now }).decision;
}
export type ExampleExportDecision = { rows: number; outcome: "within-policy" | "review-approved" | "rejected" };
export function decideExampleExport(rows: number, decision: "approve" | "reject"): ExampleExportDecision | null {
  if (decision !== "approve" && decision !== "reject") return null;
  const verdict = checkExampleExport(rows);
  if (verdict === null || verdict === "block") return null;
  return { rows, outcome: decision === "reject" ? "rejected" : verdict === "allow" ? "within-policy" : "review-approved" };
}
/** A record never authorizes a different request, even when both are within policy. */
export function currentExampleDecision(record: ExampleExportDecision | null, rows: number) {
  return record?.rows === rows ? record : null;
}
