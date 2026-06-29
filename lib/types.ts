/**
 * How the blocked / risky discount email was resolved.
 * - approved:  requested discount was within the 10% cap → executed as-is
 * - edited:    requested discount was over cap → auto-corrected to 10% & executed
 * - exception: requested discount was over cap → approved at requested % with a signed exception
 * - rejected:  action denied
 */
export type Decision = "approved" | "edited" | "exception" | "rejected" | null;

/** Playback stages of a simulated agent run. */
export type Phase = "idle" | "planning" | "policy" | "review" | "resolved";
