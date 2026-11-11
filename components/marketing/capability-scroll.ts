/** A visual chapter index, never workflow execution state. */
export function capabilityStage(distance: number, step: number): number {
  if (!Number.isFinite(distance) || !Number.isFinite(step) || step <= 0) return 0;
  return Math.max(0, Math.min(3, Math.floor(distance / step)));
}
