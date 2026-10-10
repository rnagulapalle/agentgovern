import { expect, it } from "vitest";
import { validateAdvancedButtonMeasurements } from "./advanced-measurements";
// Synthetic validator inputs exercise refusal paths; they are never UI evidence.
const rows = () => ["Submit prepared action", "Approve exact action", "Execute", "Execute · lose response", "Verify outcome"].flatMap(label =>
  [1280, 390].flatMap(viewport => (["Submit prepared action", "Approve exact action", "Execute"].includes(label) ? [1, 2] : [1]).map(step => ({ label, viewport, step, height: 48, lines: 1 }))));
it("requires measured actual action labels at desktop/mobile and both connector steps for common controls", () => {
  expect(() => validateAdvancedButtonMeasurements(rows())).not.toThrow();
  for (const label of ["Submit prepared action", "Approve exact action", "Execute", "Execute · lose response", "Verify outcome"])
    for (const viewport of [1280, 390]) expect(() => validateAdvancedButtonMeasurements(rows().filter(row => row.label !== label || row.viewport !== viewport))).toThrow();
  expect(() => validateAdvancedButtonMeasurements(rows().filter(row => row.label !== "Execute" || row.step !== 2))).toThrow();
});
it("refuses absent, wrapped, tiny, nonfinite, foreign and unbounded measurements", () => {
  for (const bad of [undefined, {}, [], Array(121).fill(rows()[0])]) expect(() => validateAdvancedButtonMeasurements(bad)).toThrow();
  for (const change of [{ height: 43.99 }, { height: NaN }, { height: Infinity }, { height: "48" }, { height: 257 }, { lines: 2 }, { lines: 0 }, { viewport: 391 }, { step: 0 }, { label: "Send immediately" }, { authorized: true }]) {
    const altered: unknown[] = rows(); altered[0] = { ...rows()[0], ...change };
    expect(() => validateAdvancedButtonMeasurements(altered)).toThrow();
  }
  for (const bad of [null, [], false]) { const altered: unknown[] = rows(); altered[0] = bad; expect(() => validateAdvancedButtonMeasurements(altered)).toThrow(); }
});
