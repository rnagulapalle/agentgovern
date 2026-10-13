// Initial pair-layout bootstrap only; no ACME, proxy reload or listener start.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {lstat,open,mkdir,writeFile,readlink,symlink,unlink} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {validateInstalledOriginCertificateBytes,inspectInstalledOriginTls} from './installed-origin-tls.mjs';
const root='/srv/looplabs-production/config/origin-tls';
const escapeRegex=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
async function directory(path){const s=await lstat(path);assert(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===1001&&(s.mode&0o777)===0o700);}
async function file(path){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();assert(s.isFile()&&s.uid===1001&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size>0&&s.size<65536);return await h.readFile();}finally{await h.close();}}
export async function bootstrapInstalledOriginTls(){
 assert.equal(process.getuid(),1001);await directory(root);
 try{await mkdir(root+'/generations',{mode:0o700});}catch(e){if(e.code!=='EEXIST')throw e;}await directory(root+'/generations');
 try{const current=await lstat(root+'/current');assert(current.isSymbolicLink()&&current.uid===1001);const target=await readlink(root+'/current');assert(new RegExp('^'+escapeRegex(root)+'/generations/[a-f0-9]{64}$').test(target));await directory(target);const validation=validateInstalledOriginCertificateBytes(await file(target+'/fullchain.pem'),await file(target+'/privkey.pem'));return {contract:'initial-origin-tls-layout-1',created:false,leafSha256:validation.leafSha256,renewalEstablished:false};}catch(e){if(e.code!=='ENOENT')throw e;}
 await inspectInstalledOriginTls();const certificate=await file(root+'/fullchain.pem'),key=await file(root+'/privkey.pem');const validation=validateInstalledOriginCertificateBytes(certificate,key);const generation=root+'/generations/'+createHash('sha256').update(Buffer.concat([certificate,key])).digest('hex');
 try{await mkdir(generation,{mode:0o700});await writeFile(generation+'/fullchain.pem',certificate,{mode:0o600,flag:'wx'});await writeFile(generation+'/privkey.pem',key,{mode:0o600,flag:'wx'});}catch(e){if(e.code!=='EEXIST')throw e;}
 await directory(generation);assert((await file(generation+'/fullchain.pem')).equals(certificate)&&(await file(generation+'/privkey.pem')).equals(key));
 const temporary=root+'/.initial-current';await symlink(generation,temporary);try{
 // Exclusive link create prevents replacing any concurrently initialized or
 // renewed generation. Rename is not used as an overwrite primitive here.
 await symlink(generation,root+'/current');
 }finally{await unlink(temporary);}return {contract:'initial-origin-tls-layout-1',created:true,leafSha256:validation.leafSha256,renewalEstablished:false};
}
if(process.argv[1]===fileURLToPath(import.meta.url))bootstrapInstalledOriginTls().then(r=>console.log(JSON.stringify(r))).catch(()=>{console.error('Initial canonical TLS layout refused; no listener or certificate renewal was established.');process.exitCode=1;});
