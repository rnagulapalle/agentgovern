// Private source-owned proof preparation; never a product provisioning API.
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {randomBytes,randomUUID} from 'node:crypto';
import {join,resolve} from 'node:path';
import {lstat,realpath,mkdir,writeFile} from 'node:fs/promises';
import {Pool} from 'pg';
import {scopedPoolOptions,parseTransport,type PostgreSQLTransport} from '../lib/durable/pg-transport';
import {digest} from '../lib/workspace/identity';
import {passwordHash} from '../lib/workspace/auth';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file';
import {installTemporalProofRoles} from './temporal-installed-fixture';
export type PersistentMember={email:string;name:string;passwordHash:string};
type Input={url:string;transport:PostgreSQLTransport;directory:string;endpoint?:{kind:'owned-disposable-docker';hostname:'trial-db'};retention?:'retain-owned-installation';members?:PersistentMember[]};
export function validatePersistentMembers(value:unknown):PersistentMember[]{
 assert(Array.isArray(value)&&value.length===2,'Exactly two trusted named members required');const result=value.map(m=>{assert(m&&typeof m==='object'&&Object.getPrototypeOf(m)===Object.prototype);const ds=Object.getOwnPropertyDescriptors(m);assert.deepEqual(Reflect.ownKeys(ds).sort(),['email','name','passwordHash']);assert(Object.values(ds).every(d=>d.enumerable&&Object.hasOwn(d,'value')));const {email,name,passwordHash}=m as PersistentMember;assert(typeof email==='string'&&email.length<=254&&!/[\x00-\x1f\x7f]/.test(email)&&email===email.trim().toLowerCase()&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!email.endsWith('@example.test'),'Exact trusted active member email required');assert(typeof name==='string'&&name===name.trim()&&name.length>0&&name.length<=80&&!/[\x00-\x1f\x7f]/.test(name));assert(typeof passwordHash==='string'&&/^[a-f0-9]{32}:[a-f0-9]{128}$/.test(passwordHash),'Existing supported password hash required');return {email,name,passwordHash};});assert.notEqual(result[0].email,result[1].email,'Requester and reviewer must be distinct');return result;
}
export async function readPersistentMembers(file:string){const read=await readOwnedPrivateFile(file,16384);const members=validatePersistentMembers(JSON.parse(read.bytes.toString('utf8')));await read.assertStable();return {members,assertStable:read.assertStable};}
export function validateInstalledAssemblyTarget(input:Input){
 const keys=['url','transport','directory',...(input.endpoint===undefined?[]:['endpoint']),...(input.retention===undefined?[]:['retention','members'])];assert.deepEqual(Object.keys(input).sort(),keys.sort());if(input.retention!==undefined){assert.equal(input.retention,'retain-owned-installation');validatePersistentMembers(input.members);}
 const u=new URL(input.url);assert(['postgres:','postgresql:'].includes(u.protocol));
 if(input.endpoint===undefined)assert.equal(u.hostname,'localhost');
 else{assert.deepEqual(input.endpoint,{kind:'owned-disposable-docker',hostname:'trial-db'});assert(existsSync('/.dockerenv'),'Owned disposable Docker endpoint requires a container');assert.equal(u.hostname,'trial-db');assert.equal(u.port,'5432');assert.equal(u.pathname,'/trial');assert.equal(u.username,'trial');}
 assert(u.username&&u.password);assert(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/.test(u.pathname.slice(1)));assert(!u.search&&!u.hash);
 assert.equal(parseTransport(input.transport).mode,'verified-tls');assert.equal(resolve(input.directory),input.directory);
 return {database:u.pathname.slice(1)};
}
/** Enroll only the reviewed private ACK CRM fixture policy. Email is enrolled
 * independently by the quote publication at its reviewed current version. */
export async function seedInstalledAckConnectorPolicy(owner:Pick<Pool,'query'>){
 await owner.query("INSERT INTO ll_connector_policies(org_id,connector,version)VALUES('local-proof','crm',1) ON CONFLICT(org_id,connector) DO NOTHING");
 const rows=(await owner.query("SELECT version,active FROM ll_connector_policies WHERE org_id='local-proof' AND connector='crm'")).rows;
 assert.deepEqual(rows,[{version:1,active:true}],'Existing CRM policy must match reviewed active fixture; never overwrite or reactivate');
}
/** Existing TLS role installer supplies observed role OIDs. No supplied role
 * facts, session identity, plaintext execution flag or metadata enrollment. */
export async function bootstrapInstalledAssemblyDatabase(input:Input){
 const target=validateInstalledAssemblyTarget(input),parent=await lstat(input.directory);
 assert(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===process.getuid!()&&(parent.mode&0o7777)===0o700);assert.equal(await realpath(input.directory),input.directory);
 const schema='gateway_'+randomBytes(8).toString('hex'),installation='g'+randomBytes(8).toString('hex'),epoch=randomUUID();
 const admin=new Pool(await scopedPoolOptions({url:input.url,schema,purpose:'installer',transport:input.transport}));
 let installed:Awaited<ReturnType<typeof installTemporalProofRoles>>|undefined,schemaOid:string|undefined,closed=false,installStarted=false,installerPoolsClosed=false,schemaRetired=false;
 const retiredRoles=new Set<string>();
 const imported=input.retention?validatePersistentMembers(input.members):undefined;
 const named={requester:imported?.[0].email??'requester@example.test',reviewer:imported?.[1].email??'reviewer@example.test',requesterToken:randomBytes(32).toString('base64url'),reviewerToken:randomBytes(32).toString('base64url')};
 const accounts=imported?[]:[{email:named.requester,name:'Requester',password:randomBytes(32).toString('base64url')},{email:named.reviewer,name:'Reviewer',password:randomBytes(32).toString('base64url')}];
 const disconnect=async()=>{if(closed)return;await installed?.close();installerPoolsClosed=true;await admin.end();closed=true;};
 const generation=join(input.directory,'tenant-generation');
 const close=async()=>{
  assert(input.retention===undefined,'Retained installation cannot use destructive test close; use disconnect');assert(!closed);assert(!installStarted||installed,'Installer partial role ownership unavailable; preserve schema');
  if(installed&&!installerPoolsClosed){await installed.close();installerPoolsClosed=true;}
  const roles=installed?.roles??{};
  // Actual connection absence is required; a caller's boolean is insufficient.
  assert.equal(Number((await admin.query('SELECT count(*) n FROM pg_stat_activity WHERE usename=ANY($1::text[])',[Object.keys(roles)])).rows[0].n),0,'Owned application pools still exist');
  for(const [role,oid]of Object.entries(roles)){const current=(await admin.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[role])).rows[0];
   if(retiredRoles.has(role)){assert.equal(current,undefined,'Retired role name was reused');continue;}
   assert.equal(current?.oid,oid);await admin.query('DROP OWNED BY '+role);await admin.query('DROP ROLE '+role);assert.equal((await admin.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[role])).rowCount,0);retiredRoles.add(role);
  }
  if(schemaOid){const current=(await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0];
   if(schemaRetired)assert.equal(current,undefined,'Retired schema name was reused');
   else{assert.equal(current?.oid,schemaOid);await admin.query('DROP SCHEMA '+schema+' CASCADE');assert.equal((await admin.query('SELECT 1 FROM pg_namespace WHERE oid=$1::oid',[schemaOid])).rowCount,0);schemaRetired=true;}
  }
  await admin.end();closed=true;
 };
 try{
  if(input.retention)await writeFile(join(input.directory,'retained-installation-intent.json'),JSON.stringify({version:1,purpose:'retained-private-installation',schema,installation,epoch,database:target.database,prepared:false}),{mode:0o600,flag:'wx'});
  await admin.query('CREATE SCHEMA '+schema);schemaOid=(await admin.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[schema])).rows[0].oid;
  installStarted=true;installed=await installTemporalProofRoles({url:input.url,transport:input.transport,schema,generation,epoch,installation,...(input.endpoint?{endpoint:input.endpoint}:{}),seed:async owner=>{
   await seedInstalledAckConnectorPolicy(owner);
   for(const [email,name,token]of [[named.requester,'Requester',named.requesterToken],[named.reviewer,'Reviewer',named.reviewerToken]]){
    const importedMember=imported?.find(a=>a.email===email);const stored=importedMember?.passwordHash??passwordHash(accounts.find(a=>a.email===email)!.password);
    await owner.query("INSERT INTO ll_members(email,org_id,name,password_hash)VALUES($1,'local-proof',$2,$3)",[email,importedMember?.name??name,stored]);
    await owner.query("INSERT INTO ll_sessions(hash,email,expires_at)VALUES($1,$2,now()+interval '1 hour')",[digest(token),email]);
   }
  }});
  await mkdir(join(input.directory,'publication-parent'),{mode:0o700});
  return {installation,schema,schemaOid,database:target.database,org:'local-proof',epoch,roles:installed.roles,named,accounts,owner:installed.owner,
   webFile:installed.webFile,workerFile:installed.environment('worker').LOOPLABS_WORKLOAD_INSTALLATION_FILE,schedulerFile:installed.environment('scheduler').LOOPLABS_WORKLOAD_INSTALLATION_FILE,
   generation,stopRuntimePools:installed.stopRuntimePools,output:join(input.directory,'publication-parent','installed'),disconnect,retained:!!input.retention,members:imported?.map(({email,name})=>({email,name})),close};
 }catch{
  if(input.retention){await disconnect();throw Error('Retained installation preparation refused; preserve private intent and require owner review.');}
  try{await close();}catch{await admin.end();throw Error('Installed assembly setup refused; owned SQL cleanup unconfirmed.');}
  throw Error('Installed assembly setup refused; no runtime authority published.');
 }
}
