// Admission for a prepared conversation, not an LLM planner or permission check.
// The server still owns the fixed payloads, identity and execution authority.
export const handoffRequest =
  "Update the sample customer record, then send the prepared acknowledgement.";

const supported = new Set([
  handoffRequest,
  "Start a customer handoff.",
  "Mark the sample contact as a customer, then send the prepared acknowledgement.",
].map(normalize));

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ").replace(/[.!]$/, "");
}

export function reviewRequest(value: unknown): { supported: boolean; reply: string } {
  if (typeof value !== "string" || !value.trim())
    return { supported: false, reply: "Choose the prepared customer handoff or describe the work you need." };
  if (value.length > 600)
    return { supported: false, reply: "Keep your request under 600 characters. Do not include customer details or secrets." };
  if (!supported.has(normalize(value)))
    return {
      supported: false,
      reply: "That request is not supported here yet. I can prepare only the sample customer handoff below. I have not created a run or changed a system.",
    };
  return {
    supported: true,
    reply: "I can prepare that customer handoff. Review the exact steps before choosing the registered agents. Reviewing this plan does not approve or execute an action.",
  };
}

export function explainStep(state: string | null) {
  switch (state) {
    case null: return "Not submitted. No action has been sent for review.";
    case "held": return "Waiting for an independent reviewer. This step has not been dispatched.";
    case "ready": return "Approved for this exact request. Current authority is checked again before dispatch.";
    case "executing": return "Dispatched. Its outcome is not confirmed yet; do not repeat the action.";
    case "succeeded": return "This step's effect is confirmed. The full run still needs its final check.";
    case "uncertain": return "The action may have taken effect. Verify the external result before any retry.";
    case "conflict": return "The observed result conflicts with this request. Keep dependent work on hold and review it.";
    case "rejected": return "The reviewer rejected this step. It cannot execute.";
    case "cancelled": return "This step was cancelled. Earlier steps may still have taken effect.";
    default: return "This state needs review. No new action is offered automatically.";
  }
}
