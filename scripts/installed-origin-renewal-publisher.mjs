// Fixed source-owned Certbot deploy hook. This grants no application release or
// DNS authority. Only an already-owned exact canonical proxy may be reloaded.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open,lstat,realpath,mkdir,writeFile,chown,readlink,symlink,lchown,rename,unlink} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash,createPrivateKey,X509Certificate} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateInstalledOriginCertificateBytes} from './installed-origin-tls.mjs';
const root='/srv/looplabs-production',tls=root+'/config/origin-tls',lineage='/etc/letsencrypt-looplabs/live/looplabs.run',archive='/etc/letsencrypt-looplabs/archive/looplabs.run';
const nginxDigest='nginx@sha256:54f2a904c251d5a34adf545a72d32515a15e08418dae0266e23be2e18c66fefa',config=root+'/config/origin-reference/nginx-production.conf';
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const sha=b=>createHash('sha256').update(b).digest('hex');
const command=(program,args,timeout=15000)=>execFileSync(program,args,{encoding:'utf8',timeout,maxBuffer:1048576,stdio:['pipe','pipe','pipe'],input:''}).trim();
const docker=(...args)=>command('/usr/bin/docker',args);
async function privateDirectory(path,uid){const s=await lstat(path);assert(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===uid&&(s.mode&0o777)===0o700,'Owned private TLS directory required');assert.equal(await realpath(path),path);}
async function regular(path,uid){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();assert(s.isFile()&&s.uid===uid&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size>0&&s.size<65536,'Owned private TLS material required');return await h.readFile();}finally{await h.close();}}
async function sourceFile(name){
 const link=lineage+'/'+name+'.pem',target=await realpath(link);assert(new RegExp('^'+escapeRegex(archive)+'/'+name+'[1-9][0-9]*\\.pem$').test(target),'Fixed active certificate archive required');
 const h=await open(target,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();assert(s.isFile()&&s.uid===0&&s.nlink===1&&s.size>0&&s.size<65536&&(s.mode&0o022)===0&&(name!=='privkey'||(s.mode&0o777)===0o600),'Root-owned certificate archive required');return {bytes:await h.readFile(),target};}finally{await h.close();}
}
export function assertRenewalProxyInspection(c){
 assert(c&&/^[a-f0-9]{64}$/.test(c.Id)&&/^sha256:[a-f0-9]{64}$/.test(c.Image)&&c.State?.Running===true&&c.State?.Health?.Status==='healthy','Running pinned origin proxy required');
 assert.equal(c.Config?.Labels?.['looplabs.origin.owner'],'looplabs-production');assert.equal(c.Config?.Labels?.['looplabs.origin.contract'],'installed-origin-reference-1');assert.equal(c.Config.User,'1001:1001');assert.deepEqual(c.Config.Entrypoint,['nginx']);assert.deepEqual(c.Config.Cmd,['-c',config,'-g','daemon off;']);
 assert.equal(c.HostConfig?.NetworkMode,'host');assert.equal(c.HostConfig.ReadonlyRootfs,true);assert.deepEqual(c.HostConfig.CapDrop,['ALL']);assert.deepEqual(c.HostConfig.CapAdd,['NET_BIND_SERVICE']);assert.deepEqual(c.HostConfig.SecurityOpt,['no-new-privileges:true']);assert.equal(c.HostConfig.Privileged,false);
 assert(Array.isArray(c.Mounts));const allowed=new Set([root+'/config/origin-reference',root+'/config/origin-switch',tls,root+'/state/acme-webroot']);const seen=new Set();
 for(const mount of c.Mounts){if(mount.Type==='tmpfs'){assert.equal(mount.Destination,'/tmp');continue;}assert.equal(mount.Type,'bind');assert.equal(mount.RW,false);assert.equal(mount.Source,mount.Destination);assert(allowed.has(mount.Source)||new RegExp('^'+escapeRegex(root)+'/releases/[a-f0-9]{64}/proxy$').test(mount.Source),'Expanded proxy mount refused');assert(!seen.has(mount.Source),'Duplicate proxy mount refused');seen.add(mount.Source);}
 for(const path of [tls,root+'/config/origin-reference',root+'/config/origin-switch'])assert(seen.has(path),'Exact proxy parent mounts required');return c.Id;
}
function inspectProxy(){const ids=docker('ps','-a','-q','--no-trunc','--filter','label=looplabs.origin.owner=looplabs-production','--filter','label=looplabs.origin.contract=installed-origin-reference-1').split(/\s+/).filter(Boolean);assert.equal(ids.length,1,'Exactly one owned proxy required');const [c,...extra]=JSON.parse(docker('inspect',ids[0]));assert.equal(extra.length,0);assert.equal(assertRenewalProxyInspection(c),ids[0]);const [image,...images]=JSON.parse(docker('image','inspect',c.Image));assert.equal(images.length,0);assert.equal(image.Id,c.Image);assert(image.RepoDigests?.includes(nginxDigest),'Source-pinned proxy image required');return {id:c.Id,image:c.Image};}
function sameProxy(expected){assert.deepEqual(inspectProxy(),expected,'Origin proxy replaced during renewal');}
async function switchTls(target){
 const temporary=tls+'/.current-next';let created,renamed=false;
 try{await symlink(target,temporary);created=await lstat(temporary);assert(created.isSymbolicLink()&&created.uid===1001);await lchown(temporary,1001,1001);await rename(temporary,tls+'/current');renamed=true;}
 finally{if(created&&!renamed){try{const current=await lstat(temporary);assert(current.isSymbolicLink()&&current.uid===1001&&current.ino===created.ino&&current.dev===created.dev&&await readlink(temporary)===target,'Temporary TLS marker replaced; cleanup refused');await unlink(temporary);}catch(error){if(error.code!=='ENOENT')throw error;}}}
}
function syntaxAndReload(proxy){sameProxy(proxy);docker('exec',proxy.id,'nginx','-t','-c',config);sameProxy(proxy);docker('exec',proxy.id,'nginx','-s','reload','-c',config);}
function servedLeaf(){const text=command('/usr/bin/openssl',['s_client','-connect','127.0.0.1:443','-servername','looplabs.run','-verify_return_error','-verify_hostname','looplabs.run','-CApath','/etc/ssl/certs'],1000);const block=text.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/);assert(block,'Served leaf missing');return sha(new X509Certificate(block[0]).raw);}
async function awaitServedLeaf(expected,{proxy,target}){
 for(let attempt=0;attempt<20;attempt++){
  assert.equal(await readlink(tls+'/current'),target,'TLS reference changed during readiness');sameProxy(proxy);
  let leaf;try{leaf=servedLeaf();}catch{/* Read-only transient TLS/handshake observation; never change trust settings. */}
  assert.equal(await readlink(tls+'/current'),target,'TLS reference changed during readiness');sameProxy(proxy);
  if(leaf===expected)return;
  if(attempt<19)await new Promise(resolve=>setTimeout(resolve,100));
 }
 throw Error('Trusted served certificate readiness timed out');
}

export async function publishInstalledOriginRenewal(){
 assert.equal(process.getuid(),0,'Root-owned Certbot hook required');assert.equal(process.env.RENEWED_LINEAGE,lineage,'Unrelated renewed lineage refused');
 await privateDirectory(archive,0);await privateDirectory(lineage,0);
 const cert=await sourceFile('fullchain'),key=await sourceFile('privkey');const validation=validateInstalledOriginCertificateBytes(cert.bytes,key.bytes);
 command('/usr/bin/openssl',['verify','-verify_hostname','looplabs.run','-CApath','/etc/ssl/certs','-untrusted',cert.target,cert.target]);
 assert((await sourceFile('fullchain')).bytes.equals(cert.bytes)&&(await sourceFile('privkey')).bytes.equals(key.bytes),'Renewed certificate changed during publication');
 // Never perform privileged writes in the operator-owned TLS directory. Read
 // root-owned lineage first, then irreversibly drop UID/GID before mutation.
 process.initgroups('looplabs',1001);process.setgid(1001);process.setuid(1001);assert.equal(process.getuid(),1001);
 await privateDirectory(tls,1001);await privateDirectory(tls+'/generations',1001);
 const lockPath=tls+'/renewal.lock';let lock,switched=false,previous,newTarget,proxy;let result;
 try{
  lock=await open(lockPath,'wx',0o600);const held=await lock.stat();assert.equal(held.uid,1001);
  const current=await lstat(tls+'/current');assert(current.isSymbolicLink()&&current.uid===1001);previous=await readlink(tls+'/current');assert(new RegExp('^'+escapeRegex(tls)+'/generations/[a-f0-9]{64}$').test(previous));await privateDirectory(previous,1001);
  const oldCertificate=await regular(previous+'/fullchain.pem',1001),oldKey=await regular(previous+'/privkey.pem',1001);const oldLeaf=new X509Certificate(oldCertificate);assert(oldLeaf.checkPrivateKey(createPrivateKey(oldKey))&&oldLeaf.checkHost('looplabs.run',{subject:'never'})&&oldLeaf.checkHost('www.looplabs.run',{subject:'never'}),'Prior canonical TLS pair invalid');
  proxy=inspectProxy();newTarget=tls+'/generations/'+sha(Buffer.concat([cert.bytes,key.bytes]));
  try{await mkdir(newTarget,{mode:0o700});await chown(newTarget,1001,1001);for(const [name,bytes]of [['fullchain.pem',cert.bytes],['privkey.pem',key.bytes]]){await writeFile(newTarget+'/'+name,bytes,{mode:0o600,flag:'wx'});await chown(newTarget+'/'+name,1001,1001);}}
  catch(error){if(error.code!=='EEXIST')throw error;}
  await privateDirectory(newTarget,1001);assert((await regular(newTarget+'/fullchain.pem',1001)).equals(cert.bytes)&&(await regular(newTarget+'/privkey.pem',1001)).equals(key.bytes),'Existing immutable TLS generation differs');
  assert.equal(await readlink(tls+'/current'),previous);sameProxy(proxy);await switchTls(newTarget);switched=true;syntaxAndReload(proxy);await awaitServedLeaf(validation.leafSha256,{proxy,target:newTarget});
  result={contract:'installed-origin-renewal-publication-1',published:true,leafSha256:validation.leafSha256,notAfter:validation.notAfter,applicationReleaseGranted:false,dnsChanged:false};
 }catch(cause){let restored=false;if(switched){assert.equal(await readlink(tls+'/current'),newTarget,'TLS reference replaced; rollback refused');sameProxy(proxy);await switchTls(previous);syntaxAndReload(proxy);const old=new X509Certificate(await regular(previous+'/fullchain.pem',1001));await awaitServedLeaf(sha(old.raw),{proxy,target:previous});restored=true;}
 const error=new Error('Canonical certificate publication failed; private diagnostics suppressed',{cause});Object.defineProperty(error,'rollbackVerified',{value:restored,enumerable:true});throw error;
 }finally{if(lock){const held=await lock.stat(),actual=await lstat(lockPath);assert.equal(actual.ino,held.ino);assert.equal(actual.dev,held.dev);await lock.close();await unlink(lockPath);}}
 return result;
}
if(process.argv[1]===fileURLToPath(import.meta.url))publishInstalledOriginRenewal().then(r=>console.log(JSON.stringify(r))).catch(error=>{console.error(JSON.stringify({contract:'installed-origin-renewal-publication-1',published:false,status:'failed',rollbackVerified:error.rollbackVerified===true,applicationReleaseGranted:false,dnsChanged:false,privateDiagnosticsSuppressed:true}));process.exitCode=1;});
