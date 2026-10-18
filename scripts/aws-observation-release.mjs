// Exact optional private attachment for the read-only AWS observation broker.
import assert from 'node:assert/strict';
import {lstat,readFile,readlink,realpath} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash,X509Certificate} from 'node:crypto';
const destination='/run/aws-observation';
export const observationConfig=destination+'/authorization.json';
// The offline TypeScript loader needs a cache; credentials and root stay read-only.
export const observationInstallerTmpfs='/tmp:rw,nosuid,nodev,noexec,size=16777216,mode=1777';
const digest=b=>createHash('sha256').update(b).digest('hex');
export async function readObservationAttachment(root='/srv/looplabs-production/config'){
 assert.equal(root,'/srv/looplabs-production/config');const pointer=join(root,'aws-observation-current');let link;
 try{link=await lstat(pointer);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 assert(link.isSymbolicLink()&&link.uid===1001);const source=await readlink(pointer);assert(/^\/srv\/looplabs-production\/config\/aws-observation-[a-f0-9]{16}$/.test(source));
 const st=await lstat(source);assert(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===1001&&(st.mode&0o777)===0o700);assert.equal(await realpath(source),source);
 async function file(name,mode){const p=join(source,name),s=await lstat(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===1001&&(s.mode&0o777)===mode&&s.size<100*1024*1024);assert.equal(await realpath(p),p);return readFile(p);}
 const ready=JSON.parse((await file('ready.json',0o600)).toString());assert.equal(ready.version,1);assert.equal(ready.directory,source);assert.equal(ready.nativeHelperAndStsVerified,true);assert.equal(ready.brokerAccount,'962639302232');
 assert.deepEqual(Object.keys(ready.files).sort(),['authorization.json','certificate.pem','helper','key.pem']);
 const bytes={};for(const name of Object.keys(ready.files)){bytes[name]=await file(name,name==='helper'?0o500:0o600);assert.equal(digest(bytes[name]),ready.files[name],'Private observation attachment changed');}
 assert.equal(ready.files.helper,'beec9ed1c492d93db809890f16713e3556353294b823c2184ad4e891f1b2b54d');
 const cert=new X509Certificate(bytes['certificate.pem']);assert(Date.parse(cert.validTo)-Date.now()>86400000,'Observation certificate expires within one day');assert(Date.parse(cert.validFrom)<=Date.now());
 const c=JSON.parse(bytes['authorization.json'].toString());assert.equal(c.helper,destination+'/helper');assert.equal(c.certificate,destination+'/certificate.pem');assert.equal(c.privateKey,destination+'/key.pem');
 assert.equal(c.version,1);assert.equal(c.region,'us-west-2');assert.equal(c.brokerRoleArn,'arn:aws:iam::962639302232:role/looplabs-observation-broker-20261015');assert(/^[a-f0-9]{64}$/.test(c.externalIdSecret));assert.equal(c.templateBucket,'looplabs-m7-code-962639302232-f08cb8f0');assert.equal(c.templateKey,'onboarding/aws-observation-v1.json');
 return {source,target:destination,read_only:true,type:'bind',bind:{create_host_path:false,propagation:'rprivate'},files:ready.files,certificateExpires:cert.validTo};
}
export function observationVolume(attachment){assert(attachment&&/^\/srv\/looplabs-production\/config\/aws-observation-[a-f0-9]{16}$/.test(attachment.source));assert.equal(attachment.target,destination);assert.equal(attachment.read_only,true);assert.equal(attachment.type,'bind');return{type:'bind',source:attachment.source,target:destination,read_only:true,bind:{create_host_path:false,propagation:'rprivate'}};}
export function assertObservationHostChange(before,after,attachment,compare){
 if(!attachment){compare(before,after);return;}
 const volume=observationVolume(attachment),b=structuredClone(before),a=structuredClone(after);
 // Compose's long bind syntax must remain a read-only mount, with no implicit
 // host-directory creation and no propagation to another mount namespace.
 const extract=(v,required)=>{assert(!v.Binds?.some(x=>x.split(':')[1]===destination),'Legacy/ambiguous AWS bind refused');const found=(v.Mounts??[]).filter(m=>m.Target===destination);assert.equal(found.length,required?1:0);if(found.length){const m=found[0];assert.deepEqual(Object.keys(m).filter(k=>!['Consistency'].includes(k)).sort(),['BindOptions','ReadOnly','Source','Target','Type']);assert.equal(m.Type,'bind');assert.equal(m.Source,volume.source);assert.equal(m.ReadOnly,true);assert.deepEqual(m.BindOptions,{Propagation:'rprivate'});if(m.Consistency!==undefined)assert.equal(m.Consistency,'');v.Mounts=v.Mounts.filter(m=>m!==found[0]);}};
 const existed=(b.Mounts??[]).some(m=>m.Target===destination);extract(b,existed);extract(a,true);
 // Docker omits HostConfig.Mounts when the original container has only Binds.
 // Removing our sole long-form mount leaves [], which represents the same
 // absence of other mounts. Preserve every nonempty mount and other setting.
 for(const v of [b,a])if(Array.isArray(v.Mounts)&&v.Mounts.length===0)delete v.Mounts;
 compare(b,a);
}
export function assertObservationMounts(before,after,attachment){
 const sort=v=>[...v].sort((a,b)=>a.Destination.localeCompare(b.Destination));
 if(!attachment){assert.deepEqual(sort(after),sort(before));return;}
 const select=v=>v.filter(m=>m.Destination===destination),rest=v=>v.filter(m=>m.Destination!==destination);assert(select(before).length<=1);assert.equal(select(after).length,1);
 for(const m of [...select(before),...select(after)]){assert.equal(m.Type,'bind');assert.equal(m.Source,attachment.source);assert.equal(m.RW,false);assert.equal(m.Propagation,'rprivate');}
 assert.deepEqual(sort(rest(after)),sort(rest(before)));
}
