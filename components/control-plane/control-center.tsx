"use client";

import {WorkflowCatalogView} from "./workflow-catalog-view";
import {workflowDeclaration} from "@/lib/workspace/company-profile-contract";
import Link from "next/link";
import { RuntimeMetadata } from "./runtime-metadata";
import type { CloudRuntimeMetadata } from "@/lib/workspace/cloud-runtime-metadata";
import { CompanyScope,AgentBusinessEditor,useCompany } from "./company-workspace";
import {businessDisplay,displayScopeMatches} from "@/lib/workspace/business-display";
import {executionApprovalIds} from '@/lib/workspace/execution-approval-match';
import {executionReference} from "@/lib/workspace/execution-reference";
import { businessScopeMatches } from "@/lib/workspace/company-profile-contract";
import type { ExternalApproval } from "@/lib/workspace/external-approvals";
import { useCallback, useEffect, useRef, useState } from "react";
import { Activity, ArrowRight, Bot, Building2, ChevronRight, Clock3, Cloud, Eye, FileText, RefreshCw, ScanLine, Search, ShieldCheck } from "lucide-react";
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
type Panel = { kind: "cloud"; agent: CloudAgent; view: string; approvalReference?:ActivityReference; approvalRunId?:string } | { kind: "execution" | "approval"; execution: Execution } | { kind: "local"; agent: LocalAgent } | { kind: "register" | "samples" | "connections" | "policy" };

async function read<T>(path: string, body?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal, ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const value = await workspaceJson(response);
  if (!response.ok) throw Error(value.error || "The saved view could not be read.");
  return value as T;
}

/** Reads existing contracts only. Cloud tools/authority are never inferred from a name. */
export function ControlCenter({ page, awsEnabled }: { page: "overview" | "agents" | "activity" | "approvals" | "policies"; awsEnabled: boolean }) {
  const {snapshot:company,loading:companyLoading,scope:businessScope,setScope,setSources}=useCompany();
  const profile=company?.profile??null;
  const [agents, setAgents] = useState<CloudAgent[]>([]), [local, setLocal] = useState<LocalAgent[]>([]);
  const [scanning,setScanning]=useState(false),[scanNotice,setScanNotice]=useState("");
  const [scanTimes,setScanTimes]=useState<{connectionId:string;at:string|null;complete:boolean}[]>([]);
  const [loading, setLoading] = useState(true), [errors, setErrors] = useState<string[]>([]), [checked, setChecked] = useState<string | null>(null);
  const [query, setQuery] = useState(""), [agentFilter, setAgentFilter] = useState("all"), [outcome, setOutcome] = useState("all"), [channel, setChannel] = useState("all"), [hours, setHours] = useState(24);
  const [panelState, setPanel] = useState<Panel | null>(null), [refresh, setRefresh] = useState(0), [attention, setAttention] = useState(false);
  const overviewLoading=loading||companyLoading;
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
        const cloud: CloudAgent[] = [],times:{connectionId:string;at:string|null;complete:boolean}[]=[];
        // Bounded reads protect shared connection throttles. No discovery scan or setup mutation.
        for (const connection of accounts.connections.slice(0, 10)) {
          const scope = connection.scope;
          try {
            const inventory = await read<{ status: string; scanId: string; stale: boolean; observedAt?:string;completeness?:string;historyTruncated?: boolean; records: { record: { resourceArn: string; resourceId: string; version: string; declaredMetadata?: CloudRuntimeMetadata | null }; stale: boolean; observedInCurrentScan: boolean }[] }>(`/api/workspace/discovery?connectionId=${encodeURIComponent(scope.connectionId)}`, undefined, controller.signal);
            times.push({connectionId:scope.connectionId,at:inventory.observedAt??null,complete:inventory.completeness==="complete-api-traversal"});
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
        if (current()) {setAgents(cloud);setScanTimes(times);}
      } catch (e) { if (current()) setAgents([]); failures.push(`AWS: ${e instanceof Error ? e.message : "Unavailable"}`); }
      if (current()) { setErrors(failures); setLoading(false); setChecked(new Date().toISOString()); }
    }
    void load();
    return () => controller.abort();
  }, [awsEnabled, page, refresh, hours]);
  useEffect(()=>{setSources(agents.map(a=>({key:a.key,metadata:a.declaredMetadata})));},[agents,setSources]);
  const openedLink=useRef(false);
  useEffect(()=>{
    if(page!=="agents"||loading||openedLink.current)return;
    const params=new URLSearchParams(window.location.search),connectionId=params.get("connectionId"),resourceArn=params.get("resourceArn"),version=params.get("version");
    if(!connectionId||!resourceArn||!version)return;
    openedLink.current=true;
    const agent=agents.find(a=>a.reference.connectionId===connectionId&&a.reference.resourceArn===resourceArn);
    const reference=agent?.references.find(r=>r.version===version);
    if(!agent||!reference){setErrors(previous=>[...previous,"The linked deployment is not in your loaded inventory. Review it in Connections."]);return;}
    const controller=new AbortController();
    void read<{enrollment:Enrollment|null}>("/api/workspace/discovery/onboarding",{operation:"enrollment",...reference},controller.signal).then(saved=>{
      if(controller.signal.aborted)return;
      setPanel({kind:"cloud",agent:{...agent,reference,enrollment:saved.enrollment,declaredMetadata:reference.version===agent.reference.version?agent.declaredMetadata:null,name:saved.enrollment?.displayName??agent.name},view:"activity",approvalReference:reference});
    }).catch(e=>{if(!controller.signal.aborted)setErrors(previous=>[...previous,`Linked agent: ${e instanceof Error?e.message:"Saved onboarding could not be read."}`]);});
    return()=>controller.abort();
  },[agents,loading,page]);
  async function scanSources(){
    setScanning(true);setScanNotice("");
    try{const directory=await read<{connections:{scope:{connectionId:string}}[];truncated?:boolean}>("/api/workspace/discovery");
      if(directory.truncated||directory.connections.length>10)throw Error("Choose an account in Connections; this view cannot scan all configured accounts.");
      let count=0;const failed:string[]=[];
      for(const c of directory.connections){try{const r=await read<{completeness:string}>("/api/workspace/discovery",{operation:"scan",connectionId:c.scope.connectionId});count++;if(r.completeness!=="complete-api-traversal")failed.push(c.scope.connectionId+": partial inventory");}catch(e){failed.push(e instanceof Error?e.message:"AWS scan unavailable");}}
      setScanNotice(failed.length?`Scanned ${count} accounts. ${failed.join("; ")}`:`AWS inventory updated for ${count} accounts. Business role definitions remain company-declared.`);
    }catch(e){setScanNotice(e instanceof Error?e.message:"AWS scan unavailable.");}finally{setScanning(false);onRefresh();}
  }
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
  const needsAttention = executions.filter(e => ["attention", "waiting"].includes(telemetryOutcomeGroup(e.run)) && !pendingRequests.some(p=>p.agent.key===e.agent.key&&p.request.runId===e.run.id));
  const historyCount=scopedAgents.filter(a=>a.history).length;
  const missingHistory=scopedAgents.length-historyCount;
  const companyWorkflows=scopedAgents.filter(a=>workflowDeclaration(profile,a.key,a.reference.version)?.kind!=="operator");
  const departmentGroups=[...new Set(companyWorkflows.map(a=>display(a).departmentId))].map(id=>({id,members:companyWorkflows.filter(a=>display(a).departmentId===id)}));
  const q = query.trim().toLowerCase();
  const filtered = executions.filter(e => (agentFilter === "all" || e.agent.key === agentFilter) && (outcome === "all" || telemetryOutcomeGroup(e.run) === outcome) && (channel === "all" || e.run.trigger === channel) && (!attention || ["attention", "waiting"].includes(telemetryOutcomeGroup(e.run))) && [e.agent.name, e.run.id, ...e.run.quoteIds, telemetryRequestLabel(e.run)].join(" ").toLowerCase().includes(q));
  const cloudRows = scopedAgents.filter(a => [a.name,a.account,a.enrollment?.owner,a.declaredMetadata?.owner,workflowDeclaration(profile,a.key,a.reference.version)?.title,workflowDeclaration(profile,a.key,a.reference.version)?.owner,...(workflowDeclaration(profile,a.key,a.reference.version)?.roles??[]),display(a).team,display(a).department].join(" ").toLowerCase().includes(q));
  const localRows = local.filter(a => businessScopeMatches(profile,`sample:${a.id}`,businessScope)).filter(a => [a.name, a.owner, agentPresentation(a.tools).action].join(" ").toLowerCase().includes(q));
  function updateHistory(agent:CloudAgent,history:History){setAgents(all=>all.map(a=>a.key===agent.key&&a.reference.version===agent.reference.version?{...a,history,error:null}:a));}
  const openCloud = (agent: CloudAgent) => {
    setPanel({kind:"cloud",agent,view:agent.enrollment?"summary":"setup"});
    if(agent.enrollment&&!agent.history){const n=generation.current;void read<History>("/api/workspace/discovery/onboarding",{operation:"history",connectionId:agent.reference.connectionId,resourceArn:agent.reference.resourceArn,version:agent.reference.version,hours}).then(h=>{if(n===generation.current)updateHistory(agent,h);}).catch(e=>{if(n===generation.current)setAgents(all=>all.map(a=>a.key===agent.key?{...a,error:e instanceof Error?e.message:"History unavailable"}:a));});}
  };
  function rows(items: Execution[]) {
    return <div className="cc-list" aria-label="Execution history"><div className="cc-execution-head" aria-hidden="true"><span>Request / context</span><span>Agent / channel</span><span>Outcome / last event</span></div>{items.map(e => <button type="button" className="cc-execution-row" key={e.key} onClick={() => setPanel({ kind: "execution", execution: e })}>
      <span className="cc-identity"><FileText size={18} aria-hidden="true"/><span><strong>{telemetryRequestLabel(e.run)}</strong><small>{e.run.quoteIds.length ? e.run.quoteIds.join(" · ") : "Business record reference not shared"}</small></span></span>
      <span>{e.agent.name}<small>{display(e.agent).team||"Team not assigned"} · <span className="cc-channel">{e.run.trigger}</span></small></span><span><span className="cc-outcome" data-tone={telemetryOutcomeGroup(e.run)}>{e.run.status}</span><small>{new Date(e.run.lastObservedAt).toLocaleString()}</small></span><ChevronRight size={16} aria-hidden="true"/>
    </button>)}{!items.length && <p className="cc-empty">{loading ? "Reading connected activity…" : errors.length || agents.some(a => a.error) ? "Activity could not be fully checked. Missing rows do not mean there is no work." : "No executions in this loaded view. Unconnected agents and unsupported events are not included."}</p>}</div>;
  }
  return <div className="cc-workspace cp-durable">
    <PageTitle eyebrow="CONTROL WORKSPACE" title={page === "overview" ? "Company overview" : page === "agents" ? "Agents & workflows" : page === "approvals" ? "Approvals & outcomes" : page === "policies" ? "Policies" : "Activity"} description={page === "overview" ? "Follow the work your agents do. Step in where a decision is needed." : page === "agents" ? "See company workflows, accountable ownership and the agent roles within each workflow." : page === "approvals" ? "Review the exact change, why it is held and the workflow’s saved decision." : page === "policies" ? "Understand reported workflow rules and the controls actually connected." : "Follow each request from arrival to its reported outcome."} action={<button className="cp-button secondary" disabled={loading||(page==="overview"&&companyLoading)} onClick={onRefresh}><RefreshCw size={15} aria-hidden="true"/>{loading||(page==="overview"&&companyLoading) ? "Reading…" : "Refresh view"}</button>}/>
    {(page!=="overview"||!overviewLoading)&&<CompanyScope/>}
    {(page!=="overview"||!overviewLoading)&&<>{errors.map(error => <p role="alert" className="cp-durable-message is-error" key={error}>{error}</p>)}
    {agents.filter(a => a.error).map(a => <p role="alert" className="cp-durable-message is-error" key={a.key}>{a.name}: {a.error}</p>)}
    {checked && <p className="cc-scope">Checked {new Date(checked).toLocaleTimeString()} · On-demand read · Coverage is limited to connected sources and loaded records.</p>}</>}
    {awsEnabled&&!(page==="overview"&&overviewLoading)&&<section className="cc-scan-strip" aria-label="AWS discovery freshness"><div><strong>{scanning?'Scanning AWS for updated deployments…':'Discovery freshness'}</strong>{scanTimes.map(t=><p key={t.connectionId}>Last AWS scan: {t.at?new Date(t.at).toLocaleString():'Never scanned'} · {t.complete?'API traversal complete':'Partial or unscanned inventory'}</p>)}{scopedAgents.some(a=>a.stale)&&<p>Saved discovery is older than15minutes. Refreshing the view does not scan AWS.</p>}{scanNotice&&<p role="status">{scanNotice}</p>}</div><button className="cp-button cp-button-dark" disabled={scanning||loading} onClick={()=>void scanSources()}><RefreshCw size={16}/>{scanning?'Scanning AWS…':'Scan AWS for updates'}</button></section>}
    {page === "overview" && (overviewLoading?<OverviewLoading/>:<>
      <div className="cc-admin-stats"><div><span>Business workflows</span><strong>{loading||!profile?.catalog?"—":scopedAgents.filter(a=>workflowDeclaration(profile,a.key,a.reference.version)?.kind==="workflow").length}</strong><small>{profile?.catalog?`${scopedAgents.reduce((n,a)=>n+(workflowDeclaration(profile,a.key,a.reference.version)?.roles.length??0),0)} declared agent roles`:`${scopedAgents.length} deployments · workflow definitions needed`}</small></div><div><span>Waiting for approval</span><strong>{loading||approvalUnknown?"—":pendingRequests.length}</strong><small>{approvalUnknown?"Approval coverage incomplete":"Current shared approval requests"}</small></div><div><span>Recent business requests</span><strong>{loading||historyCount===0?"—":executions.length}</strong><small>{historyCount===0?"No history sources read":"In the last 24 hours · loaded sources"}</small></div><div><span>History coverage</span><strong>{loading?"—":`${historyCount} / ${scopedAgents.length}`}</strong><small>Connected deployments read</small></div></div>
      <section className="cc-section cc-overview-attention"><div className="cc-section-heading"><h2><ScanLine size={18} aria-hidden="true"/>Needs attention</h2><Link href="/control-plane/approvals">View approvals <ArrowRight size={14}/></Link></div>
      <div className="cc-overview-priority">
        <div className="cc-overview-decisions">{pendingRequests.slice(0,3).map(({agent,request})=><article className="cc-business-request" key={JSON.stringify([agent.key,request.approvalReference.version,request.id])}>
          <div className="cc-overview-row"><span className="cc-status-chip is-waiting"><Clock3 size={14} aria-hidden="true"/>Approval needed</span><small>{display(agent).department||display(agent).team||"Department not shared"}</small></div>
          <h3>{request.title}</h3><p className="cc-scope">{agent.name} · <span className="cc-channel">{request.channel}</span> · Deployment version {request.approvalReference.version}</p>
          <dl className="cc-business-values"><div><dt>Current value</dt><dd>{request.before}</dd></div><div><dt>Proposed value</dt><dd>{request.after}</dd></div></dl>
          <p className="cc-review-reason"><strong>Why review is needed</strong>{request.reason}</p><p className="cc-scope">Requested by {request.requestedBy} · Workflow held</p>
          <div className="cc-overview-row"><small>Review before {new Date(request.expiresAt).toLocaleString()}</small><button className="cp-button" onClick={()=>setPanel({kind:"cloud",agent,view:"approvals",approvalReference:request.approvalReference,approvalRunId:request.runId})}>Review request <ArrowRight size={14} aria-hidden="true"/></button></div>
        </article>)}{!pendingRequests.length&&<div className="cc-overview-empty"><ShieldCheck size={21} aria-hidden="true"/><h3>{loading?"Reading current decisions…":approvalUnknown?"Approval coverage is incomplete":"No current approval requests returned"}</h3><p className="cc-scope">{loading?"Checking connected workflows.":approvalUnknown?"Open the agent to inspect its connection. Missing approvals do not establish that no decisions are needed.":"No current pending shared approvals returned in this scope."}</p></div>}
        {!!needsAttention.length&&<div className="cc-overview-followup"><h3>Reported outcomes to check</h3>{needsAttention.slice(0,2).map(e=><button className="cc-overview-followup-row" key={e.key} onClick={()=>setPanel({kind:"execution",execution:e})}><span><strong>{telemetryRequestLabel(e.run)}</strong><small>{e.agent.name} · {e.run.status}</small></span><ChevronRight size={16}/></button>)}<p className="cc-scope">Last-reported states. Check current approval evidence before acting.</p></div>}</div>
        <article className="cc-overview-visibility"><span className="cc-status-chip"><Eye size={14} aria-hidden="true"/>Visibility coverage</span><h3>{loading?"Checking connected history…":missingHistory?`${missingHistory} ${missingHistory===1?"deployment has":"deployments have"} no current history read`:"History read for every loaded deployment"}</h3><p className="cc-scope">{missingHistory?"Discovery identifies deployments. Without a successful history read, their business activity and current outcome are unknown.":"This covers the loaded sources and time range; it does not independently verify business effects."}</p><Link className="cc-link" href="/control-plane/connectors?coverage=history">Review connections <ArrowRight size={14}/></Link></article>
      </div></section>
      <section className="cc-section cc-overview-activity"><div className="cc-section-heading"><h2><Activity size={18} aria-hidden="true"/>Latest business activity</h2><Link href="/control-plane/activity">View all activity <ArrowRight size={14}/></Link></div><p className="cc-scope">Select a request to see its journey. Outcomes are reported by the workflow.</p>{rows(executions.slice(0,5))}</section>
      <section className="cc-section"><div className="cc-section-heading"><h2><Building2 size={18} aria-hidden="true"/>Operations across your company</h2><Link href="/control-plane/agents">View agents <ArrowRight size={14}/></Link></div><div className="cc-department-grid">{departmentGroups.map(({id,members})=>{const label=display(members[0]);return <article className="cc-department-card" key={id}><div className="cc-overview-row"><h3>{label.department||"Department not shared"}</h3><span className="cc-scope">{members.length} {members.length===1?"deployment":"deployments"}</span></div>{members.map(agent=>{const business=display(agent),pending=pendingRequests.filter(r=>r.agent===agent).length;return <button className="cc-department-agent" key={agent.key} onClick={()=>openCloud(agent)}><span><strong>{agent.name}</strong><small>{business.purpose||"Business purpose not provided"}</small><small>{business.team||"Team not shared"} · {agent.enrollment?.owner||(agent.declaredMetadata?.owner?`${agent.declaredMetadata.owner} · AWS reported owner`:"Owner not confirmed")}</small></span><span className="cc-status-chip">{pending?`${pending} ${pending===1?"decision":"decisions"}`:agent.history?"History connected":"History not read"}</span></button>;})}</article>;})}{!scopedAgents.length&&<p className="cc-empty">{loading?"Reading AWS deployments…":"No AWS deployments in this loaded scope."}</p>}</div><p className="cc-scope">Company assignments override AWS-reported display labels. A deployment is not a confirmed business workflow or complete inventory of internal agent roles.</p></section>
    </>)}
    {page === "agents" && <>
      <div className="cc-toolbar"><label className="cc-search"><Search size={16}/><input aria-label="Search agents" placeholder="Search workflow, role, owner or team" value={query} onChange={e=>setQuery(e.target.value)}/></label><div className="cc-actions">{awsEnabled && <><Link className="cp-button cp-button-dark" href="/control-plane/connectors"><Cloud size={15}/>Connect AWS agent</Link><Link className="cc-link" href="/control-plane/connectors">Review AWS discovery</Link></>}<button className="cp-button secondary" onClick={()=>setPanel({kind:"register"})}>Register sample agent</button></div></div>
      {(query||Object.values(businessScope).some(v=>v!=="all"))&&<button className="cp-button secondary" onClick={()=>{setQuery("");setScope({department:"all",team:"all",environment:"all"});}}>Clear agent filters</button>}
      <WorkflowCatalogView rows={cloudRows} profile={profile} onOpen={openCloud} loading={loading||companyLoading} query={query}/>
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
    {panel && <Modal drawer wide title={panel.kind === "cloud" ? panel.agent.name : panel.kind === "local" ? panel.agent.name || "Sample agent" : panel.kind === "execution" ? "Execution details" : panel.kind === "approval" ? "Review workflow approval" : panel.kind === "register" ? "Register a sample agent" : panel.kind === "connections" ? "Connections" : panel.kind === "policy" ? "Policies" : "Sample decisions and outcomes"} onClose={()=>{if(panel.kind==="cloud"&&!panel.agent.enrollment)onRefresh();setPanel(null);}}>
      <div className="cc-workspace cc-panel-content">
      {panel.kind === "cloud" && <>
        <div className="cc-agent-context"><span><Cloud size={16} aria-hidden="true"/>AWS AgentCore · {panel.agent.region} · Version {panel.agent.reference.version}</span><span className="cc-status-chip">{panel.agent.enrollment?"Onboarding saved":"Discovered agent"}</span></div>
        {(()=>{const w=workflowDeclaration(profile,panel.agent.key,panel.agent.reference.version);return w?<section className="cc-agent-card"><h3>{w.kind==='operator'?'Supporting runtime':'Business workflow'}</h3><p>{w.purpose||'Purpose not declared'}</p><dl className="cc-facts"><div><dt>Organization</dt><dd>{profile?.name}</dd></div><div><dt>Department / team</dt><dd>{w.department} · {w.team}</dd></div><div><dt>Declared owner</dt><dd>{w.owner||'Not declared'} · company supplied</dd></div><div><dt>On-call</dt><dd>{panel.agent.declaredMetadata?.onCallStatus??'Not reported'}</dd></div></dl>{w.kind==='workflow'&&<><h3>{w.roles.length} internal agent roles</h3><div className="cc-role-chips">{w.roles.map(role=><span key={role}><Bot size={15}/>{role}</span>)}</div></>}<p className="cc-scope">Company declaration matched to deployment v{w.version}. Role permissions and workflow outcomes are not verified by discovery.</p></section>:null;})()}
        {panel.agent.enrollment?<nav className="cc-agent-tabs" aria-label="Agent details">{["summary","activity","approvals","business"].map(value=><button key={value} aria-pressed={panel.view===value} onClick={()=>setPanel({...panel,view:value})}>{value === "summary" ? "Overview" : value === "activity" ? "Activity" : value === "approvals" ? "Approvals" : "Business details"}</button>)}</nav>:<div className="cc-agent-intro"><h3>Complete agent onboarding</h3><p>Choose an accountable owner and connect this deployment’s workflow history. Your agent stays in AWS.</p>{panel.agent.stale&&<p className="cc-agent-stale">Discovery needs a refresh before new onboarding. <Link href="/control-plane/connectors">Review connection</Link></p>}</div>}
        {panel.view==="setup"&&panel.agent.enrollment&&<button className="cc-link" onClick={()=>setPanel({...panel,view:"summary"})}>Back to overview</button>}
        {panel.agent.enrollment&&<div className="cc-agent-overview" hidden={panel.view!=="summary"}><section className="cc-agent-card"><h3><Building2 size={18} aria-hidden="true"/>Purpose & ownership</h3><p>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).purpose || "Purpose has not been provided by the company administrator."}</p><dl className="cc-facts"><div><dt>Department</dt><dd>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).department||"Not assigned"}</dd></div><div><dt>Team</dt><dd>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).team||"Not assigned"}</dd></div><div><dt>Environment</dt><dd>{businessDisplay(profile,panel.agent.key,panel.agent.declaredMetadata).environment||"Not specified"}</dd></div></dl><dl className="cc-facts"><div><dt>Accountable owner</dt><dd>{panel.agent.enrollment?.owner || "Not confirmed"}</dd></div><div><dt>Platform</dt><dd>AWS AgentCore · {panel.agent.region}</dd></div><div><dt>History setup</dt><dd>{panel.agent.enrollment ? "Onboarding saved; current read checked separately" : "Not connected"}</dd></div><div><dt>Execution enforcement</dt><dd>Not verified</dd></div></dl><p className="cc-agent-help">Company assignments override AWS-reported display labels. These labels do not grant permissions.</p></section><section className="cc-agent-card"><h3><ShieldCheck size={18} aria-hidden="true"/>Observed actions & tools</h3><p>Discovery does not expose the agent’s complete tool inventory or effective permissions.</p>{panel.agent.history ? [...new Map(telemetryRuns(panel.agent.history).flatMap(run=>telemetrySteps(run.events).filter(step=>step.action).map(step=>[step.first.actionName,telemetryStepCopy(step)] as const))).values()].map(copy=><p key={copy.title}><strong>{copy.title}</strong> · {copy.provider || "System not reported"}<small>Observed in connected activity; authority not verified.</small></p>) : <p>Observed tools load from connected history. Open Activity to retry if this summary remains empty.</p>}</section><details className="cc-agent-source"><summary>AWS-reported details &amp; technical identity</summary><RuntimeMetadata metadata={panel.agent.declaredMetadata} version={panel.agent.reference.version}/><h3>Technical identity</h3><p className="cc-reference">{panel.agent.reference.resourceArn}</p><p>Version {panel.agent.reference.version} · AWS account {panel.agent.account}</p></details><button className="cc-link" onClick={()=>setPanel({...panel,view:"setup"})}>Edit name, owner &amp; history source <ArrowRight size={14} aria-hidden="true"/></button></div>}
        {panel.view==="business" && <AgentBusinessEditor agentKey={panel.agent.key}/>}
        {panel.view==="approvals" ? <><label>Approval deployment<select aria-label="Approval deployment" value={cloudApprovalRef!.version} onChange={e=>setPanel({...selectedCloud!,approvalReference:selectedCloud!.agent.references.find(r=>r.version===e.target.value)})}>{panel.agent.references.map(r=><option key={r.version} value={r.version}>Version {r.version}</option>)}</select></label><p>This selects a saved deployment connection; it does not grant authority to another version.</p><ExternalWorkflowApprovals reference={cloudApprovalRef!} runId={panel.approvalRunId} onDecision={onRefresh}/></> : panel.view!=="summary" && panel.view!=="business" && (panel.agent.enrollment||!panel.agent.stale) && <AwsWorkflowHistory compact={!panel.agent.enrollment} reference={panel.agent.reference} name={panel.agent.name} mode={!panel.agent.enrollment||panel.view==="setup"?"setup":"activity"} references={panel.agent.references} onHistory={h=>updateHistory(panel.agent,h)}/>}
        {!panel.agent.enrollment&&<details className="cc-agent-source"><summary>AWS-reported agent details</summary><RuntimeMetadata metadata={panel.agent.declaredMetadata} version={panel.agent.reference.version}/><p className="cc-reference">{panel.agent.reference.resourceArn}</p></details>}
      </>}
      {(panel.kind === "execution" || panel.kind === "approval") && <>
        <p className="cc-scope">{panel.execution.agent.name} · AWS · {panel.execution.agent.region}</p>
        {panel.kind === "execution" ? <><AwsExecutionBrowser key={panel.execution.key} runs={[panel.execution.run]} runtimeVersion={panel.execution.agent.reference.version} references={panel.execution.agent.references} initialSelectedId={panel.execution.run.id} detailsOnly onQuote={id=>{setQuery(id);setPanel(null);}}/><p className="cc-scope">Approval review uses the execution’s reported deployment version, not the newest deployment. Mixed or unknown versions require connection review.</p><button className="cp-button" disabled={!executionReference(panel.execution.run.events,panel.execution.agent.references)} onClick={()=>setPanel({kind:"approval",execution:panel.execution})}><ShieldCheck size={16}/>Review this execution’s approvals</button></> : <><button className="cc-link" onClick={()=>setPanel({kind:"execution",execution:panel.execution})}>Back to execution</button><ExternalWorkflowApprovals reference={executionReference(panel.execution.run.events,panel.execution.agent.references)!} runId={panel.execution.run.id} approvalIds={executionApprovalIds(panel.execution.run.events)} onDecision={onRefresh}/></>}
      </>}
      {panel.kind === "local" && <><AgentBusinessEditor agentKey={`sample:${panel.agent.id}`}/><dl className="cc-facts"><div><dt>Owner</dt><dd>{panel.agent.owner || "Not supplied"}</dd></div><div><dt>Allowed action</dt><dd>{agentPresentation(panel.agent.tools).action}</dd></div></dl><p>Sample system. Existing server permission and approval rules still apply.</p>{panel.agent.tools.includes("twin.crm") ? <ConnectorActionsWorkspace connector="crm"/> : panel.agent.tools.includes("twin.email") ? <ConnectorActionsWorkspace connector="email"/> : panel.agent.tools.includes("proof.discount") ? <DurableWorkspace scriptDemo/> : <Link className="cp-button secondary" href="/control-plane/quotes">Review the installed quote workflow</Link>}</>}
      {panel.kind === "register" && <AgentsWorkspace scriptDemo/>}
      {panel.kind === "connections" && <SavedWorkspace section="connections" awsConnections={awsEnabled}/>}
      {panel.kind === "policy" && <SavedWorkspace section="policies" awsConnections={awsEnabled}/>}
      {panel.kind === "samples" && <><SavedWorkspace section="approvals"/><details><summary>Installed sample workflows and history</summary><SavedWorkspace section="workflows"/></details></>}
      </div>
    </Modal>}
    {page!=="overview"&&<p className="cc-scope"><Eye size={14} aria-hidden="true"/>Visibility, shared approval decisions and execution enforcement are separate capabilities. AWS is the connected cloud platform in this release.</p>}
  </div>;
}


function OverviewLoading(){
 return <div className="cc-overview-loading">
  <div className="cc-loading-message" role="status"><RefreshCw size={18} aria-hidden="true"/><div><strong>Loading your workspace…</strong><p>Checking company details, connected agents, activity and approvals.</p></div></div>
  <div className="cc-loading-shapes" aria-busy="true" aria-label="Overview data" role="region">
   <div className="cc-loading-scope" aria-hidden="true"><span className="cc-skeleton cc-skeleton-title"/><div>{[0,1,2].map(n=><span className="cc-skeleton" key={n}/>)}</div></div>
   <div className="cc-loading-stats" aria-hidden="true">{[0,1,2,3].map(n=><div key={n}><span className="cc-skeleton cc-skeleton-label"/><span className="cc-skeleton cc-skeleton-value"/><span className="cc-skeleton"/></div>)}</div>
   <div className="cc-loading-panels" aria-hidden="true">{[0,1].map(n=><div key={n}><span className="cc-skeleton cc-skeleton-title"/><span className="cc-skeleton"/><span className="cc-skeleton"/><span className="cc-skeleton cc-skeleton-label"/></div>)}</div>
  </div>
 </div>;
}
