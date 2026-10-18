"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Database, Mail, ShieldCheck } from "lucide-react";
import { workspaceJson } from "@/lib/workspace/response";
import type { Snapshot } from "@/lib/durable/contracts";
import { CONNECTORS, type ConnectorAction } from "@/lib/connectors/contracts";
import { Modal, PageTitle } from "./ui";
import { DiscoveryWorkspace } from "./discovery-workspace";
import { ConnectionsDiscovery } from "./connections-discovery";
import { DurableWorkspace } from "./durable-workspace";
import { ConnectorActionsWorkspace } from "./connector-actions-workspace";
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
  workflows: ["Workflows", "Choose an installed sample workflow. Review its plan, request any required approval, then execute and verify each result."],
  approvals: ["Approvals", "Review the proposed change, the reason for approval and the person who requested it. Approval and execution are separate steps."],
  policies: ["Policies & access", "Understand the current boundaries before requesting a change."],
  connections: ["Connections", "See which systems are configured, which actions they support and which integrations are not yet available."],
  outputs: ["Output controls", "Understand which outgoing data checks are established for this deployment."],
  reconciliation: ["Reconciliation", "Check whether an action reached its system before trying it again."],
};
export function SavedWorkspace({ section, awsConnections = false }: { section: SavedWorkspaceSection; awsConnections?: boolean }) {
  const [discount, setDiscount] = useState<Snapshot | null>(null);
  const [connectors, setConnectors] = useState<ConnectorSummary | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedActionId, setSelectedActionId] = useState<string>();
  const [review, setReview] = useState<"aws" | "discounts" | "crm" | "email" | null>(null);
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
        <Link prefetch={false} className="cp-button" href={savedActionDestination(a)} onClick={event=>{event.preventDefault();setSelectedActionId(a.id);setReview("connector" in a && (a.connector === "crm" || a.connector === "email") ? a.connector : "discounts");}}>{a.state === "held" ? "Review request" : "View outcome"}</Link>
      </article>)}
    </section>;
  }
  const controlAreas = <section className="cp-panel cp-durable-card"><h2>Control areas</h2><div className="saved-workspace-control-areas">
    <article><h3>Action decisions</h3><p>Review the proposed change and its authority boundary.</p><Link prefetch={false} className="cp-button" href="/control-plane/approvals">Review decisions</Link></article>
    <article><h3>Execution</h3><p>Follow each step and stop new execution attempts when needed.</p><Link prefetch={false} className="cp-button" href="/control-plane/workflow-runs">View workflow runs</Link></article>
    <article><h3>Output controls</h3><p>Sample message checks are available. General content filtering and sensitive-data protection are not enabled.</p><Link prefetch={false} className="cp-button" href="/control-plane/outputs">View output controls</Link></article>
    <article><h3>Reconciliation</h3><p>Check whether an uncertain action reached its system.</p><Link prefetch={false} className="cp-button" href="/control-plane/reconciliation">Review uncertain outcomes</Link></article>
  </div></section>;
  const administrator = <section className="cp-panel cp-durable-card"><h2>Company administrator</h2><p>Both invited administrators share the installed company view. Team labels organize business ownership; they do not grant execution permission.</p><ul><li>Register supported agents and assign invited owners and action allowances.</li><li>Configure supported action boundaries, review exact requests, and execute authorized actions.</li><li>Inspect saved runs, verify uncertain effects, contain connectors, and export decision history.</li></ul><p>Administrator visibility does not permit self-approval, bypass a hard limit, change another workspace, or execute an unsupported action. Account invitations, cloud IAM administration, and billing management are not provided here.</p></section>;
  const capabilityCatalog = <section className="cp-panel cp-durable-card"><h2>Capabilities and availability</h2><p>Every product area is visible here. Availability describes this deployment; it grants no new authority.</p><div className="saved-workspace-control-areas">
    <article><h3>Agents and action boundaries</h3><span className="saved-workspace-badge">Installed · sample actions</span><p>Assign owners and define which actions each agent may request.</p><Link prefetch={false} className="cp-button" href="/control-plane/agents">Inspect agents</Link></article>
    <article><h3>Approvals and execution</h3><span className="saved-workspace-badge">Installed · saved controls</span><p>Review individual requests and keep later steps waiting for confirmed results.</p><Link prefetch={false} className="cp-button" href="/control-plane/approvals">Inspect approvals</Link></article>
    <article><h3>History and reconciliation</h3><span className="saved-workspace-badge">Installed · saved evidence</span><p>Review recorded changes and investigate uncertain outcomes.</p><Link prefetch={false} className="cp-button" href="/control-plane/reconciliation">View outcomes</Link></article>
    <article><h3>Chat and workflow planning</h3><span className="saved-workspace-badge">Sample quote planner</span><p>The installed quote planner prepares proposals. General chat workflow generation and inbox monitoring are unavailable.</p><Link prefetch={false} className="cp-button" href="/control-plane/quotes">View sample planner</Link></article>
    <article><h3>Cloud agent connections</h3><span className="saved-workspace-badge">{awsConnections ? "AWS · assisted setup" : "Unavailable in this deployment"}</span><p>{awsConnections ? "AWS inventory and bounded activity review are available with administrator-configured access. Action enforcement still needs a verified checkpoint." : "AWS, Microsoft and Google onboarding require a separately installed, verified integration. Discovery alone does not enforce actions."}</p></article>
    <article><h3>General output enforcement</h3><span className="saved-workspace-badge">Unavailable in this deployment</span><p>General content filtering and sensitive-data redaction are not enabled.</p><Link prefetch={false} className="cp-button" href="/control-plane/outputs">View output controls</Link></article>
  </div></section>;
  const workflows = <section className="cp-panel cp-durable-card"><h2>Installed sample workflows</h2>
    <article className="saved-workspace-row"><div><h3>Pricing decisions</h3><p>Allow a discount, hold an exception, or block a request beyond the hard limit.</p><span className="saved-workspace-badge">Sample record</span></div><Link prefetch={false} className="cp-button" href="/control-plane/actions?workflow=discounts">Open pricing controls</Link></article>
    <article className="saved-workspace-row"><div><h3>Distributor quote</h3><p>Prepare a sample quote. Review the quote change and customer confirmation as separate actions.</p><span className="saved-workspace-badge">Simulated systems</span></div><Link prefetch={false} className="cp-button" href="/control-plane/quotes">Open quote workspace</Link></article>
    <article className="saved-workspace-row"><div><h3>Customer handoff</h3><p>Verify a customer-record change before releasing its dependent acknowledgement.</p><span className="saved-workspace-badge">Simulated systems</span></div><Link prefetch={false} className="cp-button" href="/control-plane/workflow-runs">Open customer handoffs</Link></article>
  </section>;
  return <div className="cp-durable saved-workspace"><PageTitle eyebrow="CONTROL WORKSPACE" title={content[section][0]} description={content[section][1]} />
    <p className="saved-workspace-scope">{section === "connections" && awsConnections ? "AWS connections observe saved inventory and enrolled workflow activity. The sample business systems below use isolated simulated records." : "Sample records and isolated simulated systems. Decisions are saved on the server; no live customer records change or customer email is delivered."}</p>
    <button className="cp-button secondary" disabled={loading} onClick={() => void load()}>{section === "connections" ? "Refresh sample system status" : "Refresh saved status"}</button>
    {errors.map(e => <p role="alert" className="cp-durable-message is-error" key={e}>{e}</p>)}
    {errors.length > 0 && <p>Available rows are a partial view. Other requests may still need attention.</p>}
    {section === "overview" && <>{controlAreas}{queue("Needs approval", held, "No held requests among the loaded recent actions.")}{queue("Needs verification", unresolved, "No unresolved requests among the loaded recent actions.")}<p className="saved-workspace-scope">Quote-plan review is separate from this action queue. Open the quote workspace to check its saved plans.</p><div className="cp-durable-grid"><section className="cp-panel cp-durable-card"><h2>Register an agent</h2><p>{awsConnections ? "Assign a named owner and an allowed sample action. AWS agent inventory is reviewed separately from execution grants." : "Assign a named owner and an allowed sample action. Cloud discovery and import are not enabled in this deployment."}</p><Link prefetch={false} className="cp-button" href="/control-plane/agents">View agents</Link></section><section className="cp-panel cp-durable-card"><h2>Check your connections</h2><p>See the installed sample systems and the setup still needed for cloud platforms.</p><Link prefetch={false} className="cp-button" href="/control-plane/connectors">Review connections</Link></section></div>{workflows}{capabilityCatalog}</>}
    {section === "approvals" && <>{queue("Requests needing approval", held, "No held requests among the loaded recent actions.")}<section className="cp-panel cp-durable-card"><h2>Quote-plan decisions</h2><p>Quote updates and confirmations have their own exact approvals. They are not included in the sample action list above.</p><Link prefetch={false} className="cp-button" href="/control-plane/quotes">Review saved quote plans</Link></section></>}
    {section === "workflows" && <>{workflows}<p>General workflow generation, live inbox monitoring, and live customer adapters are not available in this deployment.</p></>}
    {section === "outputs" && <section className="cp-panel cp-durable-card"><h2>General output enforcement is not enabled</h2><p>The installed workflows record exact prepared messages and provider-twin acceptance. They do not establish general content filtering, sensitive-data redaction, or control over every model response.</p><p>Connecting a model or discovering an agent does not enable these protections. A supported output contract and verified enforcement path are required.</p><Link prefetch={false} className="cp-button" href="/control-plane/workflows">Review installed workflows</Link></section>}
    {section === "reconciliation" && <>{queue("Unresolved action outcomes", unresolved, "No unresolved requests among the loaded recent actions.")}<p>Containment stops new execution attempts; it does not undo an accepted change. If the result is unknown, check the system before trying again.</p></>}
    {section === "policies" && <>{administrator}<section className="cp-panel cp-durable-card"><h2>Control coverage</h2><p>Inspect outgoing-data coverage, uncertain outcomes and the installed sample workflows.</p><div className="cp-durable-buttons"><Link prefetch={false} className="cp-button" href="/control-plane/outputs">Output controls</Link><Link prefetch={false} className="cp-button" href="/control-plane/reconciliation">Outcome review</Link><Link prefetch={false} className="cp-button" href="/control-plane/workflows">Sample workflows</Link><Link prefetch={false} className="cp-button" href="/control-plane/history">Saved decisions</Link></div></section><section className="cp-panel cp-durable-card"><h2><ShieldCheck size={18} aria-hidden="true" /> Sample pricing rule</h2>{discount ? <dl className="saved-workspace-facts"><dt>Allow</dt><dd>Sample discount up to {discount.policy.auto_limit}%</dd><dt>Independent approval</dt><dd>Above {discount.policy.auto_limit}%, up to {discount.policy.hard_limit}%</dd><dt>Block</dt><dd>Above {discount.policy.hard_limit}%</dd><dt>Policy version</dt><dd>{discount.policy.version}</dd></dl> : <p>{loading ? "Loading pricing rules…" : "Current pricing policy is unavailable. Refresh to try again."}</p>}<p>Approval binds to the exact request and current policy. A requester cannot approve their own exception.</p><Link prefetch={false} className="cp-button" href="/control-plane/actions?workflow=discounts">Review pricing rules and requests</Link></section><section className="cp-panel cp-durable-card"><h2>Customer actions</h2><p>CRM updates and messages need separate exact approvals. The message cannot bypass the verified CRM dependency.</p><p>This summary grants no permissions and changes no rules.</p></section></>}
    {section === "connections" && <><ConnectionsDiscovery enabled={awsConnections}/><section className="cp-panel cp-durable-card"><h2>Business systems</h2><article className="saved-workspace-row"><div><h3><Database size={18} aria-hidden="true" /> Sample pricing record</h3><p>{discount ? "Sample pricing rules loaded. No live customer database is connected." : loading ? "Loading configuration…" : "Configuration could not be confirmed. Refresh to try again."}</p></div><Link prefetch={false} className="cp-button" href="/control-plane/actions?workflow=discounts">Review boundary</Link></article>{(["crm", "email"] as const).map(c => <article className="saved-workspace-row" key={c}><div><h3>{c === "crm" ? <><Database size={18} aria-hidden="true" /> Simulated customer records</> : <><Mail size={18} aria-hidden="true" /> Simulated customer messages</>}</h3><p>{connectors ? connectors.policies.find(p => p.connector === c)?.active ? "Sample requests are enabled. Connection health and real delivery have not been checked." : "An active request policy has not been confirmed." : loading ? "Loading configuration…" : "Configuration could not be confirmed. Refresh to try again."}</p></div><Link prefetch={false} className="cp-button" href={`/control-plane/actions?workflow=${c}`}>Review boundary</Link></article>)}</section></>}
    {review && <Modal drawer wide title={review === "aws" ? "AWS connection" : "Review sample actions"} onClose={()=>setReview(null)}>{review === "aws" ? <DiscoveryWorkspace awsOnly/> : review === "crm" || review === "email" ? <ConnectorActionsWorkspace connector={review} selectedActionId={selectedActionId}/> : <DurableWorkspace scriptDemo selectedActionId={selectedActionId}/>}</Modal>}
  </div>;
}
