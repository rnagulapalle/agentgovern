import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import type { activities, Progress } from "./activities";
const { advance } = proxyActivities<ReturnType<typeof activities>>({
  startToCloseTimeout: "45 seconds",
  retry: { maximumAttempts: 3, initialInterval: "1 second" },
});
export const wake = defineSignal("wake");
// Signals are hints only. Saved LoopLabs state remains the approval authority.
export async function governedAcknowledgement(runId: string): Promise<Progress> {
  let notified = false;
  setHandler(wake, () => { notified = true; });
  for (;;) {
    notified = false;
    const progress = await advance(runId);
    if (progress !== "waiting") return progress;
    await condition(() => notified, "5 seconds");
  }
}
