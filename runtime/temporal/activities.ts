import type { WorkflowControl } from "../../lib/workflows/service";
import type { Actor } from "../../lib/durable/contracts";
import { ControlError } from "../../lib/durable/contracts";

export type Progress = "waiting" | "completed" | "contained";
// Worker credentials stay in the activity process, never in Temporal inputs/history.
export function activities(workflows: WorkflowControl, actor: Actor) {
  return {
    async advance(runId: string): Promise<Progress> {
      if (actor.role !== "worker" || actor.subject !== "enquiry-runner")
        throw new ControlError(403, "Dedicated managed worker required.");
      let run = await workflows.read(actor, runId);
      if (run.state === "completed") return "completed";
      if (run.state !== "active") return "contained";
      for (const step of run.steps) {
        if (["conflict", "rejected", "cancelled"].includes(step.state)) return "contained";
        if (step.state === "ready") await workflows.connectors.execute(actor, step.action_id);
        else if (["uncertain", "executing"].includes(step.state)) {
          try { await workflows.connectors.reconcile(actor, step.action_id); }
          catch (e) { if (!(e instanceof ControlError) || e.status !== 409) throw e; }
        }
        const current = await workflows.connectors.read(actor, step.action_id);
        if (["conflict", "rejected", "cancelled"].includes(current.state)) return "contained";
        if (current.state !== "succeeded") return "waiting";
      }
      await workflows.verify(actor, runId);
      run = await workflows.read(actor, runId);
      return run.state === "completed" ? "completed" : "waiting";
    },
  };
}
