import {parseCompanyProfile,type CompanyProfile,type WorkflowDeclaration} from './company-profile-contract';
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
/** Local file adapter. Only minimized declarations cross the API; raw env/input never does. */
export function importWorkflowCatalog(value:unknown,connectionId:string,profile:CompanyProfile):CompanyProfile{
 if(!object(value)||!Array.isArray(value.business_workflows)||!Array.isArray(value.runtimes)||value.business_workflows.length>1000||! /^[0-9]{12}$/.test(String(value.account))||! /^[a-z]{2}-[a-z]+-[1-9]$/.test(String(value.region)))throw Error('Choose a deployment inventory with account, region, runtimes and business_workflows.');
 const records=value.runtimes;const seen=new Set<string>();const catalog:WorkflowDeclaration[]=[];
 for(const raw of value.business_workflows){
  if(!object(raw)||typeof raw.runtime_id!=='string'||typeof raw.runtime_name!=='string'||!Array.isArray(raw.agents)||raw.agent_count!==raw.agents.length||seen.has(raw.runtime_id))throw Error('Workflow roles or runtime identities are inconsistent.');
  const runtime=records.find(r=>object(r)&&r.agentRuntimeId===raw.runtime_id);if(!object(runtime)||runtime.agentRuntimeVersion!==raw.runtime_version)throw Error('Inventory workflow version does not match its runtime.');
  seen.add(raw.runtime_id);
  const description=object(runtime.describe)&&typeof runtime.describe.description==='string'?runtime.describe.description:typeof runtime.description==='string'?runtime.description:'';
  catalog.push({connectionId,resourceArn:`arn:aws:bedrock-agentcore:${value.region}:${value.account}:runtime/${raw.runtime_id}`,version:String(raw.runtime_version),title:object(runtime.describe)&&typeof runtime.describe.title==='string'?runtime.describe.title:raw.runtime_name.replaceAll('_',' '),kind:'workflow',owner:String(raw.owner_person??''),department:String(raw.department??''),team:String(raw.team??''),purpose:description.slice(0,500),roles:raw.agents as string[],source:'company-declared'});
 }
 const other=records.filter(r=>object(r)&&!seen.has(String(r.agentRuntimeId)));
 if(other.length){if(!object(value.summary)||value.summary.operator_runtime_count!==other.length)throw Error('Classify supporting runtimes before importing.');for(const r of other){if(!object(r))throw Error('Invalid supporting runtime.');catalog.push({connectionId,resourceArn:`arn:aws:bedrock-agentcore:${value.region}:${value.account}:runtime/${r.agentRuntimeId}`,version:String(r.agentRuntimeVersion),title:String(r.agentRuntimeName).replaceAll('_',' '),kind:'operator',owner:'',department:'',team:'',purpose:'Operational controls for the business workflow.',roles:[],source:'company-declared'});}}
 const departments=[...profile.departments],teams=[...profile.teams],assignments=[...profile.assignments];
 const nextId=(prefix:string,used:{id:string}[])=>{let n=1;while(used.some(v=>v.id===`${prefix}-${n}`))n++;return `${prefix}-${n}`;};
 for(const w of catalog.filter(w=>w.kind==='workflow')){
  if(!w.department||!w.team)continue;
  let department=departments.find(d=>d.name===w.department);
  if(!department){department={id:nextId('catalog-dept',departments),name:w.department,businessUnit:''};departments.push(department);}
  let team=teams.find(t=>t.name===w.team&&t.departmentId===department!.id);
  if(!team){team={id:nextId('catalog-team',teams),name:w.team,departmentId:department.id};teams.push(team);}
  const agentKey=JSON.stringify([w.connectionId,w.resourceArn]);
  if(!assignments.some(a=>a.agentKey===agentKey)){
   const runtime=records.find(r=>object(r)&&r.agentRuntimeArn===w.resourceArn||object(r)&&`arn:aws:bedrock-agentcore:${value.region}:${value.account}:runtime/${r.agentRuntimeId}`===w.resourceArn);
   const environment=object(runtime)&&object(runtime.metadata)?runtime.metadata.WORKFLOW_ENVIRONMENT:'unknown';
   assignments.push({agentKey,teamId:team.id,purpose:w.purpose,environment:['production','staging','sandbox'].includes(String(environment))?environment as 'production'|'staging'|'sandbox':'unknown'});
  }
 }
 return parseCompanyProfile({...profile,departments,teams,assignments,catalog:[...(profile.catalog??[]).filter(w=>w.connectionId!==connectionId),...catalog]});
}
export {workflowDeclaration} from "./company-profile-contract";
