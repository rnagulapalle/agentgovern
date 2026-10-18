import { it, expect, vi } from "vitest";
import type { WorkflowControl } from "../../lib/workflows/service";
import type { Actor } from "../../lib/durable/contracts";
import { ControlError } from "../../lib/durable/contracts";
import { activities } from "./activities";
const actor = { role: "worker", subject: "enquiry-runner" } as Actor;
function fixture(state = "held", runState = "active") {
  const step = { action_id: "one", state };
  const service = { read: vi.fn().mockResolvedValue({ state: runState, steps: [step] }), verify: vi.fn(), connectors: { execute: vi.fn(), reconcile: vi.fn(), read: vi.fn().mockResolvedValue(step) } };
  return { service, advance: activities(service as unknown as WorkflowControl, actor).advance };
}
it("rejects arbitrary worker identities", async () => {
  await expect(activities({} as WorkflowControl, { role: "operator" } as Actor).advance("x")).rejects.toThrow("Dedicated");
  await expect(activities({} as WorkflowControl, { ...actor, subject: "other" }).advance("x")).rejects.toThrow("Dedicated");
});
it("waits for held work without granting approval", async () => {
  const { advance, service } = fixture(); expect(await advance("x")).toBe("waiting"); expect(service.connectors.execute).not.toHaveBeenCalled();
});
it("returns completed and contained states without new dispatch", async () => {
  expect(await fixture("held", "completed").advance("x")).toBe("completed");
  expect(await fixture("held", "paused").advance("x")).toBe("contained");
  for (const s of ["conflict", "cancelled", "rejected"]) expect(await fixture(s).advance("x")).toBe("contained");
});
it("dispatches ready work through existing service and contains a conflict", async () => {
  const { advance, service } = fixture("ready"); service.connectors.read.mockResolvedValue({ action_id: "one", state: "conflict" });
  expect(await advance("x")).toBe("contained"); expect(service.connectors.execute).toHaveBeenCalledWith(actor, "one");
});
it("inspects unknown effects without resending and waits for a live lease", async () => {
  for (const s of ["uncertain", "executing"]) {
    const { advance, service } = fixture(s); service.connectors.reconcile.mockRejectedValue(new ControlError(409, "Live lease"));
    expect(await advance("x")).toBe("waiting"); expect(service.connectors.execute).not.toHaveBeenCalled();
  }
});
it("does not swallow authorization or transport failures", async () => {
  for (const e of [new ControlError(403, "Revoked"), new Error("Unavailable")]) {
    const { advance, service } = fixture("uncertain"); service.connectors.reconcile.mockRejectedValue(e); await expect(advance("x")).rejects.toThrow(e.message);
  }
});
it("requires final verification before returning completed", async () => {
  const { advance, service } = fixture("succeeded");
  service.read.mockResolvedValueOnce({ state: "active", steps: [{ action_id: "one", state: "succeeded" }] }).mockResolvedValue({ state: "completed", steps: [] });
  expect(await advance("x")).toBe("completed"); expect(service.verify).toHaveBeenCalledWith(actor, "x");
  expect(await fixture("succeeded").advance("x")).toBe("waiting");
});
