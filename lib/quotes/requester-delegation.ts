/** Read-only recovered requester delegation from existing grants. The original
 * destination creator stays immutable. This snapshot grants no execution or
 * approval and must be freshly compared whenever configured pricing is used. */
import type {Pool,PoolClient} from 'pg';
export type RecoveredRequesterReference={workspaceId:string;scopeId:string;requester:string;createdBy:string;scopeVersion:number};
export async function readRecoveredQuoteRequesterDelegation(db:Pool|PoolClient,reference:RecoveredRequesterReference){
 const {workspaceId,scopeId,requester,createdBy,scopeVersion}=reference;
 if(requester===createdBy||!Number.isSafeInteger(scopeVersion)||scopeVersion<=1)return null;
 const scope=(await db.query("SELECT version,active,created_by FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND contract_version='private-quote-twin-1'",[workspaceId,scopeId])).rows;
 if(scope.length!==1||scope[0].version!==scopeVersion||scope[0].active!==true||scope[0].created_by!==createdBy)return null;
 const members=(await db.query('SELECT email,active FROM ll_members WHERE org_id=$1 AND email=ANY($2::text[]) ORDER BY email',[workspaceId,[requester,createdBy]])).rows;
 if(members.length!==2||!members.some(m=>m.email===requester&&m.active===true)||!members.some(m=>m.email===createdBy&&m.active===false))return null;
 const agents=(await db.query("SELECT a.id,p.role,g.version AS grant_version FROM ll_connector_scope_grants g JOIN ll_agents a ON a.org_id=g.org_id AND a.id=g.agent_id AND a.active=true JOIN ll_agent_profiles p ON p.org_id=a.org_id AND p.agent_id=a.id JOIN ll_members x ON x.org_id=p.org_id AND x.email=p.owner AND x.active=true WHERE g.org_id=$1 AND g.scope_id=$2 AND g.active=true AND g.created_by=$3 AND p.owner=$3 AND ((p.role='quote_agent' AND p.connector='quote_twin' AND 'twin.quote'=ANY(a.tools)) OR (p.role='email_agent' AND p.connector='email_twin' AND 'twin.email'=ANY(a.tools))) AND EXISTS(SELECT 1 FROM ll_tokens t WHERE t.org_id=a.org_id AND t.subject=a.id AND t.role='agent' AND t.active=true) ORDER BY p.role,a.id",[workspaceId,scopeId,requester])).rows;
 if(agents.length!==2||agents.filter(a=>a.role==='quote_agent').length!==1||agents.filter(a=>a.role==='email_agent').length!==1||agents.some(a=>!Number.isSafeInteger(a.grant_version)||a.grant_version<1))return null;
 return {scopeVersion,agents:agents.map(a=>({id:a.id as string,role:a.role as string,grantVersion:a.grant_version as number}))};
}
