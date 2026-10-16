import { preserveRuntimeInventory, type DiscoveredRuntime } from "./cloud-discovery";

export interface ExternalRunHistoryApi {
  // A reviewed server transport supplies the exact runtime and read-only source.
  // No caller-selected endpoint, invocation body or mutation operation.
  readRuns(input: { limit: 50 }): Promise<unknown>;
}
export interface ExternalRunObservation {
  runId: string;
  reportedStatus: "running" | "awaiting_approval" | "completed" | "declined" | "rejected" | "needs_info" | "triaged" | "failed";
  trigger: "slack" | "email";
  createdAt: string;
  updatedAt: string;
  requestedDiscount: number | null;
  reportedPolicyDecision: "auto_approve" | "needs_approval" | "decline" | "invalid" | null;
  reportedApprovalDecision: "approved" | "rejected" | null;
  steps: { sequence: number; label: string; reportedStatus: "running" | "ok" | "error" | "skipped"; startedAt: string; finishedAt: string | null }[];
  evidence: "agent-reported";
  approvalIdentityVerified: false;
  effectVerified: false;
  enforcement: "not-established";
}
export interface ExternalRunHistory {
  source: { runtimeArn: string; enrolledRuntimeVersion: string; executionVersion: "unknown"; binding: string; checkedAt: string };
  runs: ExternalRunObservation[];
  coverage: "latest-50-only";
  status: "observed" | "partial" | "unavailable";
  failures: ("read-unavailable" | "invalid-response" | "invalid-run" | "duplicate-run")[];
}
const plain = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype;
const id = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(v);
function timestamp(v: unknown): string | null {
  if (typeof v !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(v) || !Number.isFinite(Date.parse(v))) return null;
  const canonical = new Date(v).toISOString();
  // Date.parse normalizes impossible dates; do not accept those as source evidence.
  if (canonical.slice(0, 19) !== v.slice(0, 19)) return null;
  return canonical;
}
const labels: Record<string, string> = {
  classify: "Interpret request", resolve_customer: "Find customer", price: "Calculate price", load_base_quote: "Read existing quote",
  policy_check: "Evaluate existing policy", apply_discount: "Calculate proposed discount", record_crm: "Update CRM",
  send_quote: "Send customer response", request_approval: "Request manager approval", update_approval_message: "Update approval message",
  notify_manager_declined: "Report policy block", notify_customer_rejected: "Report rejection", triage: "Request review", ask_for_details: "Ask for missing details",
};
const statuses = ["running", "awaiting_approval", "completed", "declined", "rejected", "needs_info", "triaged", "failed"];
/** Source-specific adapter for the current quote agent's saved /runs contract.
 * Free text, identities, provider details, raw errors and claimed verification
 * flags are deliberately discarded. This is observation, never authorization.
 */
export function projectQuoteAgentRun(value: unknown): ExternalRunObservation | null {
  if (!plain(value) || !id(value.id) || typeof value.status !== "string" || !statuses.includes(value.status)
    || !plain(value.inbound) || (typeof value.inbound.channel !== "string" || !["slack", "email"].includes(value.inbound.channel))
    || !Array.isArray(value.steps) || value.steps.length > 100) return null;
  const createdAt = timestamp(value.created_at), updatedAt = timestamp(value.updated_at);
  if (!createdAt || !updatedAt || updatedAt < createdAt) return null;
  const steps: ExternalRunObservation["steps"] = [];
  for (const raw of value.steps) {
    if (!plain(raw) || !id(raw.name) || typeof raw.status !== "string" || !["running", "ok", "error", "skipped"].includes(raw.status)) return null;
    const startedAt = timestamp(raw.started_at), finishedAt = raw.finished_at === undefined ? null : timestamp(raw.finished_at);
    if (!startedAt || startedAt < createdAt || startedAt > updatedAt
      || (raw.finished_at !== undefined && !finishedAt)
      || (finishedAt !== null && (finishedAt < startedAt || finishedAt > updatedAt))
      || (["ok", "error"].includes(raw.status) && !finishedAt)) return null;
    steps.push({ sequence: steps.length + 1, label: Object.hasOwn(labels, raw.name) ? labels[raw.name] : "Other workflow step",
      reportedStatus: raw.status as ExternalRunObservation["steps"][number]["reportedStatus"], startedAt, finishedAt });
  }
  let requestedDiscount: number | null = null;
  let reportedPolicyDecision: ExternalRunObservation["reportedPolicyDecision"] = null;
  if (value.discount !== undefined) {
    if (!plain(value.discount)) return null;
    const pct = value.discount.requested_pct;
    if (pct !== undefined && pct !== null && (typeof pct !== "number" || !Number.isFinite(pct) || pct < 0 || pct > 100)) return null;
    requestedDiscount = typeof pct === "number" ? pct : null;
    const decision = value.discount.decision;
    if (decision !== undefined && (typeof decision !== "string" || !["auto_approve", "needs_approval", "decline", "invalid"].includes(decision))) return null;
    reportedPolicyDecision = decision as ExternalRunObservation["reportedPolicyDecision"] ?? null;
  }
  let reportedApprovalDecision: ExternalRunObservation["reportedApprovalDecision"] = null;
  if (value.approval_decision !== undefined) {
    if (!plain(value.approval_decision) || typeof value.approval_decision.decision !== "string" || !["approved", "rejected"].includes(value.approval_decision.decision)) return null;
    reportedApprovalDecision = value.approval_decision.decision as "approved" | "rejected";
  }
  return { runId: value.id, reportedStatus: value.status as ExternalRunObservation["reportedStatus"], trigger: value.inbound.channel as "slack" | "email",
    createdAt, updatedAt, requestedDiscount, reportedPolicyDecision, reportedApprovalDecision, steps,
    evidence: "agent-reported", approvalIdentityVerified: false, effectVerified: false, enforcement: "not-established" };
}
/** Read one finite source snapshot. It is not a full historical import or a
 * durable cursor, and current enrollment does not attest past execution version.
 */
export async function collectExternalRunHistory(api: ExternalRunHistoryApi, runtime: DiscoveredRuntime, binding: string, at: string, timeoutMs = 1500): Promise<ExternalRunHistory> {
  const pinned = preserveRuntimeInventory(null, { scope: runtime.scope, observedAt: at, completeness: "partial", records: [runtime], failures: [] }).records[0].record;
  if (!/^[a-f0-9]{64}$/.test(binding) || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 15000) throw Error("Reviewed history binding and bounded timeout required");
  const result: ExternalRunHistory = { source: { runtimeArn: pinned.resourceArn, enrolledRuntimeVersion: pinned.version, executionVersion: "unknown", binding, checkedAt: at },
    runs: [], coverage: "latest-50-only", status: "unavailable", failures: [] };
  let timer: ReturnType<typeof setTimeout> | undefined;
  let value: unknown;
  try {
    const raw = JSON.stringify(await Promise.race([api.readRuns({ limit: 50 }), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error()), timeoutMs); })]));
    if (typeof raw !== "string" || Buffer.byteLength(raw) > 1_048_576) throw Error();
    value = JSON.parse(raw);
  } catch { result.failures.push("read-unavailable"); return result; }
  finally { clearTimeout(timer); }
  if (!plain(value) || !Array.isArray(value.runs) || value.runs.length > 50) { result.failures.push("invalid-response"); return result; }
  result.status = "observed";
  const seen = new Set<string>();
  for (const raw of value.runs) {
    const run = projectQuoteAgentRun(raw);
    if (!run || Date.parse(run.updatedAt) > Date.parse(at) + 300000) { result.failures.push("invalid-run"); continue; }
    if (seen.has(run.runId)) { result.failures.push("duplicate-run"); continue; }
    seen.add(run.runId); result.runs.push(run);
  }
  if (result.failures.length) result.status = "partial";
  return result;
}
