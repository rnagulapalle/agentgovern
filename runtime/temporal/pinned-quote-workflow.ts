import { condition, defineSignal, proxyActivities, setHandler } from "@temporalio/workflow";
import { assertQuoteRunContract, type QuoteActivities, type QuoteRunContract, type QuoteProgress } from "../../lib/orchestration/quote-contract";
const { advanceQuoteContract } = proxyActivities<QuoteActivities>({
  startToCloseTimeout: "45 seconds", retry: { maximumAttempts: 3, initialInterval: "1 second" },
});
export const quoteWake = defineSignal("quoteWake");
// Separate history: never reinterpret an acknowledgement execution as a quote.
// Signals are wake hints. Only the activity's current authority checks decide.
export async function pinnedQuote(contract: QuoteRunContract): Promise<QuoteProgress> {
  assertQuoteRunContract(contract);
  let notified = false;
  setHandler(quoteWake, () => { notified = true; });
  for (;;) {
    notified = false;
    const progress = await advanceQuoteContract(contract);
    if (progress === "contained" || progress === "awaiting-named-verification") return progress;
    if (progress !== "waiting" && progress !== "awaiting-message-approval") throw Error("Unsupported quote activity progress");
    await condition(() => notified, "5 seconds");
  }
}
