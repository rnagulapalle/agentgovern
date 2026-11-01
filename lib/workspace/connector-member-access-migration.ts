import {isDeepStrictEqual} from "node:util";
import type {Pool} from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {parseConnectorMemberAccess} from './connector-member-access';
/** Owner-only extension; does not create members, tokens, agents, records or effects. */
export async function installConnectorMemberAccess(owner:Pool,org:string,input:unknown){
 const next=parseConnectorMemberAccess(input),c=await owner.connect();
 try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query('SELECT pg_advisory_xact_lock(68391205)');
  if(!(await c.query("SELECT pg_get_userbyid(relowner)=current_user owned FROM pg_class WHERE oid='ll_orgs'::regclass")).rows[0]?.owned)throw Error('Offline table owner required.');
  for(const [version,file]of [[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[12,'lib/connectors/scope-schema.sql'],[22,'lib/quotes/membership-schema.sql'],[23,'lib/workspace/membership-authority-schema.sql']]as const){const digest=createHash('sha256').update(await readFile(file)).digest('hex');if((await c.query('SELECT digest FROM ll_migrations WHERE version=$1',[version])).rows[0]?.digest!==digest)throw Error('Current member/record authority prerequisite required.');}
  const sql=await readFile('lib/workspace/connector-member-access-schema.sql','utf8'),digest=createHash('sha256').update(sql).digest('hex');const old=(await c.query('SELECT digest FROM ll_migrations WHERE version=32')).rows[0];
  if(old&&old.digest!==digest)throw Error('Applied member authority migration changed.');if(!old){await c.query(sql);await c.query('INSERT INTO ll_migrations(version,digest)VALUES(32,$1)',[digest]);}
  const row=(await c.query('SELECT connector_member_access FROM ll_orgs WHERE id=$1 FOR UPDATE',[org])).rows[0];if(!row)throw Error('Exact company required.');
  if(isDeepStrictEqual(row.connector_member_access,next)){await c.query('COMMIT');return {migration:32,repeated:true,version:next.version};}
  for(const subject of [...next.administrators,...next.members.map(m=>m.subject)])if(!(await c.query('SELECT 1 FROM ll_members WHERE org_id=$1 AND email=$2 AND active=true',[org,subject])).rows[0])throw Error('Current same-company named member required.');
  for(const member of next.members)for(const g of member.grants){if(!(await c.query("SELECT 1 FROM ll_connector_scopes s JOIN ll_connector_scope_grants g ON g.org_id=s.org_id AND g.scope_id=s.id JOIN ll_agents a ON a.org_id=g.org_id AND a.id=g.agent_id WHERE s.org_id=$1 AND s.id=$2 AND s.binding_id=$3 AND s.active=true AND g.agent_id=$4 AND g.active=true AND a.active=true AND $5=ANY(a.tools)",[org,g.scopeId,g.bindingId,g.agentId,'twin.'+g.connector])).rows[0])throw Error('Exact active enrolled record and agent capability required.');}
  await c.query('UPDATE ll_orgs SET connector_member_access=$2::jsonb WHERE id=$1',[org,JSON.stringify(next)]);await c.query('COMMIT');return {migration:32,repeated:Boolean(old),version:next.version};
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
