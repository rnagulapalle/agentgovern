import { describe, it, expect } from "vitest";
import { checkExampleExport, decideExampleExport, currentExampleDecision } from "./controlled-export";

describe("public controlled export example", () => {
  it("reuses the original 500-row example boundary", () => {
    expect(checkExampleExport(100)).toBe("allow");
    expect(checkExampleExport(500)).toBe("allow");
    expect(checkExampleExport(501)).toBe("require_approval");
    expect(checkExampleExport(3120)).toBe("require_approval");
  });
  it.each([NaN, Infinity, -1, 5001, 12.5])("refuses malformed or unsupported input %s", rows => {
    expect(checkExampleExport(rows)).toBeNull();
    expect(decideExampleExport(rows,"approve")).toBeNull();
  });
  it("keeps rejection distinct from approval and policy clearance", () => {
    expect(decideExampleExport(3120,"reject")?.outcome).toBe("rejected");
    expect(decideExampleExport(3120,"approve")?.outcome).toBe("review-approved");
    expect(decideExampleExport(500,"approve")?.outcome).toBe("within-policy");
  });
  it("invalidates an earlier decision when the requested scope changes", () => {
    const decision=decideExampleExport(3120,"approve");
    expect(currentExampleDecision(decision,3120)).toBe(decision);
    expect(currentExampleDecision(decision,3121)).toBeNull();
    expect(currentExampleDecision(decideExampleExport(100,"approve"),3120)).toBeNull();
    expect(currentExampleDecision(null,3120)).toBeNull();
  });
});
