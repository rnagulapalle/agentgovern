"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight, Bot, Cloud, RefreshCw } from "lucide-react";
import { workspaceJson } from "@/lib/workspace/response";
import { awsAgentName, type AwsPlace } from "@/lib/workspace/aws-journey";
import { agentDestination, connectionEntry } from "@/lib/workspace/connection-navigation";
import { businessDisplay } from "@/lib/workspace/business-display";
import type { CloudRuntimeMetadata } from "@/lib/workspace/cloud-runtime-metadata";
import { useCompany, AgentBusinessEditor } from "./company-workspace";
import { AwsConnectionJourney } from "./aws-connection-journey";
import { AwsWorkflowHistory } from "./aws-workflow-history";
import { RuntimeMetadata } from "./runtime-metadata";
import { Modal } from "./ui";
import "./connections-discovery.css";

type Account={scope:{connectionId:string;accountId:string;region:string}};
type Reference=AwsPlace&{scanId:string};
type Enrollment={displayName:string;owner:string};
type RecordRow={record:{resourceArn:string;resourceId:string;version:string;declaredMetadata?:CloudRuntimeMetadata|null};observedInCurrentScan:boolean;stale:boolean};
type Inventory={scanId:string;stale:boolean;records:RecordRow[];historyTruncated?:boolean};
type AgentRow={account:Account;latest:Reference;reference:Reference;record:RecordRow;versions:RecordRow[];enrollment:Enrollment|null;error:string|null;history:"unread"|"read"|"missing"|"failed";stale:boolean};
async function read<T>(path:string,signal:AbortSignal,body?:object):Promise<T>{
  const response=await fetch(path,{cache:"no-store",signal,...(body?{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}:{})});
  const value=await workspaceJson(response);if(!response.ok)throw Error(value.error||"Connection details could not be read.");return value as T;
}
export function ConnectionsDiscovery({enabled}:{enabled:boolean}){
  const {snapshot}=useCompany(),profile=snapshot?.profile??null;
  const [rows,setRows]=useState<AgentRow[]>([]),[accounts,setAccounts]=useState<Account[]>([]),[loading,setLoading]=useState(enabled),[errors,setErrors]=useState<string[]>([]);
  const [coverage,setCoverage]=useState(false),[account,setAccount]=useState("all"),[refresh,setRefresh]=useState(0),[review,setReview]=useState<Reference|null>(null),[setup,setSetup]=useState(false);
  const [entryReady,setEntryReady]=useState(false);
  const entered=useRef(false),generation=useRef(0);
  useEffect(()=>{const entry=connectionEntry(new URLSearchParams(window.location.search));setCoverage(entry.coverage);if(entry.connectionId)setAccount(entry.connectionId);setEntryReady(true);},[]);
  useEffect(()=>{
    if(!enabled||!entryReady)return;
    const controller=new AbortController(),sequence=++generation.current;const active=()=>!controller.signal.aborted&&sequence===generation.current;
    setLoading(true);setErrors([]);setRows([]);
    async function load(){const failures:string[]=[],result:AgentRow[]=[];
      try{
        const directory=await read<{connections:Account[];truncated?:boolean}>("/api/workspace/discovery",controller.signal);
        if(!Array.isArray(directory.connections))throw Error("Saved AWS accounts could not be confirmed.");
        if(active())setAccounts(directory.connections);
        if(account!=="all"&&!directory.connections.some(a=>a.scope.connectionId===account))failures.push("The linked account is not in your saved connections. Select a loaded account.");
        if(directory.truncated||directory.connections.length>10)failures.push("Showing up to 10 saved accounts. Additional accounts are outside this view.");
        for(const connection of directory.connections.slice(0,10)){
          if(account!=="all"&&connection.scope.connectionId!==account)continue;
          try{
            const inventory=await read<Inventory>(`/api/workspace/discovery?connectionId=${encodeURIComponent(connection.scope.connectionId)}`,controller.signal);
            if(!Array.isArray(inventory.records))throw Error("Saved inventory could not be confirmed.");
            if(inventory.historyTruncated||inventory.records.length>100)failures.push(`Account …${connection.scope.accountId.slice(-4)}: saved inventory is partial.`);
            const groups=new Map<string,RecordRow[]>();
            for(const record of inventory.records.slice(0,100)){const group=groups.get(record.record.resourceArn)??[];group.push(record);groups.set(record.record.resourceArn,group);}
            for(const versions of groups.values()){
              versions.sort((a,b)=>Number(b.observedInCurrentScan)-Number(a.observedInCurrentScan)||Number(b.record.version)-Number(a.record.version));
              const latest=versions[0],ref=(record:RecordRow):Reference=>({connectionId:connection.scope.connectionId,scanId:inventory.scanId,resourceArn:record.record.resourceArn,version:record.record.version});
              let chosen=latest,enrollment:Enrollment|null=null,error:string|null=null;
              for(const version of coverage?versions.slice(0,1):versions){try{const saved=await read<{enrollment:Enrollment|null}>("/api/workspace/discovery/onboarding",controller.signal,{operation:"enrollment",...ref(version)});if(saved.enrollment){chosen=version;enrollment=saved.enrollment;break;}}catch(e){error=e instanceof Error?e.message:"Saved onboarding could not be checked.";break;}}
              let history:AgentRow["history"]="unread";
              if(coverage){if(error)history="failed";else if(!enrollment)history="missing";else try{const saved=await read<{events:unknown[]}>("/api/workspace/discovery/onboarding",controller.signal,{operation:"history",connectionId:connection.scope.connectionId,resourceArn:chosen.record.resourceArn,version:chosen.record.version,hours:24});if(!Array.isArray(saved.events))throw Error("History read could not be confirmed.");history="read";}catch(e){history="failed";error=e instanceof Error?e.message:"History could not be read.";}}
              result.push({account:connection,latest:ref(latest),reference:ref(chosen),record:chosen,versions,enrollment,error,history,stale:inventory.stale||chosen.stale||!chosen.observedInCurrentScan});
              if(active())setRows([...result]);
            }
          }catch(e){failures.push(`Account …${connection.scope.accountId.slice(-4)}: ${e instanceof Error?e.message:"Inventory unavailable."}`);}
        }
        if(active()&&!entered.current){entered.current=true;const params=new URLSearchParams(window.location.search),entry=connectionEntry(params);
          if(entry.invalid||params.get("context")==="invalid")failures.push("The linked agent reference was incomplete or invalid. Choose an agent from saved inventory.");
          else if(entry.place){const source=result.find(row=>row.reference.connectionId===entry.place!.connectionId&&row.reference.resourceArn===entry.place!.resourceArn);if(source){const inventory=await read<Inventory>(`/api/workspace/discovery?connectionId=${encodeURIComponent(entry.place.connectionId)}`,controller.signal);if(inventory.records.some(r=>r.record.resourceArn===entry.place!.resourceArn&&r.record.version===entry.place!.version)){if(active())setReview({...entry.place,scanId:inventory.scanId});}else failures.push("The linked deployment version is not in your saved inventory. Refresh discovery to check it.");}else failures.push("The linked agent is not in your loaded accounts. Choose an account below.");}
        }
      }catch(e){failures.push(e instanceof Error?e.message:"Saved connections unavailable.");}
      finally{if(active()){setRows(result);setErrors(failures);setLoading(false);}}
    }
    void load();return()=>controller.abort();
  },[enabled,entryReady,coverage,account,refresh]);
  const visible=rows.filter(row=>!coverage||row.history!=="read");
  const selected=review?rows.find(row=>row.reference.connectionId===review.connectionId&&row.reference.resourceArn===review.resourceArn):null;
  const selectedRecord=selected?.versions.find(row=>row.record.version===review?.version);
  return <>
    <section className="cp-panel cp-durable-card"><h2>Agent platforms</h2><p>Connect a platform, review discovered agents and choose which to onboard. Your workflows stay where they run.</p>
      <article className="saved-workspace-row"><div><h3><Cloud size={18} aria-hidden="true"/> AWS AgentCore</h3><p>{enabled?"Saved account inventory and agent onboarding":"AWS discovery is not enabled in this deployment."}</p></div>{enabled&&<button className="cp-button cp-button-dark" onClick={()=>setSetup(true)}>Manage AWS accounts</button>}</article>
      <details><summary>Other platforms</summary><p>Microsoft Foundry · Coming soon</p><p>Google Vertex AI · Coming soon</p><p>Discovery and action controls are not available for these platforms in this deployment.</p></details>
    </section>
    <section className="cp-panel cp-durable-card" id="discovered-agents"><h2>Discovered agents</h2><p>Review ownership and history setup here. Open an onboarded agent for its activity and approvals.</p>
      {enabled&&<><div className="connections-toolbar"><label>AWS account<select aria-label="Discovery account" value={account} onChange={e=>setAccount(e.target.value)}><option value="all">All loaded accounts</option>{accounts.map(a=><option key={a.scope.connectionId} value={a.scope.connectionId}>…{a.scope.accountId.slice(-4)} · {a.scope.region}</option>)}</select></label><label>Show<select aria-label="Connection coverage filter" value={coverage?"history":"all"} onChange={e=>setCoverage(e.target.value==="history")}><option value="all">All discovered agents</option><option value="history">History missing or unreadable</option></select></label><button className="cp-button secondary" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={16} aria-hidden="true"/>Refresh saved status</button></div>
      {coverage&&<p className="saved-workspace-scope">Checking saved history connections for the last 24 hours. Failed reads remain visible; they do not mean no activity occurred.</p>}
      {errors.map(error=><p role="alert" className="cp-durable-message is-error" key={error}>{error}</p>)}
      {loading&&<p role="status">Checking saved inventory and onboarding…</p>}
      {visible.map(row=>{const key=JSON.stringify([row.reference.connectionId,row.reference.resourceArn]),business=businessDisplay(profile,key,row.record.record.declaredMetadata),name=row.enrollment?.displayName??awsAgentName(row.record.record.resourceId);return <article className="connections-agent" key={key}><div><h3><Bot size={18} aria-hidden="true"/>{name}</h3><p>{business.purpose||"Business purpose not provided"}</p><p className="saved-workspace-scope">{business.department||"Department not assigned"} · {business.team||"Team not assigned"} · {row.enrollment?.owner||"Accountable owner not confirmed"}</p><p className="saved-workspace-scope">AWS …{row.account.scope.accountId.slice(-4)} · {row.account.scope.region} · Version {row.reference.version}</p><div className="connections-status"><span className="saved-workspace-badge">{row.error?"Connection needs review":row.enrollment?"Onboarding saved":"Discovered only"}</span><span className="saved-workspace-scope">{row.history==="read"?"History read":row.history==="failed"?"History read failed":row.history==="missing"?"History not connected":row.error?"History connection not confirmed":row.enrollment?"History setup saved · current read not checked":"History not connected"}</span></div>{row.error&&<p role="alert">{row.error}</p>}{row.stale&&<p className="saved-workspace-scope">Saved inventory needs refresh. Existing onboarding is retained.</p>}</div><div className="connections-agent-actions">{row.enrollment?<><Link className="cp-button cp-button-dark" href={agentDestination(row.reference)}>Open agent <ArrowRight size={16} aria-hidden="true"/></Link><button className="cc-link" onClick={()=>setReview(row.reference)}>Review connection</button></>:<button className="cp-button cp-button-dark" onClick={()=>setReview(row.reference)}>Review agent <ArrowRight size={16} aria-hidden="true"/></button>}{row.latest.version!==row.reference.version&&<button className="cp-button secondary" onClick={()=>setReview(row.latest)}>Review version {row.latest.version} update</button>}</div></article>;})}
      {!loading&&!visible.length&&<p>{errors.length?"Inventory could not be fully checked. Retry before concluding there are no agents to review.":coverage?"No history gaps found among the loaded deployments.":"No saved agents in this account scope. Manage AWS accounts to run discovery."}</p>}
      <p className="saved-workspace-scope">Refreshing saved status does not scan AWS for new agents. Use Manage AWS accounts to verify access and refresh discovery. Discovery does not enable execution controls.</p></>}
    </section>
    {setup&&<Modal drawer wide title="AWS account connection" onClose={()=>{setSetup(false);setRefresh(n=>n+1);}}><AwsConnectionJourney onAgentSelect={reference=>{setSetup(false);setReview(reference);setRefresh(n=>n+1);}}/></Modal>}
    {review&&<Modal drawer wide title="Review agent connection" onClose={()=>{setReview(null);setRefresh(n=>n+1);}}><div className="cp-durable"><p>Review this exact deployment’s owner and history source. Activity and approval decisions are available from Agent details.</p><p>AWS · Version {review.version}</p><RuntimeMetadata metadata={selectedRecord?.record.declaredMetadata??null} version={review.version}/><AwsWorkflowHistory reference={review} name={selected?.enrollment?.displayName??(selected?awsAgentName(selected.record.record.resourceId):"AWS agent")} mode="setup"/><AgentBusinessEditor agentKey={JSON.stringify([review.connectionId,review.resourceArn])}/><Link className="cp-button cp-button-dark" href={agentDestination(review)}>Open agent details <ArrowRight size={16} aria-hidden="true"/></Link><p className="saved-workspace-scope">An existing version’s approval connection does not authorize a newer version. Mandatory execution control remains unverified.</p></div></Modal>}
  </>;
}
