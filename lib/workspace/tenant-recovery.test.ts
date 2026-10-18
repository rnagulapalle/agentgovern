/** Actual dedicated PostgreSQL installation/restore tests. No provider writes,
 * runtime owner fallback, fake classification, epoch or released schema edits. */
import {afterEach,describe,expect,it} from 'vitest';
import {Pool} from 'pg';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,access} from 'node:fs/promises';
import {join,dirname,isAbsolute} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {captureExistingRecoveryIdentity,recoverExistingTenantInstallation} from './tenant-installer';
import {bootstrapTenantContext} from './tenant-bootstrap';
import {quarantineRestore} from '../durable/recovery';
import {createWorkloadPool} from '../durable/workload-pool';
const exec=promisify(execFile),hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>|undefined;
const extra:Pool[]=[];
afterEach(async()=>{await Promise.all(extra.splice(0).map(p=>p.end()));await fixture?.close();fixture=undefined;});
async function setup(){fixture=await createInstalledTenantFixture({tenants:['one'],salesOrg:'one',seed:async()=>{}});const spec=fixture.captureRecovery();const capture=join(dirname(spec.generation),'identity.json');await captureExistingRecoveryIdentity(spec.ownerUrl,spec.target,spec.generation,capture,spec.verify,spec.execution);return{fixture,spec,capture,captureSha256:hash(await readFile(capture))};}
async function quarantine(ctx:Awaited<ReturnType<typeof setup>>,archiveSha256='b'.repeat(64)){
 await ctx.fixture.quiesceRuntime();const epoch=randomUUID();await quarantineRestore(ctx.fixture.owner,'one',epoch,archiveSha256);const oid=(await ctx.fixture.owner.query('SELECT oid::text FROM pg_namespace WHERE nspname=$1',[ctx.fixture.schema])).rows[0].oid;
 return{target:{...ctx.spec.target,tenants:[{org:'one',epoch}]},input:{originalDirectory:ctx.spec.generation,identityFile:ctx.capture,identitySha256:ctx.captureSha256,restoredSchemaOid:oid,archiveSha256,acknowledgement:'WRITERS_STOPPED_AND_EPOCH_ROTATED' as const},output:join(dirname(ctx.spec.generation),'recovered')};
}
async function stopped(ctx:Awaited<ReturnType<typeof setup>>){const roles=JSON.parse(await readFile(ctx.capture,'utf8')).roles;expect((await ctx.fixture.owner.query('SELECT rolname FROM pg_roles WHERE oid=ANY($1::oid[]) AND rolcanlogin',[roles.map((x:{oid:string})=>x.oid)])).rows).toEqual([]);}
async function oldDenied(url:string){const pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:1500});try{await expect(pool.query('SELECT 1')).rejects.toMatchObject({code:expect.stringMatching(/^(28000|28P01)$/)});}finally{await pool.end();}}
async function terminateOwnedRecovery(ctx:Awaited<ReturnType<typeof setup>>,ownedPid:number){const owned=(await ctx.fixture.owner.query('SELECT a.pid FROM pg_stat_activity a WHERE a.pid=$1 AND a.usename=current_user AND a.datname=current_database() AND a.pid<>pg_backend_pid() AND EXISTS(SELECT 1 FROM pg_locks l WHERE l.pid=a.pid AND l.locktype=\'advisory\' AND l.granted)',[ownedPid])).rows;expect(owned).toEqual([{pid:ownedPid}]);expect((await ctx.fixture.owner.query('SELECT pg_terminate_backend($1) stopped',[ownedPid])).rows[0].stopped).toBe(true);}
describe('offline recovery of original installed role identities',()=>{
 it('capture refuses excess privileges rather than laundering them into its allowlist',async()=>{
  fixture=await createInstalledTenantFixture({tenants:['one'],salesOrg:'one',seed:async()=>{}});const spec=fixture.captureRecovery(),web=JSON.parse(await readFile(join(spec.generation,'web.json'),'utf8')).web[0];await fixture.owner.query(`GRANT DELETE ON ll_members TO ${web.role}`);
  const capture=join(dirname(spec.generation),'excess.json');await expect(captureExistingRecoveryIdentity(spec.ownerUrl,spec.target,spec.generation,capture,spec.verify,spec.execution)).rejects.toThrow('Installed grants');await expect(access(capture)).rejects.toMatchObject({code:'ENOENT'});
  expect((await fixture.owner.query("SELECT has_table_privilege($1,'ll_members','DELETE') allowed",[web.role])).rows[0].allowed).toBe(true); // rollback-only model did not silently normalize the original fault
 });
 it('committed NOLOGIN denies a reconnect and retains containment while a selected session remains',async()=>{
  const ctx=await setup(),args=await quarantine(ctx);const config=JSON.parse(await readFile(join(ctx.spec.generation,'web.json'),'utf8'));const active=new Pool({connectionString:config.web[0].url,max:1});extra.push(active);await active.query('SELECT 1');let reconnect=false;
  await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,async phase=>{if(phase==='fenced'){await oldDenied(config.web[0].url);reconnect=true;}},ctx.spec.execution)).rejects.toThrow('admission stopped');expect(reconnect).toBe(true);await stopped(ctx);await expect(access(join(args.output,'ready.json'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('wrong archive after quarantine is stopped without publication or new actions',async()=>{
  const ctx=await setup(),args=await quarantine(ctx);args.input.archiveSha256='c'.repeat(64);await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,undefined,ctx.spec.execution)).rejects.toThrow('admission stopped');await stopped(ctx);expect((await ctx.fixture.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);await expect(access(join(args.output,'ready.json'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('tampered original role OID refuses before modifying original logins',async()=>{
  const ctx=await setup(),args=await quarantine(ctx);const identity=JSON.parse(await readFile(ctx.capture,'utf8'));identity.roles[0].oid=String(Number(identity.roles[0].oid)+1);await writeFile(ctx.capture,JSON.stringify(identity));await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,undefined,ctx.spec.execution)).rejects.toThrow('unchanged');expect((await ctx.fixture.owner.query('SELECT count(*)::int n FROM pg_roles WHERE rolname=ANY($1::text[]) AND rolcanlogin',[identity.roles.filter((x:{login:boolean})=>x.login).map((x:{name:string})=>x.name)])).rows[0].n).toBe(4);
 });
 it('publication failure after LOGIN stage refences same roles and never restores old credentials',async()=>{
  const ctx=await setup(),args=await quarantine(ctx);const config=JSON.parse(await readFile(join(ctx.spec.generation,'web.json'),'utf8'));await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,async phase=>{if(phase==='login-enabled')throw Error('owned publication fault');},ctx.spec.execution)).rejects.toThrow('admission stopped');await stopped(ctx);await oldDenied(config.web[0].url);await expect(access(join(args.output,'ready.json'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('serializes the full lifecycle so another recovery cannot rotate its credentials',async()=>{
  const ctx=await setup(),args=await quarantine(ctx);let entered!:()=>void,release!:()=>void;
  const reached=new Promise<void>(resolve=>{entered=resolve;}),hold=new Promise<void>(resolve=>{release=resolve;});
  const first=recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,async phase=>{if(phase==='fenced'){entered();await hold;}},ctx.spec.execution);
  try{await Promise.race([reached,first.then(()=>{throw Error('Recovery completed before fence hold');})]);await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,join(dirname(ctx.spec.generation),'concurrent'),ctx.spec.verify,undefined,ctx.spec.execution)).rejects.toThrow('unchanged');await stopped(ctx);await expect(access(join(dirname(ctx.spec.generation),'concurrent','ready.json'))).rejects.toMatchObject({code:'ENOENT'});}
  finally{release();await first;}
  expect((await first).activated).toBe(false);
 },15000);
 it('terminated retained owner connection refuses without reconnecting or publishing',async()=>{
  const ctx=await setup(),args=await quarantine(ctx);let ownedPid:number|undefined;
  await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,async(phase,identity)=>{if(phase!=='fenced')return;ownedPid=identity.backendPid;
   await terminateOwnedRecovery(ctx,ownedPid);
  },ctx.spec.execution)).rejects.toThrow('fence unverified');expect(ownedPid).toBeTypeOf('number');await stopped(ctx);expect((await ctx.fixture.owner.query('SELECT pid FROM pg_stat_activity WHERE pid=$1',[ownedPid])).rows).toEqual([]);await expect(access(join(args.output,'ready.json'))).rejects.toMatchObject({code:'ENOENT'});
 });
 it('post-LOGIN connection loss reports an unverified fence and keeps private pending material unadmitted',async()=>{
  const ctx=await setup(),args=await quarantine(ctx),original=JSON.parse(await readFile(join(ctx.spec.generation,'web.json'),'utf8'));
  await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,async(phase,identity)=>{if(phase==='login-enabled')await terminateOwnedRecovery(ctx,identity.backendPid);},ctx.spec.execution)).rejects.toThrow('offline operator action required');
  // The dead owner connection cannot honestly claim a committed re-fence.
  const logins=(await ctx.fixture.owner.query('SELECT count(*)::int n FROM pg_roles WHERE rolname=ANY($1::text[]) AND rolcanlogin',[Object.keys(JSON.parse(await readFile(join(ctx.spec.generation,'ready.json'),'utf8')).roles)])).rows[0].n;expect(logins).toBe(4);
  const old=new Pool({connectionString:original.web[0].url,max:1,connectionTimeoutMillis:1500});try{await expect(old.query('SELECT 1')).rejects.toMatchObject({code:'28P01'});}finally{await old.end();}
  await expect(access(join(args.output,'ready.json'))).rejects.toMatchObject({code:'ENOENT'});await expect(access(join(args.output,'web.pending.json'))).resolves.toBeUndefined();expect((await ctx.fixture.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
 });
 it('final owner loss removes only its staged readiness marker and never claims recovery or a confirmed re-fence',async()=>{
  const ctx=await setup(),args=await quarantine(ctx);let staged=false;
  await expect(recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,async(phase,identity)=>{if(phase!=='ready-staged')return;await access(join(args.output,'ready.json'));staged=true;await terminateOwnedRecovery(ctx,identity.backendPid);},ctx.spec.execution)).rejects.toThrow('offline operator action required');
  expect(staged).toBe(true);await expect(access(join(args.output,'ready.json'))).rejects.toMatchObject({code:'ENOENT'});
  const entries=JSON.parse(await readFile(join(args.output,'workloads.json'),'utf8')).entries;for(const entry of entries){const file=join(args.output,'runtime',entry.role,'workloads.json');await expect(access(join(dirname(file),'ready.json'))).rejects.toMatchObject({code:'ENOENT'});await expect(createWorkloadPool({NODE_ENV:'test',LOOPLABS_WORKLOAD_INSTALLATION_FILE:file,LOOPLABS_DATABASE_URL:entry.url,LOOPLABS_WORKSPACE_ID:entry.org,LOOPLABS_RECOVERY_EPOCH:entry.epoch,LOOPLABS_TENANT_DATABASE_ROLE:entry.role,LOOPLABS_TENANT_DATABASE_SCHEMA:ctx.fixture.schema},entry.purpose,1,undefined,ctx.spec.execution)).rejects.toMatchObject({status:503});}
 await expect(access(join(args.output,'web.pending.json'))).resolves.toBeUndefined();expect((await ctx.fixture.owner.query('SELECT count(*)::int n FROM pg_roles WHERE rolname=ANY($1::text[]) AND rolcanlogin',[Object.keys(JSON.parse(await readFile(join(ctx.spec.generation,'ready.json'),'utf8')).roles)])).rows[0].n).toBe(4);
 });
 it('actual no-owner/no-acl archive repairs exact ACLs and rotates credentials at retained role OIDs',async()=>{
  const ctx=await setup(),original=JSON.parse(await readFile(join(ctx.spec.generation,'web.json'),'utf8')),work=JSON.parse(await readFile(join(ctx.spec.generation,'workloads.json'),'utf8')),beforeWeb=hash(await readFile(join(ctx.spec.generation,'web.json')));
  const bin=process.env.LOOPLABS_TEST_PG_BIN;if(bin&&!isAbsolute(bin))throw Error('Absolute owned PostgreSQL tool directory required');const tool=(name:string)=>bin?join(bin,name):name;
  const url=new URL(ctx.spec.ownerUrl),env={NODE_ENV:'test' as const,PATH:process.env.PATH,PGHOST:url.hostname,PGPORT:url.port,PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:decodeURIComponent(url.pathname.slice(1))};const archive=join(dirname(ctx.spec.generation),'owned.dump');
  await ctx.fixture.quiesceRuntime();await exec(tool('pg_dump'),['--schema',ctx.fixture.schema,'--format','custom','--no-owner','--no-acl','--file',archive],{env,timeout:30000});const backup=hash(await readFile(archive));const oldSchema=(await ctx.fixture.owner.query('SELECT oid::text FROM pg_namespace WHERE nspname=$1',[ctx.fixture.schema])).rows[0].oid;
  await exec(tool('pg_restore'),['--dbname',env.PGDATABASE,'--clean','--if-exists','--single-transaction','--no-owner','--no-acl',archive],{env,timeout:30000});const args=await quarantine(ctx,backup);expect(args.input.restoredSchemaOid).not.toBe(oldSchema);
  // PostgreSQL no-ACL restore creates default PUBLIC EXECUTE. Only captured
  // same-source function identities may be brought back to their reviewed ACL.
  const publicBefore=(await ctx.fixture.owner.query("SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('ll_bound_workspace()') AND a.grantee=0 AND a.privilege_type='EXECUTE') allowed")).rows[0].allowed;expect(publicBefore).toBe(true);
  const result=await recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,undefined,ctx.spec.execution);expect(result.activated).toBe(false);expect(result.originalSchemaOid).toBe(oldSchema);expect(result.restoredSchemaOid).toBe(args.input.restoredSchemaOid);
  for(const url of [original.broker.url,original.web[0].url,...work.entries.map((e:{url:string})=>e.url)])await oldDenied(url);expect(hash(await readFile(join(ctx.spec.generation,'web.json')))).toBe(beforeWeb);
  const ready=JSON.parse(await readFile(join(args.output,'ready.json'),'utf8')),originalReady=JSON.parse(await readFile(join(ctx.spec.generation,'ready.json'),'utf8'));expect(ready.roles).toEqual(originalReady.roles);expect((await ctx.fixture.owner.query("SELECT EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a WHERE p.oid=to_regprocedure('ll_bound_workspace()') AND a.grantee=0 AND a.privilege_type='EXECUTE') allowed")).rows[0].allowed).toBe(false);
  const loaded=await bootstrapTenantContext(join(args.output,'web.json'),false,false,undefined,ctx.spec.execution);await loaded.close();const entries=JSON.parse(await readFile(join(args.output,'workloads.json'),'utf8')).entries;for(const entry of entries){const pool=await createWorkloadPool({NODE_ENV:'test',LOOPLABS_WORKLOAD_INSTALLATION_FILE:join(args.output,'runtime',entry.role,'workloads.json'),LOOPLABS_DATABASE_URL:entry.url,LOOPLABS_WORKSPACE_ID:entry.org,LOOPLABS_RECOVERY_EPOCH:entry.epoch,LOOPLABS_TENANT_DATABASE_ROLE:entry.role,LOOPLABS_TENANT_DATABASE_SCHEMA:ctx.fixture.schema},entry.purpose,1,undefined,ctx.spec.execution);try{expect((await pool.query('SELECT current_user role')).rows[0].role).toBe(entry.role);}finally{await pool.end();}}
  expect((await ctx.fixture.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);
 },60000);
});

it('explicit format1 compatibility metadata retains bounded exact base roles and current recovery checks',async()=>{const ctx=await setup(),old=JSON.parse(await readFile(ctx.capture,'utf8'));delete old.contract;delete old.tenants;old.version=1;const bytes=Buffer.from(JSON.stringify(old));await writeFile(ctx.capture,bytes);ctx.captureSha256=hash(bytes);const args=await quarantine(ctx);const result=await recoverExistingTenantInstallation(ctx.spec.ownerUrl,args.target,args.input,args.output,ctx.spec.verify,undefined,ctx.spec.execution);expect(result.activated).toBe(false);for(const r of old.roles)expect(result.roles[r.name]).toBe(r.oid);expect(result.supplementalRoles).toEqual([]);expect((await ctx.fixture.owner.query('SELECT count(*)::int n FROM ll_connector_actions')).rows[0].n).toBe(0);},20000);
