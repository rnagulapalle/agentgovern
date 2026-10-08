"use client";
import Link from "next/link";
import {useCallback,useEffect,useRef,useState} from "react";
import {PageTitle} from "./ui";
import {workspaceJson} from "@/lib/workspace/response";
interface RecordRow {id:string;contact_id:string;recipient:string;active:boolean;version:number}
interface Grant {scope_id:string;agent_id:string;active:boolean;version:number}
interface Data {available:boolean;realDelivery:false;candidates:{key:string;contactId:string;recipient:string}[];records:RecordRow[];grants:Grant[]}
interface Agent {id:string;name:string|null;owner:string|null;active:boolean;connector:string|null}
export function RecordsWorkspace(){
 const [data,setData]=useState<Data|null>(null),[agents,setAgents]=useState<Agent[]>([]),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 // Retain enrollment IDs across uncertain HTTP responses; another click is a retry.
 const enrollmentIds=useRef(new Map<string,string>());
 const refresh=useCallback(async()=>{const [r,a]=await Promise.all([fetch("/api/workspace/records",{cache:"no-store"}),fetch("/api/workspace/agents",{cache:"no-store"})]);const [v,av]=await Promise.all([workspaceJson(r),workspaceJson(a)]);if(!r.ok)throw new Error(v.error);if(!a.ok)throw new Error(av.error);setData(v);setAgents(av.agents);},[]);
 useEffect(()=>{refresh().catch(e=>setError(e.message));},[refresh]);
 async function change(p:Record<string,unknown>){setBusy(true);setError("");try{const r=await fetch("/api/workspace/records",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)});const v=await workspaceJson(r);if(!r.ok)throw new Error(v.error);await refresh();}catch(e){setError(e instanceof Error?e.message:"Access could not be changed. Refresh saved state before retrying.");}finally{setBusy(false);}}
 return <div className="cp-durable"><PageTitle eyebrow="RECORD BOUNDARIES" title="Records and access" description="Choose a supported customer record and decide which agents may act on it." />
 <section className="cp-panel cp-durable-card"><h2>Isolated customer records</h2><p>These records belong to private provider twins. No real customer data is connected and no real email is delivered. Granting access does not approve an action or start a workflow.</p><p><Link href="/control-plane/agents" prefetch={false}>Register an agent and its accountable owner →</Link></p></section>
 {error&&<p role="alert" className="cp-durable-message is-error">{error}</p>}
 <button className="cp-button secondary" disabled={busy} onClick={()=>{setError("");refresh().catch(e=>setError(e.message));}}>Refresh saved access</button>
 {!data&&<p role="status">Loading customer records…</p>}
 {data&&!data.available&&<p className="cp-durable-message">Record onboarding is unavailable for this connection. Contact your workspace administrator.</p>}
 {data?.available&&<section className="cp-panel cp-durable-card"><h2>Add a supported record</h2>{!data.candidates.length&&<p>Your administrator has not configured any supported records.</p>}{data.candidates.filter(c=>!data.records.some(r=>r.contact_id===c.contactId)).map(c=><div className="cp-durable-card" key={c.key}><h3>{c.recipient}</h3><p>Customer record {c.contactId}</p><button className="cp-button" disabled={busy} onClick={()=>{let id=enrollmentIds.current.get(c.key);if(!id){id=crypto.randomUUID();enrollmentIds.current.set(c.key,id);}void change({operation:"enroll",id,recordKey:c.key});}}>Add customer record</button></div>)}</section>}
 {data?.records.map(record=><section className="cp-panel cp-durable-card" key={record.id}><h2>{record.recipient}</h2><p>Customer record {record.contact_id} · {record.active?"Access enabled":"Access revoked"}</p><p>Revoking access prevents new actions from continuing. Restoring access does not revive earlier approvals.</p><button className="cp-button secondary" disabled={busy||!data.available} onClick={()=>void change({operation:"setScopeActive",scopeId:record.id,active:!record.active,expectedVersion:record.version})}>{record.active?"Revoke record access":"Restore record access"}</button>
 <h3>Agent access</h3>{data.grants.filter(g=>g.scope_id===record.id).map(g=>{const agent=agents.find(a=>a.id===g.agent_id);return <div className="cp-durable-card" key={g.agent_id}><p><strong>{agent?.name||g.agent_id}</strong> · {g.active?"Access granted":"Access revoked"}</p><p>Accountable owner: {agent?.owner||"Unavailable"}</p><button className="cp-button secondary" disabled={busy||!data.available} onClick={()=>void change({operation:"setGrantActive",scopeId:record.id,agentId:g.agent_id,active:!g.active,expectedVersion:g.version})}>{g.active?"Revoke agent access":"Restore agent access"}</button></div>;})}
 <form className="cp-durable-form" onSubmit={e=>{e.preventDefault();const id=new FormData(e.currentTarget).get("agentId");if(typeof id==="string")void change({operation:"grant",scopeId:record.id,agentId:id});}}><label>Agent to grant access<select name="agentId" required disabled={busy||!record.active||!data.available}><option value="">Choose an agent</option>{agents.filter(a=>a.active&&a.owner&&["crm_twin","email_twin"].includes(a.connector||"")&&!data.grants.some(g=>g.scope_id===record.id&&g.agent_id===a.id)).map(a=><option key={a.id} value={a.id}>{a.name||a.id} · {a.owner}</option>)}</select></label><button className="cp-button" disabled={busy||!record.active||!data.available}>Grant record access</button></form></section>)}
 </div>;
}
