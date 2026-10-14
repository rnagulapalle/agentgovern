// Offline transport issuance only. Does not publish trust, change authority or start a service.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {mkdir,open,lstat,realpath,writeFile} from 'node:fs/promises';
import {resolve,dirname,join,basename} from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createHash,createPrivateKey,X509Certificate,randomBytes} from 'node:crypto';
const exec=promisify(execFile),day=86400000,sha=b=>createHash('sha256').update(b).digest('hex');
const purposes=Object.freeze({
 db:Object.freeze({host:'trial-db',san:'DNS:trial-db',cert:'server.pem',key:'server.key',subjectAltName:'DNS:trial-db'}),
 native:Object.freeze({host:'quote-twin.looplabs.test',san:'IP:127.0.0.1,DNS:quote-twin.looplabs.test',cert:'cert.pem',key:'key.pem',subjectAltName:'IP Address:127.0.0.1, DNS:quote-twin.looplabs.test'}),
 email:Object.freeze({host:'quote-email.looplabs.test',san:'IP:127.0.0.1,DNS:quote-email.looplabs.test',cert:'cert.pem',key:'key.pem',subjectAltName:'IP Address:127.0.0.1, DNS:quote-email.looplabs.test'}),
});
function exactData(value,keys){if(!value||Object.getPrototypeOf(value)!==Object.prototype)return false;const ds=Object.getOwnPropertyDescriptors(value);return Reflect.ownKeys(ds).length===keys.length&&keys.every(k=>ds[k]?.enumerable&&Object.hasOwn(ds[k],'value'));}
function pathValue(path){assert(typeof path==='string'&&path===resolve(path)&&/^[A-Za-z0-9_./-]+$/.test(path)&&!path.split('/').some(x=>x==='.'||x==='..'),'Canonical safe absolute path required');return path;}
async function privateDirectory(path){pathValue(path);assert.equal(await realpath(path),path,'Aliased directory refused');const s=await lstat(path);assert(s.isDirectory()&&!s.isSymbolicLink()&&s.uid===process.getuid()&&(s.mode&0o777)===0o700,'Owned private directory required');return s;}
async function privateBytes(path){pathValue(path);await privateDirectory(dirname(path));assert.equal(await realpath(path),path);const fd=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await fd.stat();assert(s.isFile()&&s.uid===process.getuid()&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size>0&&s.size<=65536,'Owned private bounded file required');const b=await fd.readFile();const after=await fd.stat(),named=await lstat(path);for(const k of ['dev','ino','mode','uid','nlink','size','mtimeMs','ctimeMs']){assert.equal(after[k],s[k]);assert.equal(named[k],s[k]);}return b;}finally{await fd.close();}}
const put=(file,bytes='')=>writeFile(file,bytes,{mode:0o600,flag:'wx'});
/** Inspect a fixed internal cohort, never an arbitrary hostname or trust policy. */
export async function inspectInternalCertificateGeneration(input,options={nowMs:Date.now(),minimumRemainingMs:7*day}){
 assert(exactData(input,['kind','caFile','certificateFile','keyFile']),'Exact inspection input required');
 const p=purposes[input.kind];assert(p,'Unknown internal certificate purpose');assert(exactData(options,['nowMs','minimumRemainingMs'])&&Number.isSafeInteger(options.nowMs)&&options.nowMs>=0&&Number.isSafeInteger(options.minimumRemainingMs)&&options.minimumRemainingMs>=0&&options.minimumRemainingMs<=90*day,'Bounded observation window required');
 const {caFile,certificateFile,keyFile}=input;assert.equal(basename(caFile),'ca.pem');assert.equal(basename(certificateFile),p.cert);assert.equal(basename(keyFile),p.key);assert.equal(dirname(certificateFile),dirname(keyFile));
 const caBytes=await privateBytes(caFile),certBytes=await privateBytes(certificateFile),keyBytes=await privateBytes(keyFile);assert([caBytes,certBytes].every(b=>/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\s*$/.test(b.toString('utf8'))),'One exact PEM certificate required');const ca=new X509Certificate(caBytes),leaf=new X509Certificate(certBytes),key=createPrivateKey(keyBytes);
 assert(ca.ca&&ca.checkIssued(ca)&&ca.verify(ca.publicKey),'Self-issued CA required');assert(!leaf.ca&&leaf.checkIssued(ca)&&leaf.verify(ca.publicKey),'Exact certificate chain required');assert(leaf.checkPrivateKey(key)&&key.asymmetricKeyType==='rsa'&&key.asymmetricKeyDetails.modulusLength>=2048,'Exact RSA private key required');
 assert.equal(leaf.subjectAltName,p.subjectAltName,'Exact cohort SAN required');assert(leaf.checkHost(p.host,{subject:'never'}),'Fixed cohort hostname required');assert.deepEqual(leaf.keyUsage,['1.3.6.1.5.5.7.3.1'],'Only server authentication EKU permitted');
 for(const cert of [ca,leaf])assert(Date.parse(cert.validFrom)<=options.nowMs&&Date.parse(cert.validTo)>options.nowMs+options.minimumRemainingMs,'Certificate invalid or insufficient validity runway');
 await exec('openssl',['verify','-x509_strict','-CAfile',caFile,'-verify_hostname',p.host,'-purpose','sslserver','-attime',String(Math.floor(options.nowMs/1000)),certificateFile],{timeout:10000,maxBuffer:65536});
 assert((await privateBytes(caFile)).equals(caBytes)&&(await privateBytes(certificateFile)).equals(certBytes)&&(await privateBytes(keyFile)).equals(keyBytes),'Certificate generation changed during inspection');
 return Object.freeze({caFile,caSha256:sha(caBytes),serverDirectory:dirname(certificateFile),certificateFile,keyFile,certificateSha256:sha(certBytes),keySha256:sha(keyBytes),serverName:p.host,notBefore:leaf.validFrom,notAfter:leaf.validTo,caNotAfter:ca.validTo,chainVerified:true,minimumRemainingMs:options.minimumRemainingMs});
}
/** Creates one exclusive out-of-place private generation. Retains separate offline
 * CA keys; callers must publish exact trust generations under their own release lock. */
export async function issueInternalCertificateGeneration(outputRoot){
 pathValue(outputRoot);await privateDirectory(dirname(outputRoot));await mkdir(outputRoot,{mode:0o700});await privateDirectory(outputRoot);
 const result={};
 for(const [kind,p] of Object.entries(purposes)){
  const cohort=join(outputRoot,kind),offline=join(cohort,'offline'),trust=join(cohort,'trust'),server=join(cohort,'server');for(const d of [cohort,offline,trust,server]){await mkdir(d,{mode:0o700});await privateDirectory(d);}
  const caFile=join(trust,'ca.pem'),caKey=join(offline,'ca.key'),certificateFile=join(server,p.cert),keyFile=join(server,p.key),csr=join(offline,'leaf.csr'),ext=join(offline,'leaf.ext');
  for(const f of [caFile,caKey,certificateFile,keyFile,csr])await put(f);await put(ext,`basicConstraints=critical,CA:FALSE\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\nsubjectAltName=${p.san}\n`);
  await exec('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','90','-subj',`/CN=LoopLabs retained ${kind} transport CA`,'-addext','basicConstraints=critical,CA:TRUE','-addext','keyUsage=critical,keyCertSign,cRLSign','-keyout',caKey,'-out',caFile],{timeout:30000,maxBuffer:65536});
  await exec('openssl',['req','-newkey','rsa:2048','-nodes','-subj',`/CN=${p.host}`,'-keyout',keyFile,'-out',csr],{timeout:30000,maxBuffer:65536});
  await exec('openssl',['x509','-req','-in',csr,'-CA',caFile,'-CAkey',caKey,'-set_serial','0x'+randomBytes(16).toString('hex'),'-days','90','-extfile',ext,'-out',certificateFile],{timeout:30000,maxBuffer:65536});
  const inspection=await inspectInternalCertificateGeneration({kind,caFile,certificateFile,keyFile});const ca=new X509Certificate(await privateBytes(caFile));assert(ca.checkPrivateKey(createPrivateKey(await privateBytes(caKey))),'Offline CA key mismatch');
  result[kind]=Object.freeze({...inspection,offlineDirectory:offline,caKeyFile:caKey});
 }
 assert.equal(new Set(Object.values(result).map(x=>x.caSha256)).size,3,'Purpose-separated CAs required');return Object.freeze(result);
}
