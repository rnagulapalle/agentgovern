"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, Bot, ChevronRight, Cloud, Eye, FileText, RefreshCw, ScanLine, Search, ShieldCheck } from "lucide-react";
import type { ActivityReference } from "@/lib/workspace/cloud-activity";
import type { WorkflowTelemetryWindow } from "@/lib/workspace/workflow-telemetry";
import { telemetryOutcomeGroup, telemetryRequestLabel, telemetryRuns, telemetrySteps, telemetryStepCopy } from "@/lib/workspace/workflow-telemetry-view";
import { workspaceJson } from "@/lib/workspace/response";
import { agentPresentation } from "@/lib/workspace/presentation";
import { Modal, PageTitle } from "./ui";
import { AwsExecutionBrowser } from "./aws-execution-browser";
import { AwsWorkflowHistory } from "./aws-workflow-history";
import { ExternalWorkflowApprovals } from "./external-workflow-approvals";
import { AgentsWorkspace } from "./agents-workspace";
import { SavedWorkspace } from "./saved-workspace";
import { DurableWorkspace } from "./durable-workspace";
import { ConnectorActionsWorkspace } from "./connector-actions-workspace";
import "./control-center.css";
import "./discovery-workspace.css";

type Enrollment = { displayName: string; owner: string; logGroup: string; enrolledAt: string };
type History = WorkflowTelemetryWindow & { checkedAt: string; enrollment: Enrollment };
type CloudAgent = { key: string; name: string; account: string; region: string; reference: ActivityReference; stale: boolean; enrollment: Enrollment | null; history: History | null; error: string | null };
type LocalAgent = { id: string; name: string | null; owner: string | null; active: boolean; tools: string[]; action_limit: number; reserved: number };
type Execution = { key: string; agent: CloudAgent; run: ReturnType<typeof telemetryRuns>[number] };
type Panel = { kind: "cloud"; agent: CloudAgent; view: string } | { kind: "execution" | "approval"; execution: Execution } | { kind: "local"; agent: LocalAgent } | { kind: "register" | "samples" | "connections" | "policy" };

async function read<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal, ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await workspaceJson(response);
  if (!response.ok) throw Error(value.error || "The saved view could not be read.");
  return value as T;
}

/** Reads existing contracts only. Cloud tools/authority are never inferred from a name. */
export function ControlCenter({ page, awsEnabled }: { page: "overview" | "agents" | "activity" | "approvals"; awsEnabled: boolean }) {
  const [agents, setAgents] = useState<CloudAgent[]>([]), [local, setLocal] = useState<LocalAgent[]>([]);
  const [loading, setLoading] = useState(true), [errors, setErrors] = useState<string[]>([]), [checked, setChecked] = useState<string | null>(null);
  const [query, setQuery] = useState(""), [agentFilter, setAgentFilter] = useState("all"), [outcome, setOutcome] = useState("all"), [channel, setChannel] = useState("all"), [hours, setHours] = useState(24);
  const [panelState, setPanel] = useState<Panel | null>(null), [refresh, setRefresh] = useState(0), [attention, setAttention] = useState(false);
  const onRefresh = useCallback(() => setRefresh(n => n + 1), []);
  const generation = useRef(0);
  useEffect(() => {
    const controller = new AbortController(), sequence = ++generation.current;
    const failures: string[] = [];
    setLoading(true); setErrors([]); setChecked(null);
    const current = () => !controller.signal.aborted && sequence === generation.current;
    async function load() {
      try {
        const directory = await read<{ agents: LocalAgent[] }>("/api/workspace/agents", undefined, controller.signal);
        if (!Array.isArray(directory.agents) || directory.agents.some(a => !a || typeof a.id !== "string" || !Array.isArray(a.tools) || a.tools.some(t => typeof t !== "string") || typeof a.active !== "boolean")) throw Error("Agent directory could not be confirmed.");
        if (current()) setLocal(directory.agents);
      } catch (e) { if (current()) setLocal([]); failures.push(`Sample agents: ${e instanceof Error ? e.message : "Unavailable"}`); }
      if (awsEnabled) try {
        const accounts = await read<{ connections: { scope: { connectionId: string; accountId: string; region: string } }[]; truncated?: boolean }>("/api/workspace/discovery", undefined, controller.signal);
        if (!Array.isArray(accounts.connections)) throw Error("AWS connections could not be confirmed.");
        if (accounts.truncated || accounts.connections.length > 10) failures.push("Showing up to 10 AWS accounts. Open Connections for the remaining inventory.");
        const cloud: CloudAgent[] = [];
        // Bounded reads protect shared connection throttles. No discovery scan or setup mutation.
        for (const connection of accounts.connections.slice(0, 10)) {
          const scope = connection.scope;
          try {
            const inventory = await read<{ status: string; scanId: string; stale: boolean; historyTruncated?: boolean; records: { record: { resourceArn: string; resourceId: string; version: string }; stale: boolean; observedInCurrentScan: boolean }[] }>(`/api/workspace/discovery?connectionId=${encodeURIComponent(scope.connectionId)}`, undefined, controller.signal);
            if (!Array.isArray(inventory.records)) throw Error("Inventory data could not be confirmed.");
            if (inventory.historyTruncated) failures.push(`AWS account …${scope.accountId.slice(-4)} inventory is partial.`);
            const latest = new Map<string, typeof inventory.records[number]>();
            for (const row of inventory.records) {
              const old = latest.get(row.record.resourceArn);
              if (!old || row.observedInCurrentScan && !old.observedInCurrentScan || row.observedInCurrentScan === old.observedInCurrentScan && Number(row.record.version) > Number(old.record.version)) latest.set(row.record.resourceArn, row);
            }
            if (latest.size > 5) failures.push(`Showing up to 5 deployments in AWS account …${scope.accountId.slice(-4)}. Review remaining deployments in Connections.`);
            for (const row of [...latest.values()].slice(0, 5)) {
              if (!current()) return;
              const reference = { connectionId: scope.connectionId, scanId: inventory.scanId, resourceArn: row.record.resourceArn, version: row.record.version };
              const a: CloudAgent = { key: JSON.stringify([scope.connectionId, reference.resourceArn]), name: row.record.resourceId.replace(/-[A-Za-z0-9]{10}$/, "").replaceAll("_", " "), account: scope.accountId, region: scope.region, reference, stale: inventory.stale || row.stale || !row.observedInCurrentScan, enrollment: null, history: null, error: null };
              try {
                const saved = await read<{ enrollment: Enrollment | null }>("/api/workspace/discovery/onboarding", { operation: "enrollment", ...reference }, controller.signal);
                a.enrollment = saved.enrollment;
                if (saved.enrollment) a.name = saved.enrollment.displayName;
                if (saved.enrollment && page !== "agents") {
                  a.history = await read<History>("/api/workspace/discovery/onboarding", { operation: "history", connectionId: reference.connectionId, resourceArn: reference.resourceArn, version: reference.version, hours }, controller.signal);
                  if (!Array.isArray(a.history.events)) throw Error("History data could not be confirmed.");
                }
              } catch (e) { a.history = null; a.error = e instanceof Error ? e.message : "Agent connection unavailable."; }
              cloud.push(a);
              if (current()) setAgents([...cloud]);
            }
          } catch (e) { failures.push(`AWS account …${scope.accountId.slice(-4)}: ${e instanceof Error ? e.message : "Unavailable"}`); }
        }
        if (current()) setAgents(cloud);
      } catch (e) { if (current()) setAgents([]); failures.push(`AWS: ${e instanceof Error ? e.message : "Unavailable"}`); }
      if (current()) { setErrors(failures); setLoading(false); setChecked(new Date().toISOString()); }
    }
    void load();
    return () => controller.abort();
  }, [awsEnabled, page, refresh, hours]);
  const executions: Execution[] = agents.flatMap(agent => agent.history ? telemetryRuns(agent.history).map(run => ({ key: JSON.stringify([agent.key, agent.reference.version, run.id]), agent, run })) : []).sort((a,b) => b.run.lastObservedAt.localeCompare(a.run.lastObservedAt));
  let panel = panelState;
  if (panel && (panel.kind === "execution" || panel.kind === "approval")) {
    const selectedKey = panel.execution.key;
    panel = { ...panel, execution: executions.find(e => e.key === selectedKey) || panel.execution };
  }
  const needsAttention = executions.filter(e => ["attention", "waiting"].includes(telemetryOutcomeGroup(e.run)));
  const q = query.trim().toLowerCase();
  const filtered = executions.filter(e => (agentFilter === "all" || e.agent.key === agentFilter) && (outcome === "all" || telemetryOutcomeGroup(e.run) === outcome) && (channel === "all" || e.run.trigger === channel) && (!attention || ["attention", "waiting"].includes(telemetryOutcomeGroup(e.run))) && [e.agent.name, e.run.id, ...e.run.quoteIds, telemetryRequestLabel(e.run)].join(" ").toLowerCase().includes(q));
  const cloudRows = agents.filter(a => [a.name, a.account, a.enrollment?.owner].join(" ").toLowerCase().includes(q));
  const localRows = local.filter(a => [a.name, a.owner, agentPresentation(a.tools).action].join(" ").toLowerCase().includes(q));
  const openCloud = (agent: CloudAgent) => setPanel({ kind: "cloud", agent, view: "summary" });
  function rows(items: Execution[]) {
    return <div className="cc-list" aria-label="Execution history"><div className="cc-execution-head" aria-hidden="true"><span>Request / context</span><span>Agent / channel</span><span>Outcome / last event</span></div>{items.map(e => <button type="button" className="cc-execution-row" key={e.key} onClick={() => setPanel({ kind: "execution", execution: e })}>
      <span className="cc-identity"><FileText size={18} aria-hidden="true"/><span><strong>{telemetryRequestLabel(e.run)}</strong><small>{e.run.quoteIds.length ? e.run.quoteIds.join(" · ") : "Quote reference not shared"}</small></span></span>
      <span>{e.agent.name}<small className="cc-channel">{e.run.trigger}</small></span><span><span className="cc-outcome" data-tone={telemetryOutcomeGroup(e.run)}>{e.run.status}</span><small>{new Date(e.run.lastObservedAt).toLocaleString()}</small></span><ChevronRight size={16} aria-hidden="true"/>
    </button>)}{!items.length && <p className="cc-empty">{loading ? "Reading connected activity…" : errors.length || agents.some(a => a.error) ? "Activity could not be fully checked. Missing rows do not mean there is no work." : "No executions in this loaded view. Unconnected agents and unsupported events are not included."}</p>}</div>;
  }
  return <div className="cc-workspace cp-durable">
    <PageTitle eyebrow="CONTROL WORKSPACE" title={page === "overview" ? "Overview" : page === "agents" ? "Agents" : page === "approvals" ? "Approvals" : "Activity"} description={page === "overview" ? "See what needs attention and follow your agents’ work." : page === "agents" ? "Understand each agent’s owner, connected history and action boundaries." : page === "approvals" ? "Review the exact change, why it is held and the workflow’s saved decision." : "Follow each request from arrival to its reported outcome."} action={<button className="cp-button secondary" disabled={loading} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true"/>{loading ? "Reading…" : "Refresh"}</button>}/>
    {errors.map(error => <p role="alert" className="cp-durable-message is-error" key={error}>{error}</p>)}
    {agents.filter(a => a.error).map(a => <p role="alert" className="cp-durable-message is-error" key={a.key}>{a.name}: {a.error}</p>)}
    {checked && <p className="cc-scope">Checked {new Date(checked).toLocaleTimeString()} · On-demand read · Coverage is limited to connected sources and loaded records.</p>}
    {page === "overview" && <>
      <section className="cc-section"><div className="cc-section-heading"><h2><ScanLine size={18} aria-hidden="true"/>Needs attention</h2><Link href="/control-plane/activity">View activity <ArrowRight size={14}/></Link></div>{rows(needsAttention.slice(0,5))}<p className="cc-scope">Connected AWS executions only. Sample and quote-plan approvals are checked separately.</p><button className="cc-link" onClick={()=>setPanel({kind:"samples"})}>Review sample decisions and outcomes <ChevronRight size={14}/></button></section>
      <section className="cc-section"><div className="cc-section-heading"><h2><Activity size={18} aria-hidden="true"/>Recent activity</h2></div>{rows(executions.slice(0,5))}</section>
      <section className="cc-section"><div className="cc-section-heading"><h2><Bot size={18} aria-hidden="true"/>Agent coverage</h2><Link href="/control-plane/agents">View agents <ArrowRight size={14}/></Link></div><div className="cc-coverage"><span><strong>{loading ? "—" : agents.length}</strong>AWS deployments in this view</span><span><strong>{loading ? "—" : agents.filter(a=>a.enrollment).length}</strong>Saved observation enrollments</span><span><Eye size={23} aria-hidden="true"/>Execution enforcement not established</span></div></section>
      <div className="cc-setup"><div><h2>Connect the next agent</h2><p>Discover it in AWS, assign an owner and connect the history it provides.</p></div><button className="cp-button" onClick={()=>setPanel({kind:"connections"})}><Cloud size={16}/>Review connections</button></div>
    </>}
    {page === "agents" && <>
      <div className="cc-toolbar"><label className="cc-search"><Search size={16}/><input aria-label="Search agents" placeholder="Search name or owner" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="cc-actions">{awsEnabled && <Link className="cp-button cp-button-dark" href="/control-plane/discovery"><Cloud size={15}/>Connect AWS agent</Link>}<button className="cp-button" onClick={()=>setPanel({kind:"register"})}>Register sample agent</button></div></div>
      <section className="cc-section"><h2>Cloud agents</h2><p className="cc-scope">Latest observed version per saved AWS deployment. Review older retained versions in Connections. Purpose and tools are not inferred from its name.</p><div className="cc-list">{cloudRows.map(a=><button type="button" className="cc-agent-row" key={a.key} onClick={()=>openCloud(a)}><span className="cc-identity"><Bot size={21}/><span><strong>{a.name}</strong><small>Purpose not supplied by this discovery contract</small></span></span><span>{a.enrollment?.owner || "Owner not confirmed"}<small>AWS · {a.region} · …{a.account.slice(-4)}</small></span><span>{a.error ? "Connection needs attention" : a.enrollment ? "Onboarding saved" : "Discovered only"}<small>{a.stale ? "Inventory refresh required" : "Inventory observed"} · enforcement unverified</small></span><ChevronRight size={16}/></button>)}{!cloudRows.length&&<p className="cc-empty">{loading ? "Reading saved AWS inventory…" : "No AWS deployments in this view. Connect an account or review discovery."}</p>}</div></section>
      <section className="cc-section"><h2>Sample agents</h2><p className="cc-scope">These registered identities act on sample records or simulated systems. They are separate from discovered AWS deployments.</p><div className="cc-list">{localRows.map(a=><button className="cc-agent-row" key={a.id} onClick={()=>setPanel({kind:"local",agent:a})}><span className="cc-identity"><Bot size={21}/><span><strong>{a.name || "Unnamed sample agent"}</strong><small>{agentPresentation(a.tools).action}</small></span></span><span>{a.owner || "Owner not supplied"}<small>Sample system</small></span><span>{a.active ? "Active identity" : "Paused identity"}<small>{a.reserved} of {a.action_limit} lifetime requests used</small></span><ChevronRight size={16}/></button>)}</div></section>
    </>}
    {page === "activity" && <>
      <div className="cc-toolbar"><div className="cc-tabs"><button aria-pressed={!attention} onClick={()=>setAttention(false)}>All activity</button><button aria-pressed={attention} onClick={()=>setAttention(true)}>Needs attention <span>{needsAttention.length}</span></button></div><label className="cc-search"><Search size={16}/><input type="search" aria-label="Search activity" placeholder="Search request or quote" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      <div className="cc-filters"><label>Agent<select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}><option value="all">All loaded AWS agents</option>{agents.map(a=><option key={a.key} value={a.key}>{a.name} · …{a.account.slice(-4)}</option>)}</select></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="all">All outcomes</option><option value="waiting">Awaiting approval</option><option value="attention">Needs verification / review</option><option value="completed">Completed</option><option value="blocked">Blocked or rejected</option></select></label><label>Channel<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">All channels</option><option value="slack">Slack</option><option value="email">Email</option><option value="internal">Internal</option></select></label><label>Time window<select value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={1}>Last hour</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option></select></label></div>
      <p className="cc-scope">{filtered.length} executions · Latest event first. {agents.filter(a=>a.history).length} connected sources read. Reported outcomes are not independently verified effects.</p>{rows(filtered)}
      <details className="cc-evidence"><summary>History coverage and source gaps</summary>{agents.map(a=><p key={a.key}>{a.name}: {a.history ? `${a.history.completeness}; ${a.history.unsupportedRecords} unsupported records; ${a.history.duplicateDeliveries} duplicate deliveries removed; ${a.history.failures.length} read/validation failures.` : a.enrollment ? "History unavailable in this read." : "History not connected."}</p>)}<p>This view does not subscribe to a live event stream. Refresh to read newer events. No amount, request text or tool permission is invented when the source omits it.</p></details>
      <button className="cc-link" onClick={()=>setPanel({kind:"samples"})}>Sample decisions and workflow history <ChevronRight size={14}/></button>
    </>}
    {page === "approvals" && <><section className="cc-section"><h2>Waiting in connected workflow history</h2>{rows(executions.filter(e=>telemetryOutcomeGroup(e.run)==="waiting"))}<p className="cc-scope">History may lag the workflow’s current decision. Open shared approvals to check the authoritative request.</p></section><section className="cc-section"><h2>Shared approval connections</h2>{agents.filter(a=>a.enrollment).map(a=><button className="cc-link" key={a.key} onClick={()=>setPanel({kind:"cloud",agent:a,view:"approvals"})}><ShieldCheck size={16}/>{a.name} · review shared approvals <ChevronRight size={14}/></button>)}</section><details><summary>Sample-system decisions</summary><SavedWorkspace section="approvals"/></details></>}
    {panel && <Modal drawer wide title={panel.kind === "cloud" ? panel.agent.name : panel.kind === "local" ? panel.agent.name || "Sample agent" : panel.kind === "execution" ? "Execution details" : panel.kind === "approval" ? "Review workflow approval" : panel.kind === "register" ? "Register a sample agent" : panel.kind === "connections" ? "Connections" : panel.kind === "policy" ? "Policies" : "Sample decisions and outcomes"} onClose={()=>setPanel(null)}>
      <div className="cc-workspace cc-panel-content">
      {panel.kind === "cloud" && <>
        <div className="cc-tabs">{["summary","activity","approvals","setup"].map(value=><button key={value} aria-pressed={panel.view===value} onClick={()=>setPanel({...panel,view:value})}>{value === "summary" ? "Summary & tools" : value === "activity" ? "Activity" : value === "approvals" ? "Approvals" : "Name, owner & source"}</button>)}</div>
        <div hidden={panel.view!=="summary"}><div className="cc-section"><h3>Purpose & ownership</h3><p>Purpose has not been provided by the current AWS discovery contract.</p><dl className="cc-facts"><div><dt>Accountable owner</dt><dd>{panel.agent.enrollment?.owner || "Not confirmed"}</dd></div><div><dt>Platform</dt><dd>AWS AgentCore · {panel.agent.region}</dd></div><div><dt>History setup</dt><dd>{panel.agent.enrollment ? "Onboarding saved; current read checked separately" : "Not connected"}</dd></div><div><dt>Execution enforcement</dt><dd>Not verified</dd></div></dl></div><section className="cc-section"><h3>Observed actions & tools</h3><p>Discovery does not expose the agent’s complete tool inventory or effective permissions.</p>{panel.agent.history ? [...new Map(telemetryRuns(panel.agent.history).flatMap(run=>telemetrySteps(run.events).filter(step=>step.action).map(step=>[step.first.actionName,telemetryStepCopy(step)] as const))).values()].map(copy=><p key={copy.title}><strong>{copy.title}</strong> · {copy.provider || "System not reported"}<small>Observed in connected activity; authority not verified.</small></p>) : <p>Open Activity to read the connected workflow’s reported tool steps.</p>}</section><details><summary>Technical identity</summary><p className="cc-reference">{panel.agent.reference.resourceArn}</p><p>Version {panel.agent.reference.version} · AWS account {panel.agent.account}</p></details></div>
        {panel.view==="approvals" ? <ExternalWorkflowApprovals reference={panel.agent.reference} onDecision={onRefresh}/> : panel.view!=="summary" && <AwsWorkflowHistory reference={panel.agent.reference} name={panel.agent.name}/>}
      </>}
      {(panel.kind === "execution" || panel.kind === "approval") && <>
        <p className="cc-scope">{panel.execution.agent.name} · AWS · {panel.execution.agent.region}</p>
        {panel.kind === "execution" ? <><AwsExecutionBrowser key={panel.execution.key} runs={[panel.execution.run]} runtimeVersion={panel.execution.agent.reference.version} initialSelectedId={panel.execution.run.id} detailsOnly onQuote={id=>{setQuery(id);setPanel(null);}}/><button className="cp-button" onClick={()=>setPanel({kind:"approval",execution:panel.execution})}><ShieldCheck size={16}/>Review this execution’s approvals</button></> : <><button className="cc-link" onClick={()=>setPanel({kind:"execution",execution:panel.execution})}>Back to execution</button><ExternalWorkflowApprovals reference={panel.execution.agent.reference} runId={panel.execution.run.id} onDecision={onRefresh}/></>}
      </>}
      {panel.kind === "local" && <><dl className="cc-facts"><div><dt>Owner</dt><dd>{panel.agent.owner || "Not supplied"}</dd></div><div><dt>Allowed action</dt><dd>{agentPresentation(panel.agent.tools).action}</dd></div></dl><p>Sample system. Existing server permission and approval rules still apply.</p>{panel.agent.tools.includes("twin.crm") ? <ConnectorActionsWorkspace connector="crm"/> : panel.agent.tools.includes("twin.email") ? <ConnectorActionsWorkspace connector="email"/> : panel.agent.tools.includes("proof.discount") ? <DurableWorkspace scriptDemo/> : <p>Open the original installed workflow to review this agent’s supported operations.</p>}</>}
      {panel.kind === "register" && <AgentsWorkspace scriptDemo/>}
      {panel.kind === "connections" && <SavedWorkspace section="connections" awsConnections={awsEnabled}/>}
      {panel.kind === "policy" && <SavedWorkspace section="policies" awsConnections={awsEnabled}/>}
      {panel.kind === "samples" && <><SavedWorkspace section="approvals"/><details><summary>Installed sample workflows and history</summary><SavedWorkspace section="workflows"/></details></>}
      </div>
    </Modal>}
    <p className="cc-scope"><Eye size={14} aria-hidden="true"/>Visibility, shared approval decisions and execution enforcement are separate capabilities. AWS is the connected cloud platform in this release.</p>
  </div>;
}
