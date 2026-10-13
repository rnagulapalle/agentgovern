// Private safe request facts only, never body/cookie/credentials or raw errors.
import {createHash} from 'node:crypto';
const routes=new Set(['/api/workspace/session','/api/workspace/records','/api/workspace/agents','/api/workspace/enquiries','/api/durable/workflows','/api/durable/connectors']);
const operations=new Set(['enroll','grant','prepare','submit','approve']);
const errors=new Map([
 ['The selected sample connector is unavailable.','connector-unavailable'],
 ['That agent ID already exists. Review its existing boundaries.','agent-exists'],
 ['Supported customer records are unavailable.','catalog'],
 ['Connector evidence unavailable. No safe retry inferred.','provider'],
 ['Sample CRM and messaging connector is not configured.','binding'],
 ['Trusted contact version is unavailable.','source'],
 ['The durable service could not complete this request. State was not assumed successful; refresh and inspect the action.','service'],
]);
export function controllerRequestDiagnostic(path,data,status,failure){
 const route=typeof path==='string'?path.split('?')[0]:'';
 const operation=route==='/api/workspace/agents'&&data?'register':operations.has(data?.operation)?data.operation:data?'unknown-post':'read';
 const agentId=['trial-crm','trial-email'].includes(data?.agentId)?data.agentId:['trial-crm','trial-email'].includes(data?.id)?data.id:undefined;
 const message=typeof failure?.error==='string'&&failure.error.length<=4096?failure.error:undefined;
 return {route:routes.has(route)?route:'unknown',operation,...(agentId?{agentId}:{}),httpStatus:Number.isInteger(status)&&status>=100&&status<=599?status:null,errorKind:errors.get(message)??'unknown',...(message?{errorMessageSha256:createHash('sha256').update(message).digest('hex')}: {})};
}
