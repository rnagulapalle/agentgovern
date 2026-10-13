/** Consistency of retained browser measurements only; not authenticated CI provenance.
 * Containment is asserted by the source-bound browser driver, whose current row
 * format does not retain edge coordinates. This validator cannot recompute it. */
export function validateAdvancedButtonMeasurements(value: unknown): void {
  const labels = ["Submit prepared action", "Approve exact action", "Execute", "Execute · lose response", "Verify outcome"];
  if (!Array.isArray(value) || value.length < 10 || value.length > 120)
    throw Error("Actual advanced button measurements are missing or unbounded.");
  const present = new Set<string>();
  for (const row of value) {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).sort().join(",") !== "height,label,lines,step,viewport" ||
        !labels.includes(row.label) || ![1, 2].includes(row.step) || ![1280, 390].includes(row.viewport) ||
        typeof row.height !== "number" || !Number.isFinite(row.height) || row.height < 44 || row.height > 256 || row.lines !== 1)
      throw Error("Actual advanced button geometry is malformed or unreadable.");
    present.add(`${row.label}:${row.viewport}:${row.step}`);
  }
  for (const label of labels) for (const viewport of [1280, 390]) {
    if (![1, 2].some(step => present.has(`${label}:${viewport}:${step}`)))
      throw Error("Actual advanced action state or viewport was not measured.");
    if (["Submit prepared action", "Approve exact action", "Execute"].includes(label))
      for (const step of [1, 2]) if (!present.has(`${label}:${viewport}:${step}`))
        throw Error("Both actual connector action controls must be measured.");
  }
}
