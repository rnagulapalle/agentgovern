import { describe, it, expect } from "vitest";
import { evaluate } from "./engine";
import { SCENARIOS, getScenario } from "./scenarios";

/** Every scenario's control value must produce the decision the story promises. */
function decisionAt(scenarioId: string, value: number) {
  const s = getScenario(scenarioId);
  return evaluate(s.buildRequest(value), { agent: s.agent, now: s.now }).decision;
}

describe("demo scenarios (engine-driven verdicts)", () => {
  it("registers all three runs", () => {
    expect(SCENARIOS.map((s) => s.id)).toEqual([
      "ferpa-data-export",
      "sales-discount",
      "stale-crm",
    ]);
  });

  it("Run 1 · discount: within cap allows, over cap needs approval", () => {
    expect(decisionAt("sales-discount", 10)).toBe("allow");
    expect(decisionAt("sales-discount", 25)).toBe("require_approval");
  });

  it("Run 2 · stale CRM: fresh allows, stale hard-blocks", () => {
    expect(decisionAt("stale-crm", 2)).toBe("allow");
    expect(decisionAt("stale-crm", 41)).toBe("block");
  });

  it("Run 3 · FERPA export: at/under limit allows, over limit needs steward approval", () => {
    expect(decisionAt("ferpa-data-export", 100)).toBe("allow");
    expect(decisionAt("ferpa-data-export", 500)).toBe("allow");
    expect(decisionAt("ferpa-data-export", 3120)).toBe("require_approval");
  });

  it("each scenario's default control value matches its intended headline decision", () => {
    // discount defaults over cap → approval; stale defaults stale → block;
    // ferpa defaults over limit → approval.
    expect(decisionAt("sales-discount", getScenario("sales-discount").control.default)).toBe(
      "require_approval"
    );
    expect(decisionAt("stale-crm", getScenario("stale-crm").control.default)).toBe("block");
    expect(decisionAt("ferpa-data-export", getScenario("ferpa-data-export").control.default)).toBe(
      "require_approval"
    );
  });
});
