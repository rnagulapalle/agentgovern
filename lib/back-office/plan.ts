import { ControlError } from "../durable/contracts";
export const EXAMPLE_PROMPT =
  "Handle order cancellations. Refund up to $50. Require a second person's approval. Cancel the order before refunding. Email only after the refund is verified.";
export const STEPS = [
  "Review cancellation",
  "Second-person approval",
  "Cancel order",
  "Refund payment",
  "Verify refund",
  "Send confirmation",
] as const;
export type Plan = {
  limit: number;
  steps: typeof STEPS;
  scope: "provider-twins";
};
// A deliberately small, inspectable language. Unknown instructions never disappear.
// This is a template compiler, not an LLM or arbitrary workflow generator.
export function compilePrompt(input: unknown): Plan {
  if (typeof input !== "string" || input.length > 1000)
    throw new ControlError(
      400,
      "Describe the supported cancellation process in 1,000 characters or fewer.",
    );
  const sentences = input.trim().toLowerCase().split(/\.\s*/).filter(Boolean);
  const required = [
    "handle order cancellations",
    "require a second person's approval",
    "cancel the order before refunding",
    "email only after the refund is verified",
  ];
  const limits = sentences.filter((s) => /^refund up to \$\d+$/.test(s));
  if (
    sentences.length !== 5 ||
    limits.length !== 1 ||
    required.some((s) => sentences.filter((v) => v === s).length !== 1)
  )
    throw new ControlError(
      400,
      "This builder supports the prepared cancellation process only. Keep all five instructions; unsupported steps need review instead of being silently omitted.",
    );
  const limit = Number(limits[0].slice("refund up to $".length)) * 100;
  if (!Number.isSafeInteger(limit) || limit < 100 || limit > 10000)
    throw new ControlError(
      400,
      "Choose a refund ceiling between $1 and $100 for this provider-twin process.",
    );
  return { limit, steps: STEPS, scope: "provider-twins" };
}
