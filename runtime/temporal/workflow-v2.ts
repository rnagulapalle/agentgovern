// Compatibility candidate for replay proof, not a production deployment.
import { condition, defineSignal, patched, proxyActivities, setHandler } from "@temporalio/workflow";
import type { activities, Progress } from "./activities";
const { advance } = proxyActivities<ReturnType<typeof activities>>({ startToCloseTimeout: "45 seconds", retry: { maximumAttempts: 3, initialInterval: "1 second" } });
export const wake = defineSignal("wake");
export async function governedAcknowledgement(runId: string): Promise<Progress> {
  const updatedWait = patched("ack-wait-v2");
  let notified = false;
  setHandler(wake, () => { notified = true; });
  for (;;) {
    notified = false;
    const progress = await advance(runId);
    if (progress !== "waiting") return progress;
    await condition(() => notified, updatedWait ? "2 seconds" : "5 seconds");
  }
}
