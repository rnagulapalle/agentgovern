import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import type { versionedActivities, RunContract } from "./version-contract";
import type { Progress } from "./activities";
const { advanceContract } = proxyActivities<ReturnType<typeof versionedActivities>>({
  startToCloseTimeout: "45 seconds", retry: { maximumAttempts: 3, initialInterval: "1 second" },
});
export const wake = defineSignal("wake");
export async function pinnedAcknowledgement(contract: RunContract): Promise<Progress> {
  let notified = false;
  setHandler(wake, () => { notified = true; });
  for (;;) {
    notified = false;
    const progress = await advanceContract(contract);
    if (progress !== "waiting") return progress;
    await condition(() => notified, "5 seconds");
  }
}
