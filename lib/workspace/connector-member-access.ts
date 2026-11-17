import type {PoolClient} from 'pg';
import type {Actor} from '../durable/contracts';
export type MemberConnectorOperation='read'|'propose'|'review'|'execute'|'reconcile';
export type MemberConnectorContext={operation:MemberConnectorOperation;agentId:string;connector:string;bindingId:string;contactId?:string;recipient?:string};
export type ConnectorMemberAccess={contract:'connector-member-access-1';version:number;administrators:string[];members:{subject:string;personId:string;grants:{agentId:string;connector:'crm'|'email';scopeId:string;bindingId:string;permissions:MemberConnectorOperation[];expiresAt:string}[]}[]};
const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.getPrototypeOf(x)===Object.prototype;
const exact=(x:unknown,keys:string[]):x is Record<string,unknown>=>object(x)&&Object.keys(x).sort().join() === [...keys].sort().join();
const email=(x:unknown):x is string=>typeof x==='string'&&x.length<=254&&/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(x);
export function parseConnectorMemberAccess(x:unknown):ConnectorMemberAccess{
 const fail=():never=>{throw Error('Invalid connector member authority. No permission was granted.');};
 if(!exact(x,['contract','version','administrators','members'])||x.contract!=='connector-member-access-1'||!Number.isSafeInteger(x.version)||Number(x.version)<1||!Array.isArray(x.administrators)||!x.administrators.length||x.administrators.length>10||x.administrators.some(e=>!email(e))||new Set(x.administrators).size!==x.administrators.length||!Array.isArray(x.members)||x.members.length>50)return fail();
 for(const m of x.members){
  if(!exact(m,['subject','personId','grants'])||!email(m.subject)||x.administrators.includes(m.subject)||typeof m.personId!=='string'||!/^person-[0-9]{3}$/.test(m.personId)||!Array.isArray(m.grants)||m.grants.length>20)return fail();
  for(const g of m.grants){if(!exact(g,['agentId','connector','scopeId','bindingId','permissions','expiresAt'])||typeof g.agentId!=='string'||!/^[-a-zA-Z0-9_]{1,64}$/.test(g.agentId)||!['crm','email'].includes(String(g.connector))||typeof g.scopeId!=='string'||! /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(g.scopeId)||typeof g.bindingId!=='string'||! /^[a-f0-9]{64}$/.test(g.bindingId)||!Array.isArray(g.permissions)||!g.permissions.length||g.permissions.some(p=>!['read','propose','review','execute','reconcile'].includes(p))||new Set(g.permissions).size!==g.permissions.length||typeof g.expiresAt!=='string'||!Number.isFinite(Date.parse(g.expiresAt))||new Date(g.expiresAt).toISOString()!==g.expiresAt)return fail();}
  if(new Set(m.grants.map(g=>JSON.stringify([g.agentId,g.connector,g.scopeId]))).size!==m.grants.length)return fail();
 }
 if(new Set(x.members.map(m=>m.subject)).size!==x.members.length||new Set(x.members.map(m=>m.personId)).size!==x.members.length||Buffer.byteLength(JSON.stringify(x))>65536)return fail();
 return structuredClone(x) as ConnectorMemberAccess;
}
async function policy(c:PoolClient,org:string){return (await c.query("SELECT to_jsonb(o)->'connector_member_access' AS access FROM ll_orgs o WHERE id=$1",[org])).rows[0]?.access??null;}
export async function connectorMemberPolicyEnabled(c:PoolClient,org:string){return await policy(c,org)!==null;}
/** No context means ordinary administrator authority. Directory metadata is never read. */
export async function memberConnectorAllowed(c:PoolClient,org:string,subject:string,contextInput?:MemberConnectorContext|(()=>MemberConnectorContext)):Promise<boolean>{
 const raw=await policy(c,org);if(raw===null)return true;
 let p;try{p=parseConnectorMemberAccess(raw);}catch{return false;}
 if(!(await c.query('SELECT 1 FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true',[org,subject])).rows[0])return false;
 if(p.administrators.includes(subject))return true;
 let context:MemberConnectorContext|undefined;try{context=typeof contextInput==="function"?contextInput():contextInput;}catch{return false;}
 if(!context||!['crm','email'].includes(context.connector)||!context.contactId||!context.recipient)return false;
 const member=p.members.find(m=>m.subject===subject);if(!member)return false;
 const now=Date.now();
 for(const grant of member.grants){
  if(grant.agentId!==context.agentId||grant.connector!==context.connector||grant.bindingId!==context.bindingId||!grant.permissions.includes(context.operation)||Date.parse(grant.expiresAt)<=now)continue;
  const scope=(await c.query("SELECT 1 FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND binding_id=$3 AND contact_id=$4 AND recipient=$5 AND active=true AND contract_version='private-record-twin-2'",[org,grant.scopeId,context.bindingId,context.contactId,context.recipient])).rows[0];
  if(scope)return true;
 }
 return false;
}
/** Existing owner and requester permissions also bound delegated agent/worker work. */
export async function connectorParticipantsAllowed(c:PoolClient,org:string,a:{agent_id:string;connector:string;proposed_by?:string;approved_by?:string|null},contextInput:Omit<MemberConnectorContext,'operation'|'agentId'|'connector'>|(()=>Omit<MemberConnectorContext,'operation'|'agentId'|'connector'>),approval:boolean){
 if(await policy(c,org)===null)return true;
 let context:Omit<MemberConnectorContext,"operation"|"agentId"|"connector">;try{context=typeof contextInput==="function"?contextInput():contextInput;}catch{return false;}
 const owner=(await c.query('SELECT owner FROM ll_agent_profiles WHERE org_id=$1 AND agent_id=$2',[org,a.agent_id])).rows[0]?.owner;
 const access={...context,agentId:a.agent_id,connector:a.connector};
 if(!owner||!await memberConnectorAllowed(c,org,owner,{...access,operation:'propose'}))return false;
 if(a.proposed_by&&a.proposed_by!==a.agent_id&&!await memberConnectorAllowed(c,org,a.proposed_by,{...access,operation:'propose'}))return false;
 return !approval||!!a.approved_by&&await memberConnectorAllowed(c,org,a.approved_by,{...access,operation:'review'});
}
export function connectorMemberContext(provider:{bindingId:string;recordScope?:{contactId:string;recipient:string}},operation:MemberConnectorOperation,agentId:string,connector:string):MemberConnectorContext{
 return {operation,agentId,connector,bindingId:provider.bindingId,contactId:provider.recordScope?.contactId,recipient:provider.recordScope?.recipient};
}
// Source-owned completion may retain uncertainty for a claim already sent. It never
// approves, claims, retries, dispatches or promotes revoked work to success.
export async function connectorCompletionIdentity(c:PoolClient,actor:Actor){
 return Boolean((await c.query("SELECT 1 FROM ll_sessions s JOIN ll_members m ON m.email=s.email WHERE s.hash=$1 AND s.expires_at>now() AND m.org_id=$2 AND m.email=$3 AND m.active=true",[actor.tokenHash,actor.orgId,actor.subject])).rows[0]);
}
