// Owned disposable gate lifecycle. The existing tenant installer supplies every
// SQL role, classification function and sealed publication; no runtime bypass.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,rm,realpath,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import pg from 'pg';
import {scopedPoolOptions} from '../lib/durable/pg-transport.ts';
import {passwordHash} from '../lib/workspace/auth.ts';
import {installTemporalProofRoles} from './temporal-installed-fixture.ts';
const command=(name,args,options={})=>execFileSync(name,args,{timeout:30000,encoding:'utf8',stdio:['ignore','pipe','pipe'],...options}).trim();
export function assertOwnedStagingResource(observed,id,nonce){
 assert.equal(observed.Id,id);assert.equal(observed.Labels?.['looplabs.owned-staging'],nonce);
}
export async function waitForOwnedSessionDrain(db,roles,sleep=()=>new Promise(r=>setTimeout(r,100))){
 assert(Array.isArray(roles)&&roles.length>0&&roles.every(role=>/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(role)));
 let remaining;for(let attempt=0;attempt<100;attempt++){remaining=Number((await db.query('SELECT count(*) n FROM pg_stat_activity WHERE usename=ANY($1::text[])',[roles])).rows[0].n);if(remaining===0)break;await sleep();}
 assert.equal(remaining,0,'Owned application sessions did not drain after confirmed child or pool exit');return remaining;
}
export async function retainStagingFailure(directory,stage,error){
 assert(['primary','sql-cleanup','setup-or-controller','pool-cleanup','container-cleanup','volume-cleanup','network-cleanup'].includes(stage));
 const redact=value=>String(value??'').replace(/(?:postgres(?:ql)?:|https?:)\S+/gi,'[URL]').replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[email]').replace(/[A-Za-z0-9_-]{32,}/g,'[value]');
 await writeFile(join(directory,stage+'-failure.json'),JSON.stringify({stage,name:error?.name,code:error?.code,message:redact(error?.message).split('\n')[0],stack:String(error?.stack??'').split('\n').filter(line=>line.includes('staging-')&&!line.includes('postgresql:')).slice(0,8).map(redact)},null,2)+'\n',{mode:0o600});
}
export async function withOwnedInstalledStagingFixture(callback){
 assert.equal(typeof callback,'function');
 const directory=await realpath(await mkdtemp(join(tmpdir(),'looplabs-installed-gate-'))),nonce=randomBytes(12).toString('hex'),name='ll-installed-gate-'+nonce;
 const docker=(...args)=>command('docker',args);
 let containerId,networkId,volumeName,admin,installed,owner,closedOwner=false,expectedSchemaOid,failed=false,sqlBaselineRestored=false,sqlBaselineReceipt;
 const diagnostics=(stage,error)=>retainStagingFailure(directory,stage,error);
 const schema='gateway_'+randomBytes(8).toString('hex'),installation='g'+randomBytes(8).toString('hex'),epoch=randomUUID(),password=randomBytes(32).toString('base64url');
 try{
  const tls=join(directory,'tls');await mkdir(tls,{mode:0o700});
  command('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout',join(tls,'ca.key'),'-out',join(tls,'ca.crt'),'-days','1','-subj','/CN=LoopLabs owned gate CA']);
  command('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',join(tls,'server.key'),'-out',join(tls,'server.csr'),'-subj','/CN=localhost']);
  await writeFile(join(tls,'extensions'),'subjectAltName=DNS:localhost,IP:127.0.0.1\n',{mode:0o600});
  command('openssl',['x509','-req','-in',join(tls,'server.csr'),'-CA',join(tls,'ca.crt'),'-CAkey',join(tls,'ca.key'),'-CAcreateserial','-out',join(tls,'server.crt'),'-days','1','-extfile',join(tls,'extensions')]);
  const ca=await readFile(join(tls,'ca.crt'));await chmod(join(tls,'ca.crt'),0o600);
  // The signing key is never copied into the running database container.
  const runtimeTLS=join(directory,'server-tls');await mkdir(runtimeTLS,{mode:0o700});
  for(const f of ['server.key','server.crt'])await copyFile(join(tls,f),join(runtimeTLS,f));
  await writeFile(join(runtimeTLS,'pg_hba.conf'),'local all all trust\nhostnossl all all all reject\nhostssl all all all scram-sha-256\n',{mode:0o600});
  const envFile=join(directory,'postgres.env');await writeFile(envFile,`POSTGRES_USER=ll_gate_owner\nPOSTGRES_PASSWORD=${password}\nPOSTGRES_DB=looplabs_gate\n`,{mode:0o600});
  networkId=docker('network','create','--label','looplabs.owned-staging='+nonce,name);
  volumeName=name+'-data';assert.equal(docker('volume','create','--label','looplabs.owned-staging='+nonce,volumeName),volumeName);
  const observedVolume=JSON.parse(docker('volume','inspect',volumeName))[0];assert.equal(observedVolume.Name,volumeName);assert.equal(observedVolume.Labels?.['looplabs.owned-staging'],nonce);
  containerId=docker('run','-d','--name',name,'--label','looplabs.owned-staging='+nonce,'--network',name,'--mount','type=volume,source='+volumeName+',target=/var/lib/postgresql/data','--memory','512m','--cpus','1','--pids-limit','128','--security-opt','no-new-privileges','--env-file',envFile,'-p','127.0.0.1::5432','postgres:16');
  const observedContainer=JSON.parse(docker('inspect',containerId))[0],volumeMounts=observedContainer.Mounts.filter(m=>m.Type==='volume');assert.equal(volumeMounts.length,1);assert.equal(volumeMounts[0].Name,volumeName);assert.equal(volumeMounts[0].Destination,'/var/lib/postgresql/data');
  for(let i=0;i<100;i++){try{docker('exec',name,'pg_isready','-U','ll_gate_owner','-d','looplabs_gate');break;}catch{if(i===99)throw Error('Owned database startup failed');await new Promise(r=>setTimeout(r,100));}}
  docker('cp',runtimeTLS,name+':/tmp/looplabs-gate-tls');
  docker('exec','-u','root',name,'chown','-R','postgres:postgres','/tmp/looplabs-gate-tls');
  docker('exec','-u','root',name,'chmod','600','/tmp/looplabs-gate-tls/server.key');
  docker('exec',name,'sh','-c',"printf \"ssl=on\\nssl_cert_file='/tmp/looplabs-gate-tls/server.crt'\\nssl_key_file='/tmp/looplabs-gate-tls/server.key'\\nhba_file='/tmp/looplabs-gate-tls/pg_hba.conf'\\n\" >> /var/lib/postgresql/data/postgresql.auto.conf");
  docker('restart',name);
  const port=docker('port',name,'5432').split(':').pop(),url=`postgresql://ll_gate_owner:${password}@localhost:${port}/looplabs_gate`;
  const transport={mode:'verified-tls',trust:'owned-ca',caFile:join(tls,'ca.crt'),caSha256:createHash('sha256').update(ca).digest('hex')};
  admin=new pg.Pool(await scopedPoolOptions({url,schema:'public',purpose:'installer',transport}));
  let ready=false;for(let i=0;i<100;i++){try{await admin.query('SELECT 1');ready=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert(ready);
  assert.equal((await admin.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);
  const plaintext=new pg.Pool({host:'127.0.0.1',port:Number(port),user:'ll_gate_owner',password,database:'looplabs_gate',ssl:false,connectionTimeoutMillis:1000});
  try{await assert.rejects(plaintext.query('SELECT 1'),e=>e.code==='28000');}finally{await plaintext.end();}
  const wrong=new pg.Pool(await scopedPoolOptions({url:url.replace(password,randomBytes(32).toString('base64url')),schema:'public',purpose:'installer',transport}));
  try{await assert.rejects(wrong.query('SELECT 1'),e=>e.code==='28P01');}finally{await wrong.end();}
  const before={roles:(await admin.query('SELECT oid::text oid,rolname FROM pg_roles ORDER BY oid')).rows,schemas:(await admin.query('SELECT oid::text oid,nspname FROM pg_namespace ORDER BY oid')).rows};
  await admin.query('CREATE SCHEMA '+schema);
  expectedSchemaOid=(await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid;
  const generation=join(directory,'tenant-generation');
  installed=await installTemporalProofRoles({url,transport,schema,generation,epoch,installation,seed:async db=>{
   for(const[email,name]of [['requester@example.test','Requester'],['reviewer@example.test','Reviewer']])await db.query("INSERT INTO ll_members(email,org_id,name,password_hash)VALUES($1,'local-proof',$2,$3)",[email,name,passwordHash(randomBytes(32).toString('base64url'))]);
  }});owner=installed.owner;
  const webDirectory=join(directory,'web-runtime');await mkdir(webDirectory,{mode:0o700});
  for(const f of ['web.json','ready.json'])await copyFile(join(generation,f),join(webDirectory,f));
  const fixture={...installed,directory,url,transport,schema,installation,epoch,generation,webFile:join(webDirectory,'web.json'),container:name,
   docker,admin,restartDatabase:async()=>{await installed.stopRuntimePools();if(!closedOwner){await owner.end();closedOwner=true;}await admin.end();docker('restart',name);const restartPort=docker('port',name,'5432').split(':').pop(),restartUrl=`postgresql://ll_gate_owner:${password}@localhost:${restartPort}/looplabs_gate`;admin=new pg.Pool(await scopedPoolOptions({url:restartUrl,schema:'public',purpose:'installer',transport}));fixture.admin=admin;fixture.url=restartUrl;let healthy=false;for(let attempt=0;attempt<100;attempt++){try{await admin.query('SELECT 1');healthy=true;break;}catch{await new Promise(r=>setTimeout(r,100));}}assert(healthy,'Actual owned TLS database restart unavailable');assert.equal((await admin.query('SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()')).rows[0].ssl,true);},observeRestoredSchema:async()=>{const row=(await admin.query('SELECT n.oid::text oid,r.rolname owner FROM pg_namespace n JOIN pg_roles r ON r.oid=n.nspowner WHERE n.nspname=$1',[schema])).rows[0];assert(row&&row.owner==='ll_gate_owner');assert.notEqual(row.oid,expectedSchemaOid);expectedSchemaOid=row.oid;return row.oid;},closeOwner:async()=>{assert(!closedOwner);await owner.end();closedOwner=true;},
   openOwner:async()=>{assert(closedOwner);owner=new pg.Pool(await scopedPoolOptions({url,schema,purpose:'installer',transport}));closedOwner=false;return owner;}};
  let result,primaryFailure,sqlCleanupFailure;
  try{result=await callback(fixture);}catch(error){primaryFailure=error;failed=true;await diagnostics('primary',error);}
  try{
   await installed.stopRuntimePools();if(!closedOwner){await owner.end();closedOwner=true;}
   // The child has exited and all local pools have ended. PostgreSQL may still
   // be processing their socket close; wait only for the actual owned role rows.
   await waitForOwnedSessionDrain(admin,Object.keys(installed.roles));
   for(const[role,oid]of Object.entries(installed.roles)){assert.equal((await admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0]?.oid,oid);await admin.query('DROP OWNED BY '+role);await admin.query('DROP ROLE '+role);}
   // An actual restore must explicitly observe its changed owned schema OID.
   assert.equal((await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0]?.oid,expectedSchemaOid);
   await admin.query('DROP SCHEMA '+schema+' CASCADE');
   const after={roles:(await admin.query('SELECT oid::text oid,rolname FROM pg_roles ORDER BY oid')).rows,schemas:(await admin.query('SELECT oid::text oid,nspname FROM pg_namespace ORDER BY oid')).rows};
   assert.deepEqual(after,before);sqlBaselineRestored=true;
   sqlBaselineReceipt={beforeSha256:createHash('sha256').update(JSON.stringify(before)).digest('hex'),afterSha256:createHash('sha256').update(JSON.stringify(after)).digest('hex'),beforeRoles:before.roles.length,afterRoles:after.roles.length,beforeSchemas:before.schemas.length,afterSchemas:after.schemas.length};
  }catch(error){sqlCleanupFailure=error;failed=true;await diagnostics('sql-cleanup',error);}
  if(primaryFailure||sqlCleanupFailure)throw primaryFailure??sqlCleanupFailure;
  return result;
 }catch(error){failed=true;await diagnostics('setup-or-controller',error);throw error;}finally{
  const cleanupFailures=[];
  for(const[stage,cleanup]of [
   ['pool-cleanup',async()=>{if(installed)await installed.stopRuntimePools();if(owner&&!closedOwner){await owner.end();closedOwner=true;}await admin?.end();}],
   ['container-cleanup',async()=>{if(containerId){const c=JSON.parse(docker('inspect',containerId))[0];assertOwnedStagingResource({Id:c.Id,Labels:c.Config.Labels},containerId,nonce);docker('rm','-f',containerId);assert.equal(docker('ps','-aq','--filter','id='+containerId),'');}}],
   ['volume-cleanup',async()=>{if(volumeName){const volume=JSON.parse(docker('volume','inspect',volumeName))[0];assert.equal(volume.Name,volumeName);assert.equal(volume.Labels?.['looplabs.owned-staging'],nonce);docker('volume','rm',volumeName);assert(!docker('volume','ls','--format','{{.Name}}').split('\n').includes(volumeName));}}],
   ['network-cleanup',async()=>{if(networkId){const n=JSON.parse(docker('network','inspect',networkId))[0];assertOwnedStagingResource(n,networkId,nonce);docker('network','rm',networkId);assert.equal(docker('network','ls','-q','--filter','id='+networkId),'');}}],
  ]){try{await cleanup();}catch(error){failed=true;cleanupFailures.push(error);await diagnostics(stage,error);}}
  if(!failed){assert(sqlBaselineRestored);await rm(directory,{recursive:true,force:true});console.log(JSON.stringify({scope:'owned installed staging lifecycle cleanup',sqlRoleAndSchemaBaselineRestored:sqlBaselineRestored,sqlInventory:sqlBaselineReceipt,remainingOwnedRuntimeSessions:0,exactOwnedContainerRetired:true,exactOwnedNetworkRetired:true,exactObservedOwnedVolumeRetired:true,privateFixtureRemoved:true,releaseAccepted:false}));}
  if(cleanupFailures.length)throw Error('Owned staging resource retirement failed; restricted diagnostics retained.');
 }
}
