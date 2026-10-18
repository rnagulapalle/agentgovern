// Dedicated actual PostgreSQL setup prerequisite. No provider/model/Docker effects.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,realpath,rm,writeFile,lstat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {Pool} from 'pg';
import {parseTransport,scopedPoolOptions} from '../lib/durable/pg-transport';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file';
import {bootstrapTenantContext} from '../lib/workspace/tenant-bootstrap';
import {tenantPoolBinding,assertTenantPool} from '../lib/durable/tenant-pool';
import {digest} from '../lib/workspace/identity';
import {installTemporalProofRoles} from './temporal-installed-fixture';
let phase="inputs",failedPhase:string|undefined;
async function main(){
const url=process.env.LOOPLABS_TEST_DATABASE_URL,transportFile=process.env.LOOPLABS_TEMPORAL_PROOF_DATABASE_TRANSPORT,output=process.env.LOOPLABS_TEMPORAL_PROOF_RECEIPT;
assert(url&&transportFile&&output,'Explicit owned setup inputs required');
const source=await readOwnedPrivateFile(transportFile,16384),transport=parseTransport(JSON.parse(source.bytes.toString()));await source.assertStable();assert(transport.mode==='verified-tls'&&transport.trust==='owned-ca');
const memberToken=randomBytes(32).toString('base64url');
const schema='temporal_setup_'+randomBytes(8).toString('hex'),root=await realpath(await mkdtemp(join(tmpdir(),'temporal-installed-setup-'))),epoch=randomUUID();
const privateRoot=await lstat(root);assert(privateRoot.isDirectory()&&!privateRoot.isSymbolicLink()&&privateRoot.uid===process.getuid!()&&(privateRoot.mode&0o777)===0o700,'Owned private setup directory required');
const admin=new Pool(await scopedPoolOptions({url,schema:'public',purpose:'installer',transport}));
let installed:Awaited<ReturnType<typeof installTemporalProofRoles>>|undefined,web:Awaited<ReturnType<typeof bootstrapTenantContext>>|undefined,passed=false,poolsClosed=false,schemaOid:string|undefined;const checks:string[]=[];
try{
 phase='schema-create';await admin.query('CREATE SCHEMA '+schema);schemaOid=(await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid;
 phase='real-role-installation';installed=await installTemporalProofRoles({url,transport,schema,generation:resolve(root,'generation'),epoch,installation:'p'+randomBytes(8).toString('hex'),seed:async owner=>{await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash)VALUES('requester','local-proof','Requester','unused')");await owner.query("INSERT INTO ll_sessions(hash,email,expires_at)VALUES($1,'requester',now()+interval '1 hour')",[digest(memberToken)]);}});
 phase='web-bootstrap';web=await bootstrapTenantContext(installed.webFile);const context=await web.context.member(memberToken);assert(context.actor);
 for(const [purpose,db]of [['web',context.db],['worker',installed.worker],['scheduler',installed.scheduler]] as const){
  phase=purpose+'-binding-and-privilege-check';const bound=tenantPoolBinding(db);assert(bound);assert.equal(bound.org,'local-proof');assert.equal(bound.epoch,epoch);assert.equal(bound.purpose,purpose);await assertTenantPool(db,'local-proof');
  const row=(await db.query('SELECT current_user role,(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()) ssl')).rows[0];assert.equal(row.role,bound.role);assert.equal(row.ssl,true);
  assert.equal((await db.query('SELECT count(*)::int count FROM ll_orgs')).rows[0].count,1);await assert.rejects(db.query('CREATE TABLE forbidden_owner_write(id integer)'),{code:'42501'});checks.push(purpose+' exact scoped role/TLS/org/epoch and owner-DDL refusal');
 }
 phase='migration-ledger';assert.deepEqual((await installed.owner.query('SELECT version FROM ll_migrations WHERE version>=25 ORDER BY version')).rows.map(r=>r.version),[25,26,27]);checks.push('real released setup and additive quote migrations25-27');
 phase='restore-epoch-refusal';await installed.owner.query('UPDATE ll_workspace_recovery SET epoch=$1 WHERE org_id=$2',[randomUUID(),'local-proof']);await assert.rejects(assertTenantPool(installed.worker,'local-proof'));checks.push('restored epoch invalidates previously registered worker');passed=true;
}finally{
 const observedPhase=phase;if(!passed)failedPhase=phase;phase='owned-cleanup';
 try{await web?.close();await installed?.close();poolsClosed=true;}catch{poolsClosed=false;}
 if(poolsClosed){if(installed)for(const[name,oid]of Object.entries(installed.roles)){assert.equal((await admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[name])).rows[0]?.oid,oid);await admin.query('DROP OWNED BY '+name);await admin.query('DROP ROLE '+name);}if(schemaOid){assert.equal((await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0]?.oid,schemaOid);await admin.query('DROP SCHEMA '+schema+' CASCADE');}await rm(root,{recursive:true,force:true});}
 await admin.end();await writeFile(output,JSON.stringify({status:passed&&poolsClosed?'passed':'failed',lastObservedPhase:observedPhase,checks,poolsClosed,providerCalls:0,modelCalls:0,workerStarted:false,production:false})+'\n',{mode:0o600,flag:'wx'});if(!poolsClosed)throw Error('Owned pools not quiescent; destructive cleanup withheld');
}

}
main().catch(error=>{const code=typeof error?.code==="string"&&/^[A-Z0-9_]{2,40}$/.test(error.code)?error.code:null;console.error(JSON.stringify({scope:"installed-temporal-setup",phase:failedPhase||phase,code,passed:false,providerCalls:0,modelCalls:0}));process.exitCode=1;});
