"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Cloud, Database, Mail, ShieldCheck } from "lucide-react";
import { workspaceJson } from "@/lib/workspace/response";
import type { Snapshot } from "@/lib/durable/contracts";
import { CONNECTORS, type ConnectorAction } from "@/lib/connectors/contracts";
import { PageTitle } from "./ui";
import "./saved-workspace.css";

export type SavedWorkspaceSection = "overview" | "workflows" | "approvals" | "policies" | "connections" | "outputs" | "reconciliation";
type ConnectorSummary = { actions: ConnectorAction[]; policies: { connector: string; active: boolean; version: number }[] };
// Match the existing quote-step discriminator without importing its server execution boundary.
export function savedCustomerAction(action: ConnectorAction) {
  return (action.connector === "crm" || action.connector === "email") && !(action.payload && typeof action.payload === "object" && "contract" in action.payload && action.payload.contract === "quote-step-1");
}
export function savedActionLabel(action: { discount?: number; connector?: string }) {
  if (action.connector === "crm") return "Customer record update";
  if (action.connector === "email") return "Customer acknowledgement";
  return `${action.discount}% pricing request`;
}
export function savedActionDestination(action: { id: string; connector?: string }) {
  const workflow = action.connector === "crm" || action.connector === "email" ? action.connector : "discounts";
  return `/control-plane/actions?workflow=${workflow}#action-${encodeURIComponent(action.id)}`;
}
const actionStates = new Set(["held", "ready", "executing", "succeeded", "blocked", "rejected", "cancelled", "uncertain", "conflict", "recovered"]);
const content = {
  overview: ["Your control workspace", "Find the next decision, unresolved outcome, or setup task."],
  workflows: ["Workflows", "Choose the work you want to evaluate, then follow its saved decisions."],
  approvals: ["Approvals", "Review held requests in their original action workspace. Preparing a plan is not approval."],
  policies: ["Policies & access", "Understand the current boundaries before requesting a change."],
  connections: ["Connections", "Agent platforms, business systems, and model providers have different jobs."],
  outputs: ["Output controls", "Understand which outgoing data checks are established for this deployment."],
  reconciliation: ["Reconciliation", "Resolve uncertain effects before permitting another attempt."],
};
export function SavedWorkspace({ section }: { section: SavedWorkspaceSection }) {
  const [discount, setDiscount] = useState<Snapshot | null>(null);
  const [connectors, setConnectors] = useState<ConnectorSummary | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setErrors([]); setDiscount(null); setConnectors(null);
    const failures: string[] = [];
    await Promise.all([
      ["/api/durable", "Pricing", (value: Snapshot) => setDiscount(value)],
      ["/api/durable/connectors", "Customer actions", (value: ConnectorSummary) => setConnectors(value)],
    ].map(async ([url, label, apply]) => {
      try {
        const response = await fetch(url as string, { cache: "no-store", signal });
        const value = await workspaceJson(response);
        if (!response.ok) throw Error(value.error || "Saved state is unavailable.");
        if (!Array.isArray(value.actions) || value.actions.some((a: { id?: unknown; state?: unknown }) => !a || typeof a.id !== "string" || typeof a.state !== "string" || !actionStates.has(a.state))) throw Error("Saved action data could not be confirmed.");
        if (label === "Pricing" && value.actions.some((a: {discount?:unknown}) => typeof a.discount !== "number" || !Number.isInteger(a.discount) || a.discount < 0 || a.discount > 100)) throw Error("Pricing actions could not be confirmed.");
        if (label === "Customer actions" && value.actions.some((a: {connector?:unknown}) => !CONNECTORS.includes(a.connector as typeof CONNECTORS[number]))) throw Error("Customer actions could not be confirmed.");
        if (label === "Pricing" && (!value.policy || !Number.isFinite(value.policy.auto_limit) || !Number.isFinite(value.policy.hard_limit))) throw Error("Pricing policy could not be confirmed.");
        if (label === "Customer actions" && (!Array.isArray(value.policies) || value.policies.some((p: { active?: unknown; connector?: unknown }) => !p || typeof p.active !== "boolean" || !CONNECTORS.includes(p.connector as typeof CONNECTORS[number])))) throw Error("Connector policies could not be confirmed.");
        if (!signal?.aborted) (apply as (value: never) => void)((label === "Customer actions" ? { ...value, actions: value.actions.filter(savedCustomerAction), policies: value.policies.filter((p: {connector: string}) => p.connector === "crm" || p.connector === "email") } : value) as never);
      } catch (error) {
        if (!signal?.aborted) failures.push(`${label}: ${error instanceof Error ? error.message : "Saved state is unavailable."}`);
      }
    }));
    if (!signal?.aborted) { setErrors(failures); setLoading(false); }
  }, []);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const actions = [...(discount?.actions || []), ...(connectors?.actions || [])];
  const held = actions.filter(a => a.state === "held");
  const unresolved = actions.filter(a => a.state === "uncertain" || a.state === "conflict" || a.state === "executing");
  const complete = discount !== null && connectors !== null && errors.length === 0;
  function queue(title: string, items: typeof actions, empty: string) {
    return <section className="cp-panel cp-durable-card"><h2>{title}</h2><p className="saved-workspace-scope">Showing up to the latest 100 pricing actions and the customer actions within the latest 100 connector actions. Quote-plan actions are reviewed separately. Older pending work may be outside this view.</p>
      {loading ? <p role="status">Loading saved requests…</p> : !items.length ? <p>{complete ? empty : "The recent action view could not be confirmed. Do not interpret missing data as no pending work."}</p> : items.map(a => <article className="saved-workspace-row" key={a.id}>
        <div><h3>{savedActionLabel(a)}</h3><p>{a.state === "held" ? "Needs an independent decision before execution." : "Check the saved evidence before another attempt."}</p><details><summary>Technical details</summary><p>Action: {a.id}</p><p>Agent: {a.agent_id}</p></details></div>
        <Link prefetch={false} className="cp-button" href={savedActionDestination(a)}>{a.state === "held" ? "Review exact request" : "Inspect outcome"}</Link>
      </article>)}
    </section>;
  }
  const controlAreas = <section className="cp-panel cp-durable-card"><h2>Control areas</h2><div className="saved-workspace-control-areas">
    <article><h3>Action decisions</h3><p>Review the proposed change and its authority boundary.</p><Link prefetch={false} className="cp-button" href="/control-plane/approvals">Review decisions</Link></article>
    <article><h3>Execution</h3><p>Follow dependencies and stop new dispatches when needed.</p><Link prefetch={false} className="cp-button" href="/control-plane/workflow-runs">Inspect runs</Link></article>
    <article><h3>Output controls</h3><p>Provider-twin effects do not establish general content or data-loss protection.</p><Link prefetch={false} className="cp-button" href="/control-plane/outputs">Review output scope</Link></article>
    <article><h3>Reconciliation</h3><p>Check whether an uncertain action reached its system.</p><Link prefetch={false} className="cp-button" href="/control-plane/reconciliation">Inspect uncertain results</Link></article>
  </div></section>;
  const administrator = <section className="cp-panel cp-durable-card"><h2>Workspace administrator</h2><p>Your invited human account can inspect all control areas installed in this workspace. This is a product persona; the existing server authority remains operator.</p><ul><li>Register supported agents and assign invited owners and action allowances.</li><li>Configure supported action boundaries, review exact requests, and execute authorized actions.</li><li>Inspect saved runs, verify uncertain effects, contain connectors, and export decision history.</li></ul><p>Administrator visibility does not permit self-approval, bypass a hard limit, change another workspace, or execute an unsupported action. Account invitations, cloud IAM administration, and billing management are not provided here.</p></section>;
  const capabilityCatalog = <section className="cp-panel cp-durable-card"><h2>Product capability catalog</h2><p>Every product area is visible here. Availability describes this deployment; it grants no new authority.</p><div className="saved-workspace-control-areas">
    <article><h3>Agents and action boundaries</h3><span className="saved-workspace-badge">Installed · sample actions</span><p>Named owners, scoped keys, allowances and supported action rules.</p><Link prefetch={false} className="cp-button" href="/control-plane/agents">Inspect agents</Link></article>
    <article><h3>Approvals and execution</h3><span className="saved-workspace-badge">Installed · saved controls</span><p>Exact decisions and bounded workflow dependencies.</p><Link prefetch={false} className="cp-button" href="/control-plane/approvals">Inspect approvals</Link></article>
    <article><h3>History and reconciliation</h3><span className="saved-workspace-badge">Installed · saved evidence</span><p>Observed sample-system effects and uncertain outcome review.</p><Link prefetch={false} className="cp-button" href="/control-plane/reconciliation">Inspect outcomes</Link></article>
    <article><h3>Chat and workflow planning</h3><span className="saved-workspace-badge">Bounded quote planning only</span><p>The installed quote planner prepares proposals. General chat workflow generation and inbox monitoring are unavailable.</p><Link prefetch={false} className="cp-button" href="/control-plane/quotes">Inspect planning scope</Link></article>
    <article><h3>Cloud discovery and import</h3><span className="saved-workspace-badge">Unavailable in this deployment</span><p>AWS, Microsoft and Google onboarding require a separately installed, verified integration. Discovery alone does not enforce actions.</p></article>
    <article><h3>General output enforcement</h3><span className="saved-workspace-badge">Unavailable in this deployment</span><p>General content filtering and sensitive-data redaction are not enabled.</p><Link prefetch={false} className="cp-button" href="/control-plane/outputs">Inspect output scope</Link></article>
  </div></section>;
  const workflows = <section className="cp-panel cp-durable-card"><h2>Installed sample workflows</h2>
    <article className="saved-workspace-row"><div><h3>Pricing decisions</h3><p>Allow a discount, hold an exception, or block a request beyond the hard limit.</p><span className="saved-workspace-badge">Sample record</span></div><Link prefetch={false} className="cp-button" href="/control-plane/actions?workflow=discounts">Open pricing controls</Link></article>
    <article className="saved-workspace-row"><div><h3>Distributor quote</h3><p>Prepare a bounded quote plan and obtain separate exact decisions for its actions.</p><span className="saved-workspace-badge">Provider twins</span></div><Link prefetch={false} className="cp-button" href="/control-plane/quotes">Open quote workspace</Link></article>
    <article className="saved-workspace-row"><div><h3>Customer handoff</h3><p>Verify a customer-record change before releasing its dependent acknowledgement.</p><span className="saved-workspace-badge">Provider twins</span></div><Link prefetch={false} className="cp-button" href="/control-plane/workflow-runs">Open customer handoffs</Link></article>
  </section>;
  return <div className="cp-durable saved-workspace"><PageTitle eyebrow="CONTROL WORKSPACE" title={content[section][0]} description={content[section][1]} />
    <p className="saved-workspace-scope">Sample records and isolated simulated systems. Decisions are saved on the server; no live customer records change or customer email is delivered.</p>
    <button className="cp-button secondary" disabled={loading} onClick={() => void load()}>Refresh saved status</button>
    {errors.map(e => <p role="alert" className="cp-durable-message is-error" key={e}>{e}</p>)}
    {errors.length > 0 && <p>Available rows are a partial view. Other requests may still need attention.</p>}
    {section === "overview" && <>{controlAreas}{queue("Needs approval", held, "No held requests among the loaded recent actions.")}{queue("Needs verification", unresolved, "No unresolved requests among the loaded recent actions.")}<p className="saved-workspace-scope">Quote-plan review is separate from this action queue. Open the quote workspace to check its saved plans.</p><div className="cp-durable-grid"><section className="cp-panel cp-durable-card"><h2>Bring an agent into scope</h2><p>Assign a named owner and an allowed sample action. Cloud discovery and import are not enabled in this deployment.</p><Link prefetch={false} className="cp-button" href="/control-plane/agents">Review agents</Link></section><section className="cp-panel cp-durable-card"><h2>Check your connections</h2><p>See the installed sample systems and the setup still needed for cloud platforms.</p><Link prefetch={false} className="cp-button" href="/control-plane/connectors">Review connections</Link></section></div>{workflows}</>}
    {section === "approvals" && <>{queue("Held sample actions", held, "No held requests among the loaded recent actions.")}<section className="cp-panel cp-durable-card"><h2>Quote-plan decisions</h2><p>Quote updates and confirmations have their own exact approvals. They are not included in the sample action list above.</p><Link prefetch={false} className="cp-button" href="/control-plane/quotes">Review saved quote plans</Link></section></>}
    {section === "workflows" && <>{workflows}<p>General workflow generation, live inbox monitoring, and live customer adapters are not available in this deployment.</p></>}
    {section === "outputs" && <section className="cp-panel cp-durable-card"><h2>General output enforcement is not enabled</h2><p>The installed workflows record exact prepared messages and provider-twin acceptance. They do not establish general content filtering, sensitive-data redaction, or control over every model response.</p><p>Connecting a model or discovering an agent does not enable these protections. A supported output contract and verified enforcement path are required.</p><Link prefetch={false} className="cp-button" href="/control-plane/workflows">Review installed workflows</Link></section>}
    {section === "reconciliation" && <>{queue("Unresolved action outcomes", unresolved, "No unresolved requests among the loaded recent actions.")}<p>Containment prevents new dispatches; it does not undo an already accepted effect. Missing provider evidence must not be treated as a failed write.</p></>}
    {section === "policies" && <>{administrator}{capabilityCatalog}<section className="cp-panel cp-durable-card"><h2><ShieldCheck size={18} aria-hidden="true" /> Pricing boundary</h2>{discount ? <dl className="saved-workspace-facts"><dt>Allow</dt><dd>Sample discount up to {discount.policy.auto_limit}%</dd><dt>Independent approval</dt><dd>Above {discount.policy.auto_limit}%, up to {discount.policy.hard_limit}%</dd><dt>Block</dt><dd>Above {discount.policy.hard_limit}%</dd><dt>Policy version</dt><dd>{discount.policy.version}</dd></dl> : <p>Current pricing policy is unavailable.</p>}<p>Approval binds to the exact request and current policy. A requester cannot approve their own exception.</p><Link prefetch={false} className="cp-button" href="/control-plane/actions?workflow=discounts">Review pricing rules and requests</Link></section><section className="cp-panel cp-durable-card"><h2>Customer actions</h2><p>CRM updates and messages need separate exact approvals. The message cannot bypass the verified CRM dependency.</p><p>This summary grants no permissions and changes no rules.</p></section></>}
    {section === "connections" && <>{capabilityCatalog}<section className="cp-panel cp-durable-card"><h2>Business systems</h2><article className="saved-workspace-row"><div><h3><Database size={18} aria-hidden="true" /> Sample pricing record</h3><p>{discount ? "Saved pricing policy loaded. This is not a live customer database connection." : "Current configuration unavailable."}</p></div><Link prefetch={false} className="cp-button" href="/control-plane/actions?workflow=discounts">Review boundary</Link></article>{(["crm", "email"] as const).map(c => <article className="saved-workspace-row" key={c}><div><h3>{c === "crm" ? <><Database size={18} aria-hidden="true" /> Customer-record twin</> : <><Mail size={18} aria-hidden="true" /> Messaging twin</>}</h3><p>{connectors ? connectors.policies.find(p => p.connector === c)?.active ? "Sample policy active; this is not a provider health or live-delivery check." : "No active sample policy is confirmed." : "Current configuration unavailable."}</p></div><Link prefetch={false} className="cp-button" href={`/control-plane/actions?workflow=${c}`}>Review boundary</Link></article>)}</section><section className="cp-panel cp-durable-card"><h2>Agent platforms</h2>{["AWS AgentCore", "Microsoft Foundry", "Google Vertex AI"].map(p => <article className="saved-workspace-row" key={p}><div><h3><Cloud size={18} aria-hidden="true" /> {p}</h3><span className="saved-workspace-badge">Not connected in this deployment</span><p>Discovery, owner review, and a verified controlled path require separate onboarding.</p></div><Link prefetch={false} className="cp-button" href="/contact-sales">Discuss onboarding</Link></article>)}</section><section className="cp-panel cp-durable-card"><h2>Model planning</h2><p>When authorized model access is available, the bounded quote planner prepares a proposal. It does not approve or execute actions. Model availability is not established by this connection summary.</p><Link prefetch={false} className="cp-button" href="/control-plane/quotes">Open bounded planner</Link></section></>}
  </div>;
}
