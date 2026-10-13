// Offline disposable Docker setup only. Uses the existing installer and scoped
// bootstrap; no request data, cloud broker or alternate execution engine.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {Pool} from 'pg';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {installTemporalProofRoles} from './temporal-installed-fixture';
import {readOwnedPrivateFile,readPublishedWebGeneration,bootstrapTenantContext} from '../lib/workspace/tenant-bootstrap';
import {scopedPoolOptions,parseTransport,type PostgreSQLTransport} from '../lib/durable/pg-transport';
export type GatewayOwnerInput={version:2;url:string;schema:string;installation:string;epoch:string;generation:string;transport:PostgreSQLTransport;agent:string;operator:string;legacyOperator:string};
const exact=(v:unknown,keys:string[])=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join()===keys.sort().join();
export function parseGatewayOwnerInput(value:unknown):GatewayOwnerInput{
 assert(exact(value,['version','url','schema','installation','epoch','generation','transport','agent','operator','legacyOperator']));const c=value as GatewayOwnerInput;
 assert.equal(c.version,2);assert(/^gateway_[a-f0-9]{16}$/.test(c.schema));assert(/^g[a-f0-9]{16}$/.test(c.installation));assert(/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(c.epoch));
 const u=new URL(c.url);assert.equal(u.protocol,'postgresql:');assert.equal(u.hostname,'trial-db');assert.equal(u.port,'5432');assert.equal(u.pathname,'/trial');assert.equal(u.username,'trial');assert(u.password&&!u.search&&!u.hash);
 assert.equal(c.generation,'/run/installation/generation');const transport=parseTransport(c.transport);assert.equal(transport.mode,'verified-tls');assert('trust'in transport&&transport.trust==='owned-ca'&&transport.caFile==='/run/db-ca/ca.pem');
 for(const s of [c.agent,c.operator,c.legacyOperator])assert(/^[a-zA-Z0-9_-]{32,128}$/.test(s));assert.equal(new Set([c.agent,c.operator,c.legacyOperator]).size,3);
 return {...c,transport};
}
export async function readGatewayOwnerInput(file:string){assert.equal(file,'/run/installation/owner.json');return parseGatewayOwnerInput(JSON.parse((await readOwnedPrivateFile(file,65536)).bytes.toString('utf8')));}
export async function setupInstalledGateway(c:GatewayOwnerInput){
 c=parseGatewayOwnerInput(c);assert(existsSync("/.dockerenv"),"Explicit disposable container required");
 const admin=new Pool(await scopedPoolOptions({url:c.url,schema:'public',purpose:'installer',transport:c.transport}));let installed:Awaited<ReturnType<typeof installTemporalProofRoles>>|undefined;
 try{
  // The helper refuses noncontainer/alternate targets before connecting. An
  // exclusive fresh schema is never adopted or recreated over another fixture.
  await admin.query(`CREATE SCHEMA ${c.schema}`);
  const schemaOid=(await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[c.schema])).rows[0].oid;
  installed=await installTemporalProofRoles({...c,endpoint:{kind:'owned-disposable-docker',hostname:'trial-db'},seed:async owner=>{
   const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
   await owner.query("INSERT INTO ll_agents(org_id,id,tools,action_limit) VALUES('local-proof','trial-agent',ARRAY['twin.crm','twin.email'],5)");
   await owner.query("INSERT INTO ll_connector_policies(org_id,connector) VALUES('local-proof','crm'),('local-proof','email')");
   await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','trial-agent','agent')",[digest(c.agent)]);
   await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash) VALUES('reviewer@example.test','local-proof','Trial reviewer','unused')");
   await owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'local-proof','reviewer@example.test','operator')",[digest(c.legacyOperator)]);
   await owner.query("INSERT INTO ll_sessions(hash,email,expires_at) VALUES($1,'reviewer@example.test',now()+interval '1 hour')",[digest(c.operator)]);
  }});
  const sealed=join(c.generation,'published-web');await mkdir(sealed,{mode:0o700});
  for(const name of ['web.json','ready.json'])await writeFile(join(sealed,name),await readFile(join(c.generation,name)),{mode:0o600,flag:'wx'});
  const publication=await readPublishedWebGeneration(join(sealed,'web.json'));await publication.assertStable();
  const loaded=await bootstrapTenantContext(join(sealed,'web.json'));
  try{
   const named=await loaded.context.member(c.operator),agent=await loaded.context.authenticated(c.agent);
   assert.equal(named.actor.subject,'reviewer@example.test');assert.equal(agent.actor.subject,'trial-agent');assert.equal(agent.actor.role,'agent');assert.equal(named.actor.orgId,'local-proof');assert.equal(agent.actor.orgId,'local-proof');
   assert.equal((await agent.db.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
   const webRole=(await agent.db.query('SELECT current_user role')).rows[0].role;
   assert.equal(publication.config.web[0].role,webRole);assert.notEqual(webRole,'trial');
   return {version:2,schema:c.schema,schemaOid,webRole,roles:installed.roles,epoch:c.epoch,webSha256:createHash('sha256').update(publication.configBytes).digest('hex'),verifiedDatabaseTLS:true,installedNamedMember:true,installedAgentRouting:true,ownerExcludedFromWeb:true};
  }finally{await loaded.close();}
 }finally{await installed?.close();await admin.end();}
}
export async function bootstrapInstalledGateway(file:string){
 assert.equal(file,'/run/web/web.json');
 // Owner, migration and workload credentials are forbidden, even if a valid
 // publication also exists. Provider credential remains in the controlled executor.
 for(const name of ['LOOPLABS_DATABASE_URL','LOOPLABS_TEST_DATABASE_URL','LOOPLABS_WORKLOAD_INSTALLATION_FILE','AWS_ACCESS_KEY_ID','AWS_SECRET_ACCESS_KEY'])assert(process.env[name]===undefined,'Owner/workload/cloud inputs forbidden in gateway');
 const publication=await readPublishedWebGeneration(file);assert.equal(publication.config.web.length,1);assert.equal(publication.config.web[0].org,'local-proof');assert.equal(publication.config.web[0].purpose,'web');assert.equal(publication.config.workloads.length,0);assert.equal(publication.config.transport?.mode,'verified-tls');
 await publication.assertStable();return bootstrapTenantContext(file,true);
}
