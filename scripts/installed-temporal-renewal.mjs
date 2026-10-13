// Host-only namespace JWT lifecycle. Never grants application action authority.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath,readlink,mkdir,writeFile,rename,symlink,rm} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createPublicKey,createHash,verify,randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {fileURLToPath} from 'node:url';
import {prepareTemporalRenewal,renewalIdentity} from './persistent-temporal-renewal.mjs';
export const renewalRoles=Object.freeze(['temporal-worker','temporal-scheduler','quote-worker','quote-scheduler']);
const tokenKey='LOOPLABS_TEMPORAL_API_KEY';
const withoutToken=env=>Object.fromEntries(Object.entries(env).filter(([key])=>key!==tokenKey));
const envOf=c=>Object.fromEntries(c.Config.Env.map(entry=>{const split=entry.indexOf('=');return [entry.slice(0,split),entry.slice(split+1)];}));
const canonicalMounts=mounts=>[...mounts].sort((a,b)=>a.Destination.localeCompare(b.Destination));
const sha=b=>createHash('sha256').update(b).digest('hex');
function canonicalHostConfig(config){
 const value=structuredClone(config);
 if(value.Binds!==null&&value.Binds!==undefined){
  assert(Array.isArray(value.Binds));const destinations=new Set();
  for(const bind of value.Binds){assert(typeof bind==='string');const parts=bind.split(':');assert(parts.length===3&&parts[0].startsWith('/')&&parts[1].startsWith('/')&&parts[2].length>0);assert(!destinations.has(parts[1]),'Duplicate bind destination refused');destinations.add(parts[1]);}
  value.Binds.sort();
 }
 return value;
}
async function directory(path){const s=await lstat(path);assert(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700);assert.equal(await realpath(path),path);}
async function privateFile(path){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();assert(s.isFile()&&s.nlink===1&&s.uid===process.getuid()&&(s.mode&0o777)===0o600&&s.size<=4194304);return await h.readFile('utf8');}finally{await h.close();}}
export function renewalConfiguration(config){
 assert(config&&Object.keys(config).sort().join()===['version','project','projectDirectory','installation','configRoot','currentPointer','identity','ttlSeconds','renewBeforeSeconds'].sort().join());
 assert.equal(config.version,1);assert(/^[a-z][a-z0-9-]{1,62}$/.test(config.project));renewalIdentity(config.identity);
 for(const field of ['projectDirectory','installation','configRoot','currentPointer'])assert(typeof config[field]==='string'&&resolve(config[field])===config[field]);
 assert.equal(dirname(config.currentPointer),config.configRoot);assert(Number.isInteger(config.ttlSeconds)&&config.ttlSeconds>=3600&&config.ttlSeconds<=86400);assert(Number.isInteger(config.renewBeforeSeconds)&&config.renewBeforeSeconds>=900&&config.renewBeforeSeconds<=config.ttlSeconds/2);
 return structuredClone(config);
}
export function scopedTokenExpiry(token,jwk,identity){
 const parts=token?.split('.');assert(parts?.length===3&&parts.every(p=>/^[a-zA-Z0-9_-]+$/.test(p)));
 const header=JSON.parse(Buffer.from(parts[0],'base64url')),claims=JSON.parse(Buffer.from(parts[1],'base64url'));
 assert.deepEqual(header,{alg:'RS256',kid:identity.kid,typ:'JWT'});assert.equal(Object.keys(claims).sort().join(),'exp,iat,permissions,sub');assert.equal(claims.sub,identity.namespace);
 assert.deepEqual(claims.permissions,[`${identity.namespace}:read`,`${identity.namespace}:write`,`${identity.namespace}:worker`]);assert(Number.isSafeInteger(claims.iat)&&Number.isSafeInteger(claims.exp)&&claims.iat<=Math.floor(Date.now()/1000)&&claims.exp-claims.iat>=300&&claims.exp-claims.iat<=86400);
 const key=createPublicKey({key:jwk,format:'jwk'});assert.equal(sha(key.export({format:'der',type:'spki'})),identity.issuerSpkiSha256);assert(verify('RSA-SHA256',Buffer.from(`${parts[0]}.${parts[1]}`),key,Buffer.from(parts[2],'base64url')));return claims.exp;
}
export function renewalCompose(compose,before,project,token){
 const next=structuredClone(compose);
 for(const role of renewalRoles){const service=compose.services?.[role],live=before[role];assert(service&&live);assert.equal(live.Config.Labels['com.docker.compose.project'],project);assert.equal(live.Config.Labels['com.docker.compose.service'],role);assert.equal(live.Config.Labels['looplabs.assembly.owner'],project);assert.equal(service.image,live.Image);assert(/^sha256:[a-f0-9]{64}$/.test(live.Image));assert(service.environment&&!Array.isArray(service.environment));
  // Refuse stale active generations rather than overwriting a newer deployment.
  canonicalHostConfig(live.HostConfig);const env=envOf(live);for(const [key,value]of Object.entries(service.environment))assert.equal(env[key],String(value));
  assert(typeof env[tokenKey]==='string');next.services[role].environment[tokenKey]=token;
 }
 return next;
}
export function renewalObservation(before,after,token){
 assert.equal(after.Image,before.Image);assert.deepEqual(withoutToken(envOf(after)),withoutToken(envOf(before)));assert.equal(envOf(after)[tokenKey],token);assert.deepEqual(canonicalMounts(after.Mounts),canonicalMounts(before.Mounts));assert.deepEqual(canonicalHostConfig(after.HostConfig),canonicalHostConfig(before.HostConfig));
 return {status:after.State.Status,health:after.State.Health?.Status??'missing',restarts:after.RestartCount};
}
const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:180000,maxBuffer:4194304,stdio:['ignore','pipe','pipe']}).trim();
function runtime(config){return {
 inspect:role=>JSON.parse(docker('inspect',`${config.project}-${role}-1`))[0],
 activate:file=>docker('compose','--project-directory',config.projectDirectory,'-p',config.project,'-f',file,'up','-d','--no-deps','--force-recreate',...renewalRoles),
 sleep:()=>new Promise(r=>setTimeout(r,1000)),
 prepare:prepareTemporalRenewal,
};}
async function current(config){const s=await lstat(config.currentPointer);assert(s.isSymbolicLink()&&s.uid===process.getuid());const target=resolve(dirname(config.currentPointer),await readlink(config.currentPointer));assert.equal(dirname(target),config.configRoot);await directory(target);return target;}
/** Lock is intentionally not stolen after a crash: an operator must inspect the
 * pending generation/live services. This prevents blind replay of partial activation. */
export async function runInstalledTemporalRenewal(input,dependencies,options={force:false}){
 assert.deepEqual(Object.keys(options),['force']);assert.equal(typeof options.force,'boolean');
 const config=renewalConfiguration(input),ops=dependencies??runtime(config);await directory(config.configRoot);
 const lock=config.configRoot+'/temporal-renewal.lock';await mkdir(lock,{mode:0o700});
 let generation,mutated=false,published=false,previous,receipt,rollbackSucceeded=false,snapshot,webSnapshot,retainLock=false;
 try{
  previous=await current(config);const composeFile=previous+'/compose-recovery.json';const compose=JSON.parse(await privateFile(composeFile));
  const jwks=JSON.parse(await privateFile(config.configRoot+'/temporal-renewal-jwks.json'));assert.equal(jwks.keys.length,1);
  const before=Object.fromEntries(await Promise.all(renewalRoles.map(async role=>[role,await ops.inspect(role)]))),webBefore=await ops.inspect('web');
  for(const role of renewalRoles)assert.equal(before[role].Config.Labels['com.docker.compose.project.config_files'],composeFile);snapshot=before;webSnapshot=webBefore;const tokens=renewalRoles.map(role=>envOf(before[role])[tokenKey]);assert(tokens.every(token=>token===tokens[0]));const expiresAt=scopedTokenExpiry(tokens[0],jwks.keys[0],config.identity);
  renewalCompose(compose,before,config.project,tokens[0]);
  const now=Math.floor(Date.now()/1000);
  if(!options.force&&expiresAt>now+config.renewBeforeSeconds){const observations=renewalRoles.map(role=>({role,status:before[role].State.Status,health:before[role].State.Health?.Status??'missing',restarts:before[role].RestartCount}));assert(observations.every(o=>o.status==='running'&&o.health==='healthy'));return {status:'not_due',expiresAt,observations,renewed:false,applicationAcceptance:false};}
  generation=config.configRoot+'/temporal-renewal-'+randomBytes(12).toString('hex');
  const renewal=await ops.prepare(config.installation,generation,config.identity,{ttlSeconds:config.ttlSeconds});const token=parseEnv(await privateFile(generation+'/temporal-auth.env'))[tokenKey];assert.equal(scopedTokenExpiry(token,jwks.keys[0],config.identity),renewal.expiresAt);assert(renewal.expiresAt>now+config.renewBeforeSeconds);
  const next=renewalCompose(compose,before,config.project,token),nextFile=generation+'/compose-recovery.json';await writeFile(nextFile,JSON.stringify(next),{mode:0o600,flag:'wx'});
  await writeFile(generation+'/pending.json',JSON.stringify({previous,startedAt:now,expiresAt:renewal.expiresAt}),{mode:0o600,flag:'wx'});
  assert.equal(await current(config),previous);
  // Recheck immediately before mutation; deployment and renewal must share the lock.
  for(const role of renewalRoles)assert.equal((await ops.inspect(role)).Id,before[role].Id);
  mutated=true;await ops.activate(nextFile);
  let observations=[];
  for(let attempt=0;attempt<90;attempt++){
   observations=await Promise.all(renewalRoles.map(async role=>({role,...renewalObservation(before[role],await ops.inspect(role),token)})));
   if(observations.every(o=>o.status==='running'&&o.health==='healthy'))break;await ops.sleep();
  }
  assert(observations.every(o=>o.status==='running'&&o.health==='healthy'));const webAfter=await ops.inspect('web');assert.equal(webAfter.Id,webBefore.Id);assert.equal(webAfter.Image,webBefore.Image);assert.equal(await current(config),previous);
  receipt={status:'renewed',namespace:config.identity.namespace,expiresAt:renewal.expiresAt,previous,observations,imagesUnchanged:true,mountsUnchanged:true,otherEnvironmentUnchanged:true,webContainerUnchanged:true,issuerAndPermissionsUnchanged:true,applicationAcceptance:false};
  await writeFile(generation+'/receipt.json',JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});
  const pointer=lock+'/next';await symlink(generation,pointer);await rename(pointer,config.currentPointer);published=true;await rm(generation+'/pending.json');return receipt;
 }catch{
  if(mutated&&!published){try{
   await ops.activate(previous+'/compose-recovery.json');let observations=[];
   for(let attempt=0;attempt<90;attempt++){
    observations=await Promise.all(renewalRoles.map(async role=>renewalObservation(snapshot[role],await ops.inspect(role),envOf(snapshot[role])[tokenKey])));
    if(observations.every(o=>o.status==='running'&&o.health==='healthy'))break;await ops.sleep();
   }
   assert(observations.every(o=>o.status==='running'&&o.health==='healthy'));const web=await ops.inspect('web');assert.equal(web.Id,webSnapshot.Id);assert.equal(web.Image,webSnapshot.Image);rollbackSucceeded=true;
  }catch{rollbackSucceeded=false;}}
  retainLock=published||(mutated&&!rollbackSucceeded);
  if(generation)await writeFile(generation+'/failure.json',JSON.stringify({status:'failed',rollbackAttempted:mutated&&!published,rollbackSucceeded,applicationAcceptance:false}),{mode:0o600}).catch(()=>{});
  throw Error(rollbackSucceeded?'Temporal renewal failed; previous generation restored.':'Temporal renewal refused or failed; inspect private lifecycle evidence.');
 }finally{if(!retainLock)await rm(lock,{recursive:true,force:true});}
}
export function temporalRenewalUnits({user,node,script,config}){
 for(const value of [user,node,script,config])assert(typeof value==='string'&&/^[a-zA-Z0-9_./-]+$/.test(value));assert(/^[a-z_][a-z0-9_-]*$/.test(user));for(const value of [node,script,config])assert(value.startsWith('/'));
 return {service:`[Unit]\nDescription=LoopLabs scoped Temporal credential renewal\nAfter=docker.service\nRequires=docker.service\n\n[Service]\nType=oneshot\nUser=${user}\nUMask=0077\nExecStart=${node} ${script} ${config}\nTimeoutStartSec=600\nNoNewPrivileges=true\nPrivateTmp=true\n`,timer:'[Unit]\nDescription=Check LoopLabs Temporal credential lifetime\n\n[Timer]\nOnBootSec=2min\nOnUnitActiveSec=5min\nAccuracySec=30s\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n'};
}
export async function installedTemporalRenewalCLI(args,output=console){try{assert(args.length===1||(args.length===2&&args[1]==='--renew-now'));const config=JSON.parse(await privateFile(resolve(args[0])));const result=await runInstalledTemporalRenewal(config,undefined,{force:args[1]==='--renew-now'});output.log(JSON.stringify(result));return 0;}catch{output.error('Scoped Temporal renewal refused or failed; consult private lifecycle evidence.');return 1;}}
if(process.argv[1]===fileURLToPath(import.meta.url))process.exitCode=await installedTemporalRenewalCLI(process.argv.slice(2));
