"use client";

import Link from "next/link";
import { RuntimeMetadata } from "./runtime-metadata";
import type { CloudRuntimeMetadata } from "@/lib/workspace/cloud-runtime-metadata";
import { CompanyScope,AgentBusinessEditor,useCompany } from "./company-workspace";
import {businessDisplay,displayScopeMatches} from "@/lib/workspace/business-display";
import {executionReference} from "@/lib/workspace/execution-reference";
import { businessScopeMatches } from "@/lib/workspace/company-profile-contract";
import type { ExternalApproval } from "@/lib/workspace/external-approvals";
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
type ApprovalRead = { connected:boolean; requests:ExternalApproval[] };
type ApprovalSource={reference:ActivityReference;read:ApprovalRead};
type CloudAgent = { references:ActivityReference[]; approvalSources?:ApprovalSource[]; declaredMetadata?: CloudRuntimeMetadata | null; key: string; name: string; account: string; region: string; reference: ActivityReference; stale: boolean; enrollment: Enrollment | null; history: History | null; error: string | null; approvals?:ApprovalRead; approvalError?:string };
type LocalAgent = { id: string; name: string | null; owner: string | null; active: boolean; tools: string[]; action_limit: number; reserved: number };
type Execution = { key: string; agent: CloudAgent; run: ReturnType<typeof telemetryRuns>[number] };
type Panel = { kind: "cloud"; agent: CloudAgent; view: string; approvalReference?:ActivityReference } | { kind: "execution" | "approval"; execution: Execution } | { kind: "local"; agent: LocalAgent } | { kind: "register" | "samples" | "connections" | "policy" };

async function read<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal, ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await workspaceJson(response);
  if (!response.ok) throw Error(value.error || "The saved view could not be read.");
  return value as T;
}

/** Reads existing contracts only. Cloud tools/authority are never inferred from a name. */
export function ControlCenter({ page, awsEnabled }: { page: "overview" | "agents" | "activity" | "approvals" | "policies"; awsEnabled: boolean }) {
  const {snapshot:company,scope:businessScope,setScope,setSources}=useCompany();
  const profile=company?.profile??null;
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
            const inventory = await read<{ status: string; scanId: string; stale: boolean; historyTruncated?: boolean; records: { record: { resourceArn: string; resourceId: string; version: string; declaredMetadata?: CloudRuntimeMetadata | null }; stale: boolean; observedInCurrentScan: boolean }[] }>(`/api/workspace/discovery?connectionId=${encodeURIComponent(scope.connectionId)}`, undefined, controller.signal);
            if (!Array.isArray(inventory.records)) throw Error("Inventory data could not be confirmed.");
            if (inventory.historyTruncated) failures.push(`AWS account …${scope.accountId.slice(-4)} inventory is partial.`);
            const latest = new Map<string, typeof inventory.records[number]>();
            for (const row of inventory.records) {
              const old = latest.get(row.record.resourceArn);
              if (!old || row.observedInCurrentScan && !old.observedInCurrentScan || row.observedInCurrentScan === old.observedInCurrentScan && Number(row.record.version) > Number(old.record.version)) latest.set(row.record.resourceArn, row);
            }
            for (const row of latest.values()) {
              if (!current()) return;
              const reference = { connectionId: scope.connectionId, scanId: inventory.scanId, resourceArn: row.record.resourceArn, version: row.record.version };
              const references=inventory.records.filter(r=>r.record.resourceArn===reference.resourceArn).map(r=>({...reference,version:r.record.version})).filter((r,i,all)=>all.findIndex(v=>v.version===r.version)===i);
              const a: CloudAgent = { references, declaredMetadata: row.record.declaredMetadata, key: JSON.stringify([scope.connectionId, reference.resourceArn]), name: row.record.resourceId.replace(/-[A-Za-z0-9]{10}$/, "").replaceAll("_", " "), account: scope.accountId, region: scope.region, reference, stale: inventory.stale || row.stale || !row.observedInCurrentScan, enrollment: null, history: null, error: null };
              try {
                const saved = await read<{ enrollment: Enrollment | null }>("/api/workspace/discovery/onboarding", { operation: "enrollment", ...reference }, controller.signal);
                a.enrollment = saved.enrollment;
                if (saved.enrollment) a.name = saved.enrollment.displayName;
                if (saved.enrollment && page !== "agents") {
                  a.history = await read<History>("/api/workspace/discovery/onboarding", { operation: "history", connectionId: reference.connectionId, resourceArn: reference.resourceArn, version: reference.version, hours }, controller.signal);
                  if (!Array.isArray(a.history.events)) throw Error("History data could not be confirmed.");
                }
              } catch (e) { a.history = null; a.error = e instanceof Error ? e.message : "Agent connection unavailable."; }
              if(page==="overview"||page==="approvals") {
                a.approvalSources=[];
                for(const ref of references)try {
                  const enrolled=ref.version===reference.version?{enrollment:a.enrollment}:await read<{enrollment:Enrollment|null}>("/api/workspace/discovery/onboarding",{operation:"enrollment",...ref},controller.signal);
                  if(!enrolled.enrollment)continue;
                  const approvals=await read<ApprovalRead>("/api/workspace/discovery/approvals",{operation:"list",connectionId:ref.connectionId,resourceArn:ref.resourceArn,version:ref.version},controller.signal);
                  if(typeof approvals.connected!=="boolean"||!Array.isArray(approvals.requests))throw Error("Approval data could not be confirmed.");
                  a.approvalSources.push({reference:ref,read:approvals});
                  if(ref.version===reference.version)a.approvals=approvals;
                }catch(e){a.approvalError=e instanceof Error?e.message:"Approval source unavailable.";}
              }
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
  useEffect(()=>{setSources(agents.map(a=>({key:a.key,metadata:a.declaredMetadata})));},[agents,setSources]);
  const display=(a:CloudAgent)=>businessDisplay(profile,a.key,a.declaredMetadata);
  const scopedAgents=agents.filter(a=>displayScopeMatches(display(a),businessScope));
  const executionSources=scopedAgents;
  const pendingRequests=scopedAgents.flatMap(agent=>((agent.approvalSources??[]).flatMap(s=>s.read.requests.map(request=>({...request,approvalReference:s.reference})))).filter(a=>a.status==="pending"&&Date.parse(a.expiresAt)>Date.now()).map(request=>({agent,request})));
  const approvalUnknown=errors.length>0||scopedAgents.some(a=>Boolean(a.error||a.approvalError)||!a.approvalSources?.length||a.approvalSources.some(s=>!s.read.connected));
  const executions: Execution[] = executionSources.flatMap(agent => agent.history ? telemetryRuns(agent.history).map(run => ({ key: JSON.stringify([agent.key, agent.reference.version, run.id]), agent, run })) : []).sort((a,b) => b.run.lastObservedAt.localeCompare(a.run.lastObservedAt));
  let panel = panelState;
  if(panel?.kind==='cloud'){const selected=panel.agent;panel={...panel,agent:agents.find(a=>a.key===selected.key&&a.reference.version===selected.reference.version)||selected};}
  if (panel && (panel.kind === "execution" || panel.kind === "approval")) {
    const selectedKey = panel.execution.key;
    panel = { ...panel, execution: executions.find(e => e.key === selectedKey) || panel.execution };
  }
  const selectedCloud=panel?.kind==='cloud'?panel:null;
  const cloudApprovalRef=selectedCloud?(selectedCloud.approvalReference??selectedCloud.agent.approvalSources?.find(s=>s.read.connected)?.reference??(selectedCloud.agent.history?executionReference(selectedCloud.agent.history.events,selectedCloud.agent.references):null)??selectedCloud.agent.reference):null;
  const needsAttention = executions.filter(e => ["attention", "waiting"].includes(telemetryOutcomeGroup(e.run)));
  const q = query.trim().toLowerCase();
  const filtered = executions.filter(e => (agentFilter === "all" || e.agent.key === agentFilter) && (outcome === "all" || telemetryOutcomeGroup(e.run) === outcome) && (channel === "all" || e.run.trigger === channel) && (!attention || ["attention", "waiting"].includes(telemetryOutcomeGroup(e.run))) && [e.agent.name, e.run.id, ...e.run.quoteIds, telemetryRequestLabel(e.run)].join(" ").toLowerCase().includes(q));
  const cloudRows = scopedAgents.filter(a => [a.name,a.account,a.enrollment?.owner,a.declaredMetadata?.owner,display(a).team,display(a).department].join(" ").toLowerCase().includes(q));
  const localRows = local.filter(a => businessScopeMatches(profile,`sample:${a.id}`,businessScope)).filter(a => [a.name, a.owner, agentPresentation(a.tools).action].join(" ").toLowerCase().includes(q));
  function updateHistory(agent:CloudAgent,history:History){setAgents(all=>all.map(a=>a.key===agent.key&&a.reference.version===agent.reference.version?{...a,history,error:null}:a));}
  const openCloud = (agent: CloudAgent) => {
    setPanel({kind:"cloud",agent,view:"summary"});
    if(agent.enrollment&&!agent.history){const n=generation.current;void read<History>("/api/workspace/discovery/onboarding",{operation:"history",connectionId:agent.reference.connectionId,resourceArn:agent.reference.resourceArn,version:agent.reference.version,hours}).then(h=>{if(n===generation.current)updateHistory(agent,h);}).catch(e=>{if(n===generation.current)setAgents(all=>all.map(a=>a.key===agent.key?{...a,error:e instanceof Error?e.message:"History unavailable"}:a));});}
  };
  function rows(items: Execution[]) {
    return <div className="cc-list" aria-label="Execution history"><div className="cc-execution-head" aria-hidden="true"><span>Request / context</span><span>Agent / channel</span><span>Outcome / last event</span></div>{items.map(e => <button type="button" className="cc-execution-row" key={e.key} onClick={() => setPanel({ kind: "execution", execution: e })}>
      <span className="cc-identity"><FileText size={18} aria-hidden="true"/><span><strong>{telemetryRequestLabel(e.run)}</strong><small>{e.run.quoteIds.length ? e.run.quoteIds.join(" · ") : "Business record reference not shared"}</small></span></span>
      <span>{e.agent.name}<small>{display(e.agent).team||"Team not assigned"} · <span className="cc-channel">{e.run.trigger}</span></small></span><span><span className="cc-outcome" data-tone={telemetryOutcomeGroup(e.run)}>{e.run.status}</span><small>{new Date(e.run.lastObservedAt).toLocaleString()}</small></span><ChevronRight size={16} aria-hidden="true"/>
    </button>)}{!items.length && <p className="cc-empty">{loading ? "Reading connected activity…" : errors.length || agents.some(a => a.error) ? "Activity could not be fully checked. Missing rows do not mean there is no work." : "No executions in this loaded view. Unconnected agents and unsupported events are not included."}</p>}</div>;
  }
  return <div className="cc-workspace cp-durable">
    <PageTitle eyebrow="CONTROL WORKSPACE" title={page === "overview" ? "Company overview" : page === "agents" ? "Agents" : page === "approvals" ? "Approvals & outcomes" : page === "policies" ? "Policies" : "Activity"} description={page === "overview" ? "Your agents, the teams behind them, and the decisions that need attention." : page === "agents" ? "Understand each agent’s owner, connected history and action boundaries." : page === "approvals" ? "Review the exact change, why it is held and the workflow’s saved decision." : page === "policies" ? "Understand reported workflow rules and the controls actually connected." : "Follow each request from arrival to its reported outcome."} action={<button className="cp-button secondary" disabled={loading} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true"/>{loading ? "Reading…" : "Refresh view"}</button>}/>
    <CompanyScope/>
    {errors.map(error => <p role="alert" className="cp-durable-message is-error" key={error}>{error}</p>)}
    {agents.filter(a => a.error).map(a => <p role="alert" className="cp-durable-message is-error" key={a.key}>{a.name}: {a.error}</p>)}
    {checked && <p className="cc-scope">Checked {new Date(checked).toLocaleTimeString()} · On-demand read · Coverage is limited to connected sources and loaded records.</p>}
    {page === "overview" && <>
      <div className="cc-admin-stats"><div><span>AWS agents in scope</span><strong>{loading?"—":scopedAgents.length}</strong><small>Within the loaded inventory</small></div><div><span>Waiting for approval</span><strong>{loading||approvalUnknown?"—":pendingRequests.length}</strong><small>{approvalUnknown?"Approval source not fully checked":"Current shared approval requests"}</small></div><div><span>Runs needing review</span><strong>{loading?"—":executions.filter(e=>telemetryOutcomeGroup(e.run)==="attention").length}</strong><small>Reported in this history window</small></div><div><span>Activity connected</span><strong>{loading?"—":`${scopedAgents.filter(a=>a.history).length} / ${scopedAgents.length}`}</strong><small>Successful history reads / loaded agents</small></div></div>
      <div className="cc-admin-priority"><section className="cc-section"><div className="cc-section-heading"><h2><ScanLine size={18}/>Needs attention</h2><Link href="/control-plane/approvals">View approvals <ArrowRight size={14}/></Link></div><div className="cc-list">{pendingRequests.slice(0,3).map(({agent,request})=><div className="cc-attention-row" key={JSON.stringify([agent.key,request.approvalReference.version,request.id])}><div><strong>{request.title}</strong><small>{display(agent).team||"Team not assigned"} · {request.reason}</small></div><button className="cp-button" onClick={()=>setPanel({kind:"cloud",agent,view:"approvals",approvalReference:request.approvalReference})}>Review</button></div>)}{!pendingRequests.length&&<p className="cc-empty">{loading?"Reading current decisions…":approvalUnknown?"Approval coverage is incomplete. Open the agent to inspect its connection.":"No current pending shared approvals returned in this scope."}</p>}</div><p className="cc-scope">History can lag current decisions. Sample-system queues are separate.</p><button className="cc-link" onClick={()=>setPanel({kind:"samples"})}>Review sample decisions and outcomes <ChevronRight size={14}/></button></section>
      <section className="cc-section"><div className="cc-section-heading"><h2>Connection coverage</h2><button className="cc-link" onClick={()=>setPanel({kind:"connections"})}>Review connections <ArrowRight size={14}/></button></div><div className="cc-connection-coverage"><div><span>History reads succeeded</span><strong>{scopedAgents.filter(a=>a.history).length} / {scopedAgents.length}</strong></div><div><span>Approval connections</span><strong>{scopedAgents.filter(a=>a.approvalSources?.some(s=>s.read.connected)).length} / {scopedAgents.length}</strong></div><div><span>Execution controls verified</span><strong>Not established</strong></div></div><p className="cc-scope">Observation, approvals and execution enforcement are separate capabilities.</p></section></div>
      <section className="cc-section"><div className="cc-section-heading"><h2>Across your teams</h2><Link href="/control-plane/agents">View agents <ArrowRight size={14}/></Link></div><div className="cc-list cc-team-list">{[...new Set(scopedAgents.map(a=>display(a).teamId))].map(id=>{const members=scopedAgents.filter(a=>display(a).teamId===id),label=display(members[0]);return <div className="cc-team-row" key={id}><span><strong>{label.team||"Not assigned to a team"}</strong><small>{label.department||"Department not shared"} · {label.source}</small></span><span>{members.length} agents</span><span>{members.filter(a=>a.history).length} history sources read</span><span>{pendingRequests.filter(r=>members.includes(r.agent)).length} returned pending approvals</span></div>})}{!scopedAgents.length&&<p className="cc-empty">No AWS deployments in this loaded scope.</p>}</div></section>
      <section className="cc-section"><div className="cc-section-heading"><h2><Activity size={18}/>Latest activity</h2><Link href="/control-plane/activity">View all activity <ArrowRight size={14}/></Link></div>{rows(executions.slice(0,5))}</section>
    </>}
    {page === "agents" && <>
      <div className="cc-toolbar"><label className="cc-search"><Search size={16}/><input aria-label="Search agents" placeholder="Search name or owner" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="cc-actions">{awsEnabled && <><Link className="cp-button cp-button-dark" href="/control-plane/discovery"><Cloud size={15}/>Connect AWS agent</Link><Link className="cc-link" href="/control-plane/discovery">Review AWS discovery</Link></>}<button className="cp-button secondary" onClick={()=>setPanel({kind:"register"})}>Register sample agent</button></div></div>
      {(query||Object.values(businessScope).some(v=>v!=="all"))&&<button className="cp-button secondary" onClick={()=>{setQuery("");setScope({department:"all",team:"all",environment:"all"});}}>Clear agent filters</button>}
      <section className="cc-section"><h2>Cloud agents</h2><p className="cc-scope">Saved deployments from AWS discovery. Refreshing this view does not scan AWS for new agents. Review discovery in Connections for new deployments or older versions. Company assignments override AWS-reported labels; neither grants tool permissions.</p><div className="cc-list">{cloudRows.map(a=><button type="button" className="cc-agent-row" key={a.key} onClick={()=>openCloud(a)}><span className="cc-identity"><Bot size={21}/><span><strong>{a.name}</strong><small>{display(a).purpose || "Purpose not provided"}</small></span></span><span>{display(a).team ? `${display(a).team} · ${display(a).source}` : "Team not assigned"}<small>{a.enrollment?.owner || (a.declaredMetadata?.owner?`${a.declaredMetadata.owner} · AWS reported owner`:"Owner not confirmed")}</small><small>AWS · {a.region} · …{a.account.slice(-4)}</small></span><span>{a.error ? "Connection needs attention" : a.enrollment ? "Onboarding saved" : "Discovered only"}<small>{a.stale ? "Saved inventory is older; refresh discovery in Connections" : "Inventory observed"} · enforcement unverified</small></span><ChevronRight size={16}/></button>)}{!cloudRows.length&&<p className="cc-empty">{loading ? "Reading saved AWS inventory…" : query||businessScope.department!=="all"||businessScope.team!=="all"||businessScope.environment!=="all"?"No agents match these filters. Clear the search or select All departments, teams and environments.":"No saved AWS deployments. Open Connections to discover agents."}</p>}</div></section>
      <details className="cc-section"><summary>Sample agents</summary><p className="cc-scope">These registered identities act on sample records or simulated systems. They are separate from discovered AWS deployments.</p><div className="cc-list">{localRows.map(a=><button className="cc-agent-row" key={a.id} onClick={()=>setPanel({kind:"local",agent:a})}><span className="cc-identity"><Bot size={21}/><span><strong>{a.name || "Unnamed sample agent"}</strong><small>{agentPresentation(a.tools).action}</small></span></span><span>{a.owner || "Owner not supplied"}<small>Sample system</small></span><span>{a.active ? "Active identity" : "Paused identity"}<small>{a.reserved} of {a.action_limit} lifetime requests used</small></span><ChevronRight size={16}/></button>)}</div></details>
    </>}
    {page === "activity" && <>
      <div className="cc-toolbar"><div className="cc-tabs"><button aria-pressed={!attention} onClick={()=>setAttention(false)}>All activity</button><button aria-pressed={attention} onClick={()=>setAttention(true)}>Needs attention <span>{needsAttention.length}</span></button></div><label className="cc-search"><Search size={16}/><input type="search" aria-label="Search activity" placeholder="Search request or quote" value={query} onChange={e=>setQuery(e.target.value)}/></label></div>
      <div className="cc-filters"><label>Agent<select value={agentFilter} onChange={e=>setAgentFilter(e.target.value)}><option value="all">All loaded AWS agents</option>{agents.map(a=><option key={a.key} value={a.key}>{a.name} · …{a.account.slice(-4)}</option>)}</select></label><label>Outcome<select value={outcome} onChange={e=>setOutcome(e.target.value)}><option value="all">All outcomes</option><option value="waiting">Awaiting approval</option><option value="attention">Needs verification / review</option><option value="completed">Completed</option><option value="blocked">Blocked or rejected</option></select></label><label>Channel<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="all">All channels</option><option value="slack">Slack</option><option value="email">Email</option><option value="internal">Internal</option></select></label><label>Time window<select value={hours} onChange={e=>setHours(Number(e.target.value))}><option value={1}>Last hour</option><option value={24}>Last 24 hours</option><option value={168}>Last 7 days</option></select></label></div>
      <p className="cc-scope">{filtered.length} {filtered.length===1?"execution":"executions"} · Latest event first. {agents.filter(a=>a.history).length} connected sources read. Reported outcomes are not independently verified effects.</p>{rows(filtered)}
      <details className="cc-evidence"><summary>History coverage and source gaps</summary>{agents.map(a=><p key={a.key}>{a.name}: {a.history ? `${a.history.completeness}; ${a.history.unsupportedRecords} unsupported records; ${a.history.duplicateDeliveries} duplicate deliveries removed; ${a.history.failures.length} read/validation failures.` : a.enrollment ? "History unavailable in this read." : "History not connected."}</p>)}<p>This view does not subscribe to a live event stream. Refresh to read newer events. No amount, request text or tool permission is invented when the source omits it.</p></details>
      <button className="cc-link" onClick={()=>setPanel({kind:"samples"})}>Sample decisions and workflow history <ChevronRight size={14}/></button>
    </>}
    {page === "policies" && <><section className="cc-section"><h2>Rules reported by connected workflows</h2><p className="cc-scope">Read-only evidence from the selected history window. These rules belong to the workflow; LoopLabs observation does not enforce or edit them.</p><div className="cc-list">{scopedAgents.map(agent=>{const rules=[...new Map((agent.history?.events??[]).filter(e=>e.eventName==="policy.evaluated").sort((a,b)=>a.occurredAt.localeCompare(b.occurredAt)).map(e=>[JSON.stringify([e.ruleId,e.ruleVersion]),e])).values()];return <section className="cc-policy-agent" key={agent.key}><h3>{agent.name}</h3><p>{display(agent).team||"Team not assigned"}</p>{rules.length?rules.map(rule=><div className="cc-policy-rule" key={JSON.stringify([rule.ruleId,rule.ruleVersion])}><strong>{rule.ruleId||"Workflow policy"} · {rule.ruleVersion?`Version ${rule.ruleVersion}`:"Version not shared"}</strong><dl className="cc-facts"><div><dt>Approval threshold</dt><dd>{rule.approvalThreshold==null?"Not shared":`${rule.approvalThreshold}%`}</dd></div><div><dt>Maximum discount</dt><dd>{rule.maximumDiscount==null?"Not shared":`${rule.maximumDiscount}%`}</dd></div><div><dt>Latest observed decision</dt><dd>{rule.decision||"Not shared"}</dd></div></dl></div>):<p>No policy evaluation evidence was returned for this agent.</p>}<button className="cc-link" onClick={()=>setPanel({kind:"cloud",agent,view:"activity"})}>Inspect source history <ChevronRight size={14}/></button></section>})}{!scopedAgents.length&&<p className="cc-empty">No connected workflow rules in this loaded scope.</p>}</div></section><details><summary>Installed sample-system controls</summary><SavedWorkspace section="policies" awsConnections={awsEnabled}/></details><section className="cc-section cp-panel"><h2>Organization-wide enforcement</h2><p>Company-assigned teams do not create inherited rules. A verified execution checkpoint is required before LoopLabs can enforce additional company policies on a cloud workflow.</p></section></>}
    {page === "approvals" && <><section className="cc-section"><h2>Current shared approvals</h2><div className="cc-list">{pendingRequests.map(({agent,request})=><div className="cc-attention-row" key={JSON.stringify([agent.key,request.approvalReference.version,request.id])}><div><strong>{request.title}</strong><small>{request.reason}</small><small>{agent.name} · {display(agent).team||"Team not assigned"}</small></div><button className="cp-button" onClick={()=>setPanel({kind:"cloud",agent,view:"approvals",approvalReference:request.approvalReference})}>Review request</button></div>)}{!pendingRequests.length&&<p className="cc-empty">{loading?"Checking approval sources…":approvalUnknown?"Not all approval sources could be checked.":"No pending shared approvals were returned."}</p>}</div></section><section className="cc-section"><h2>Reported waiting states</h2>{rows(executions.filter(e=>telemetryOutcomeGroup(e.run)==="waiting"))}<p className="cc-scope">History may lag the workflow’s current decision. Open shared approvals to check the authoritative request.</p></section><section className="cc-section"><h2>Outcomes to check</h2>{rows(executions.filter(e=>telemetryOutcomeGroup(e.run)==="attention"))}<p className="cc-scope">Inspect the trace first. Generic AWS effect verification is not connected.</p></section><section className="cc-section"><h2>Shared approval connections</h2>{scopedAgents.filter(a=>a.enrollment).map(a=><button className="cc-link" key={a.key} onClick={()=>setPanel({kind:"cloud",agent:a,view:"approvals"})}><ShieldCheck size={16}/>{a.name} · review shared approvals <ChevronRight size={14}/></button>)}</section><details><summary>Sample-system decisions</summary><SavedWorkspace section="approvals"/></details></>}
    {panel && <Modal drawer wide title={panel.kind === "cloud" ? panel.agent.name : panel.kind === "local" ? panel.agent.name || "Sample agent" : panel.kind === "execution" ? "Execution details" : panel.kind === "approval" ? "Review workflow approval" : panel.kind === "register" ? "Register a sample agent" : panel.kind === "connections" ? "Connections" : panel.kind === "policy" ? "Policies" : "Sample decisions and outcomes"} onClose={()=>setPanel(null)}>
      <div className="cc-workspace cc-panel-content">
      {panel.kind === "cloud" && <>
        <div className="cc-tabs">{["summary","activity","approvals","business","setup"].map(value=><button key={value} aria-pressed={panel.view===value} onClick={()=>setPanel({...panel,view:value})}>{value === "summary" ? "Summary & tools" : value === "activity" ? "Activity" : value === "approvals" ? "Approvals" : value === "business" ? "Business details" : "Name, owner & source"}</button>)}</div>
        <div hidden={panel.view!=="summary"}><div className="cc-section"><h3>Purpose & ownership</h3><p>Company assignments override AWS-reported display labels. These labels do not grant permissions.</p><p>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).purpose || "Purpose has not been provided by the company administrator."}</p><dl className="cc-facts"><div><dt>Department</dt><dd>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).department||"Not assigned"}</dd></div><div><dt>Team</dt><dd>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).team||"Not assigned"}</dd></div><div><dt>Environment</dt><dd>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).environment||"Not specified"}</dd></div></dl><dl className="cc-facts"><div><dt>Accountable owner</dt><dd>{panel.agent.enrollment?.owner || "Not confirmed"}</dd></div><div><dt>Platform</dt><dd>AWS AgentCore · {panel.agent.region}</dd></div><div><dt>History setup</dt><dd>{panel.agent.enrollment ? "Onboarding saved; current read checked separately" : "Not connected"}</dd></div><div><dt>Execution enforcement</dt><dd>Not verified</dd></div></dl></div><RuntimeMetadata metadata={panel.agent.declaredMetadata} version={panel.agent.reference.version}/><section className="cc-section"><h3>Observed actions & tools</h3><p>Discovery does not expose the agent’s complete tool inventory or effective permissions.</p>{panel.agent.history ? [...new Map(telemetryRuns(panel.agent.history).flatMap(run=>telemetrySteps(run.events).filter(step=>step.action).map(step=>[step.first.actionName,telemetryStepCopy(step)] as const))).values()].map(copy=><p key={copy.title}><strong>{copy.title}</strong> · {copy.provider || "System not reported"}<small>Observed in connected activity; authority not verified.</small></p>) : <p>Observed tools load from connected history. Open Activity to retry if this summary remains empty.</p>}</section><details><summary>Technical identity</summary><p className="cc-reference">{panel.agent.reference.resourceArn}</p><p>Version {panel.agent.reference.version} · AWS account {panel.agent.account}</p></details></div>
        {panel.view==="business" && <AgentBusinessEditor agentKey={panel.agent.key}/>}
        {panel.view==="approvals" ? <><label>Approval deployment<select aria-label="Approval deployment" value={cloudApprovalRef!.version} onChange={e=>setPanel({...selectedCloud!,approvalReference:selectedCloud!.agent.references.find(r=>r.version===e.target.value)})}>{panel.agent.references.map(r=><option key={r.version} value={r.version}>Version {r.version}</option>)}</select></label><p>This selects a saved deployment connection; it does not grant authority to another version.</p><ExternalWorkflowApprovals reference={cloudApprovalRef!} onDecision={onRefresh}/></> : panel.view!=="summary" && panel.view!=="business" && <AwsWorkflowHistory reference={panel.agent.reference} name={panel.agent.name} mode={panel.view==="setup"?"setup":"activity"} references={panel.agent.references} onHistory={h=>updateHistory(panel.agent,h)}/>}
      </>}
      {(panel.kind === "execution" || panel.kind === "approval") && <>
        <p className="cc-scope">{panel.execution.agent.name} · AWS · {panel.execution.agent.region}</p>
        {panel.kind === "execution" ? <><AwsExecutionBrowser key={panel.execution.key} runs={[panel.execution.run]} runtimeVersion={panel.execution.agent.reference.version} references={panel.execution.agent.references} initialSelectedId={panel.execution.run.id} detailsOnly onQuote={id=>{setQuery(id);setPanel(null);}}/><p className="cc-scope">Approval review uses the execution’s reported deployment version, not the newest deployment. Mixed or unknown versions require connection review.</p><button className="cp-button" disabled={!executionReference(panel.execution.run.events,panel.execution.agent.references)} onClick={()=>setPanel({kind:"approval",execution:panel.execution})}><ShieldCheck size={16}/>Review this execution’s approvals</button></> : <><button className="cc-link" onClick={()=>setPanel({kind:"execution",execution:panel.execution})}>Back to execution</button><ExternalWorkflowApprovals reference={executionReference(panel.execution.run.events,panel.execution.agent.references)!} runId={panel.execution.run.id} onDecision={onRefresh}/></>}
      </>}
      {panel.kind === "local" && <><AgentBusinessEditor agentKey={`sample:${panel.agent.id}`}/><dl className="cc-facts"><div><dt>Owner</dt><dd>{panel.agent.owner || "Not supplied"}</dd></div><div><dt>Allowed action</dt><dd>{agentPresentation(panel.agent.tools).action}</dd></div></dl><p>Sample system. Existing server permission and approval rules still apply.</p>{panel.agent.tools.includes("twin.crm") ? <ConnectorActionsWorkspace connector="crm"/> : panel.agent.tools.includes("twin.email") ? <ConnectorActionsWorkspace connector="email"/> : panel.agent.tools.includes("proof.discount") ? <DurableWorkspace scriptDemo/> : <Link className="cp-button secondary" href="/control-plane/quotes">Review the installed quote workflow</Link>}</>}
      {panel.kind === "register" && <AgentsWorkspace scriptDemo/>}
      {panel.kind === "connections" && <SavedWorkspace section="connections" awsConnections={awsEnabled}/>}
      {panel.kind === "policy" && <SavedWorkspace section="policies" awsConnections={awsEnabled}/>}
      {panel.kind === "samples" && <><SavedWorkspace section="approvals"/><details><summary>Installed sample workflows and history</summary><SavedWorkspace section="workflows"/></details></>}
      </div>
    </Modal>}
    <p className="cc-scope"><Eye size={14} aria-hidden="true"/>Visibility, shared approval decisions and execution enforcement are separate capabilities. AWS is the connected cloud platform in this release.</p>
  </div>;
}
