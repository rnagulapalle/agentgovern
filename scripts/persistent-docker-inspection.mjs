// Read-only owned Docker observation. Never establishes provenance or activation.
// Returned configuration contains secrets internally; callers must not log it.
import {execFile} from 'node:child_process';
import {isDeepStrictEqual} from 'node:util';
const execute=(file,args,options)=>new Promise((resolve,reject)=>execFile(file,args,options,(error,stdout)=>error?reject(error):resolve({stdout})));
export const persistentRoles=Object.freeze(['temporal-worker','temporal-scheduler','web','application-db','temporal-db','temporal','authorization','connector-twin']);
const roles=[...persistentRoles],hex=/^[a-f0-9]{64}$/,image=/^sha256:[a-f0-9]{64}$/;
const exact=(v,ks)=>v&&typeof v==='object'&&!Array.isArray(v)&&isDeepStrictEqual(Object.keys(v).sort(),[...ks].sort());
const record=v=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.getPrototypeOf(v)===Object.prototype;
function refuse(){throw Error('Owned Docker inspection refused or unavailable; private diagnostics suppressed');}
function inputs(value){
 value=json(value);
 if(!exact(value,['project','containers','images'])||typeof value.project!=='string'||!/^ll-platform-[a-f0-9]{12}$/.test(value.project)||!exact(value.containers,roles)||!exact(value.images,roles)||Object.values(value.containers).some(v=>typeof v!=='string'||!hex.test(v))||new Set(Object.values(value.containers)).size!==8||Object.values(value.images).some(v=>typeof v!=='string'||!image.test(v)))refuse();
 return structuredClone(value);
}
function json(value,depth=0){
 if(depth>16)refuse();
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='string'){if(value.length>65536||value.includes('\0'))refuse();return value;}
 if(typeof value==='number'){if(!Number.isFinite(value))refuse();return value;}
 if(Array.isArray(value)){if(value.length>4096||Object.keys(value).length!==value.length||Reflect.ownKeys(value).length!==value.length+1)refuse();const descriptors=Object.getOwnPropertyDescriptors(value);return Array.from({length:value.length},(_,n)=>{const d=descriptors[n];if(!d||!Object.hasOwn(d,'value')||!d.enumerable)refuse();return json(d.value,depth+1);});}
 if(!record(value)||Object.keys(value).length>512||Reflect.ownKeys(value).length!==Object.keys(value).length)refuse();
 const descriptors=Object.getOwnPropertyDescriptors(value);
 return Object.fromEntries(Object.keys(value).sort().map(k=>{if(!k||k.length>256||k.includes('\0')||!Object.hasOwn(descriptors[k],'value')||!descriptors[k].enumerable)refuse();return [k,json(descriptors[k].value,depth+1)];}));
}
function strings(value){if(value===null)return [];if(!Array.isArray(value)||value.some(v=>typeof v!=='string'))refuse();return json(value);}
function configuration(c){
 const config=json(c.Config),host=json(c.HostConfig),mounts=json(c.Mounts);
 if(!record(config)||!record(host)||!Array.isArray(mounts)||typeof config.User!=='string'||!Array.isArray(config.Env)||!record(config.Labels))refuse();
 if(!Number.isSafeInteger(host.Memory)||host.Memory<0||!Number.isSafeInteger(host.PidsLimit)||host.PidsLimit< -1||typeof host.ReadonlyRootfs!=='boolean'||!Array.isArray(host.CapDrop)||host.CapDrop.some(v=>typeof v!=='string')||!Array.isArray(host.SecurityOpt)||host.SecurityOpt.some(v=>typeof v!=='string')||typeof host.NetworkMode!=='string'||!(host.PortBindings===null||record(host.PortBindings)))refuse();
 const environment={};
 for(const entry of config.Env){if(typeof entry!=='string')refuse();const n=entry.indexOf('='),key=entry.slice(0,n),value=entry.slice(n+1);if(n<1||!/^[_A-Za-z][_A-Za-z0-9]*$/.test(key)||Object.hasOwn(environment,key))refuse();Object.defineProperty(environment,key,{value,enumerable:true,writable:true,configurable:true});}
 const seen=new Set();
 for(const m of mounts){if(!record(m)||typeof m.Type!=='string'||typeof m.Source!=='string'||typeof m.Destination!=='string'||!m.Destination.startsWith('/')||typeof m.RW!=='boolean'||seen.has(m.Destination))refuse();seen.add(m.Destination);}
 const healthcheck=config.Healthcheck===undefined?{}:config.Healthcheck;
 if(!record(healthcheck))refuse();
 if(healthcheck.Test!==undefined)strings(healthcheck.Test);
 const {Env,User,Cmd,Entrypoint,Healthcheck,...remainingConfig}=config;
 void Env;void User;void Cmd;void Entrypoint;void Healthcheck;
 // Keep every other Config field, every HostConfig field and complete mount object.
 // Labels (including Compose config hashes) are intentionally not discarded.
 return {image:c.Image,environment:json(environment),user:config.User,command:strings(config.Cmd),entrypoint:strings(config.Entrypoint),healthcheck,mounts:mounts.sort((a,b)=>a.Destination.localeCompare(b.Destination)),host:{dockerConfig:remainingConfig,hostConfig:host,networkSettings:json(c.NetworkSettings)}};
}
/** Untrusted parsed inspect data becomes a scoped observation, never release authority. */
export function normalizeOwnedDockerInspection(raw,identity){
 try{
 const expected=inputs(identity);
 raw=json(raw);
 if(!Array.isArray(raw)||raw.length!==8||Object.keys(raw).length!==8||Reflect.ownKeys(raw).length!==9)refuse();
 const output={};
 for(const original of raw){
  const c=json(original);
  if(!record(c)||typeof c.Id!=='string'||!hex.test(c.Id)||typeof c.Image!=='string'||!image.test(c.Image)||!record(c.Config)||!record(c.HostConfig)||!Array.isArray(c.Mounts)||!record(c.State)||!record(c.NetworkSettings)||!record(c.NetworkSettings.Networks)||typeof c.State.Running!=='boolean')refuse();
  for(const network of Object.values(c.NetworkSettings.Networks)){if(!record(network)||typeof network.NetworkID!=='string'||!(network.NetworkID===''||hex.test(network.NetworkID))||typeof network.EndpointID!=='string'||!(network.EndpointID===''||hex.test(network.EndpointID))||typeof network.IPAddress!=='string'||network.IPAddress.length>64)refuse();}
  // Validate complete inspect JSON too: hidden/accessor/non-JSON fields cannot bypass shape checks.
  json(c);
  const labels=c.Config.Labels,role=labels?.['com.docker.compose.service'];
  if(!roles.includes(role)||Object.hasOwn(output,role)||labels['com.docker.compose.project']!==expected.project||c.Id!==expected.containers[role]||c.Image!==expected.images[role])refuse();
  let healthy=false;
  if(c.State.Health!==undefined){if(!record(c.State.Health)||!['starting','healthy','unhealthy'].includes(c.State.Health.Status))refuse();healthy=c.State.Health.Status==='healthy';}
  output[role]={id:c.Id,project:expected.project,service:role,image:c.Image,running:c.State.Running,healthy,configuration:configuration(c)};
 }
 if(!exact(output,roles))refuse();
 return Object.fromEntries(roles.map(role=>[role,output[role]]));
 }catch{refuse();}
}
/** Bounded execFile only. No shell, inspect-all discovery, mutation, output logging or retries. */
export async function inspectOwnedPersistentDocker(identity){
 try{
 const copied=inputs(identity);
 const {stdout}=await execute('docker',['inspect',...roles.map(role=>copied.containers[role])],{encoding:'utf8',timeout:10000,maxBuffer:2*1024*1024,windowsHide:true});
 if(typeof stdout!=='string'||Buffer.byteLength(stdout)>2*1024*1024)refuse();
 return normalizeOwnedDockerInspection(JSON.parse(stdout),copied);
 }catch{refuse();}
}
