// Private activation transaction for a source-owned release coordinator. This is
// not a CLI acceptance verifier: source-owned accepted-release and persistent
// installation checks are mandatory and their return values grant no authority.
import assert from 'node:assert/strict';
import {lstat,readlink,symlink,rename,unlink,realpath,open} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {installedServiceContainerId} from './staging-installed-host-coordinator.mjs';
export const installedRuntimeRoles=Object.freeze(['web','temporal-worker','temporal-scheduler','quote-worker','quote-scheduler','application-db','temporal-db','temporal','authorization','connector-twin','quote-twin','quote-email']);
const writers=installedRuntimeRoles.slice(0,5),root='/srv/looplabs-production',digest=/^[a-f0-9]{64}$/;
async function privateRegular(file,uid){const s=await lstat(file);assert(s.isFile()&&!s.isSymbolicLink()&&s.uid===uid&&s.nlink===1&&(s.mode&0o777)===0o600,'Owned private activation file required');return s;}
async function switchReference(active,target,uid){const parent=await lstat(dirname(active));assert(parent.isDirectory()&&!parent.isSymbolicLink()&&parent.uid===uid&&(parent.mode&0o777)===0o700);const temporary=join(dirname(active),'.switch-'+randomUUID());try{await symlink(target,temporary);await rename(temporary,active);}finally{await unlink(temporary).catch(error=>{if(error.code!=='ENOENT')throw error;});}}
/** Initial new-server cutover only. The old origin project is untouched. The
 * preinstalled origin proxy must mount the containing reference directory and
 * release directory, never the individual symlink inode. No listener/DNS setup,
 * role provisioning, credential rotation, initdb, image build or image pull. */
export async function activatePreparedInstalledDeployment(input){
 const {generation,sourceFreezeSha256,project,images,composeFile,docker,compose,assertAcceptedRelease,inspectPersistent,assertTopology,ready,proxy}=input;
 assert(digest.test(generation)&&digest.test(sourceFreezeSha256));assert(/^ll-platform-[a-f0-9]{12}$/.test(project));
 assert.equal(typeof assertAcceptedRelease,'function');assert.equal(typeof inspectPersistent,'function');assert.equal(typeof assertTopology,'function');assert.equal(typeof ready,'function');
 assert.deepEqual(Object.keys(images).sort(),['provisioner','quote','quoteEmail','twin','web','worker']);for(const id of Object.values(images))assert(/^sha256:[a-f0-9]{64}$/.test(id));assert.equal(new Set(Object.values(images)).size,6,'Six distinct immutable role images required');
 const release=join(root,'releases',generation);assert.equal(composeFile,join(release,'compose.json'));assert.equal(proxy.active,join(root,'config/origin-switch/current'));assert.equal(proxy.target,join(release,'proxy/upstream.conf'));assert(/^[a-f0-9]{64}$/.test(proxy.container));assert.equal(proxy.uid,1001);
 const lockFile=join(root,'config/origin-switch/activation.lock');let lock;
 // Every check precedes starting any runtime. Production coordinator must call
 // actual authenticated current six-image acceptance, not a supplied JSON flag.
 await assertAcceptedRelease();await inspectPersistent();await assertTopology();
 await privateRegular(composeFile,1001);await privateRegular(proxy.target,1001);assert.equal(await realpath(release),release);
 const activeStat=await lstat(proxy.active);assert(activeStat.isSymbolicLink()&&activeStat.uid===1001);const previous=await readlink(proxy.active);
 assert(previous.startsWith(root+'/releases/')&&!previous.includes('/../'));await privateRegular(previous,1001);assert.equal(await realpath(previous),previous);
 // The original origin container is externally preinstalled and retained. It
 // must not be one of the new runtime services or an offline installer.
 const proxyState=JSON.parse(docker('inspect','--format','{{json .State}}',proxy.container));assert.equal(proxyState.Running,true);
 const proxyLabels=JSON.parse(docker('inspect','--format','{{json .Config.Labels}}',proxy.container));assert.equal(proxyLabels['looplabs.origin.owner'],'looplabs-production');assert.equal(proxyLabels['looplabs.origin.contract'],'installed-origin-reference-1');
 const roleImages={web:images.web,'temporal-worker':images.worker,'temporal-scheduler':images.worker,'quote-worker':images.quote,'quote-scheduler':images.quote,'connector-twin':images.twin,'quote-email':images.quoteEmail,'quote-twin':images.provisioner};
 let started=false,switched=false;const captured={};
 const captureWriter=role=>{const current=installedServiceContainerId({project,owner:project,service:role,docker});if(!current)return '';assert.notEqual(current,proxy.container);if(captured[role])assert.equal(current,captured[role],'Writer replaced; containment refused');assert.equal(docker('inspect','--format','{{.Image}}',current),roleImages[role]);captured[role]=current;return current;};
 try{
  lock=await open(lockFile,'wx',0o600);const lockStat=await lock.stat();assert.equal(lockStat.uid,1001);
  assert.equal(await readlink(proxy.active),previous,'Origin changed before activation lock');
  // Initial cutover must not take ownership of a preexisting writer stack.
  for(const role of writers)assert.equal(installedServiceContainerId({project,owner:project,service:role,docker}),'','Existing writer generation requires a separately reviewed transition');
  // No installation profile, no --force-recreate, no down/volume removal. The
  // topology check must prove persistent existing PG_VERSION before this call.
  started=true;compose('up','-d','--no-build','--pull','never',...installedRuntimeRoles);
  for(const role of installedRuntimeRoles){const id=installedServiceContainerId({project,owner:project,service:role,docker});assert(id,'Installed runtime main role missing');assert.notEqual(id,proxy.container);captured[role]=id;assert.equal(docker('inspect','--format','{{.State.Running}}',id),'true');if(roleImages[role])assert.equal(docker('inspect','--format','{{.Image}}',id),roleImages[role]);}
  assert.equal(installedServiceContainerId({project,owner:project,service:'offline-installer',docker}),'','Administrative installer must not be running or reused as runtime');
  await inspectPersistent();await ready(captured);await assertAcceptedRelease();await assertTopology();
  // Changing only the upstream reference preserves preinstalled TLS/listeners.
  const currentStat=await lstat(proxy.active);assert.equal(currentStat.ino,activeStat.ino);assert.equal(currentStat.dev,activeStat.dev);assert.equal(await readlink(proxy.active),previous);
  await switchReference(proxy.active,proxy.target,1001);switched=true;
  docker('exec',proxy.container,'nginx','-t');docker('exec',proxy.container,'nginx','-s','reload');await ready(captured,{origin:true});
  return {contract:'installed-origin-activation-1',generation,sourceFreezeSha256,roles:12,originSwitched:true,installationCreated:false,credentialsRotated:false,imagesBuilt:false};
 }catch(cause){
  const errors=[cause];if(switched){try{assert.equal(await readlink(proxy.active),proxy.target,'Origin changed; rollback replacement refused');await switchReference(proxy.active,previous,1001);docker('exec',proxy.container,'nginx','-t');docker('exec',proxy.container,'nginx','-s','reload');}catch(error){errors.push(error);}}
  // Partial Compose failure can occur before the first ordinary capture. Only
  // identities absent before start and now proved main-owned with exact image
  // are eligible. Stop immutable captured IDs, never a mutable service selector.
  const containment={captured:[],stopped:[],missing:[],unobserved:[],changed:[],stopFailed:[],complete:false};
  if(started){for(const role of writers){
   let id;try{id=captureWriter(role);if(!id){containment.missing.push(role);continue;}containment.captured.push(role);assert.equal(captureWriter(role),id);
   }catch(error){if(captured[role])containment.changed.push(role);else containment.unobserved.push(role);errors.push(error);continue;}
   try{docker('stop',id);assert.equal(docker('inspect','--format','{{.State.Running}}',id),'false');containment.stopped.push(role);
   }catch(error){containment.stopFailed.push(role);errors.push(error);}
  }}
  containment.complete=started&&containment.stopped.length===writers.length&&containment.missing.length===0&&containment.unobserved.length===0&&containment.changed.length===0&&containment.stopFailed.length===0;
  const failure=new AggregateError(errors,'Installed activation failed; rollback evidence required');Object.defineProperty(failure,'containment',{value:Object.freeze(containment),enumerable:true});throw failure;
 }finally{if(lock){const held=await lock.stat(),current=await lstat(lockFile);assert.equal(held.ino,current.ino);assert.equal(held.dev,current.dev);await lock.close();await unlink(lockFile);}}
}
