// Fixed production origin TLS inspection only. Does not mint/renew certificates,
// start listeners, grant deployment authority or accept caller-provided receipts.
import assert from 'node:assert/strict';
import {constants} from 'node:fs';
import {open} from 'node:fs/promises';
import {X509Certificate,createPrivateKey,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root='/srv/looplabs-production/config/origin-tls';
const minimumRemainingMs=7*24*60*60*1000;
export function validateInstalledOriginCertificateBytes(certificateBytes,keyBytes,now=Date.now()){
 assert(Number.isSafeInteger(now)&&now>=0,'Actual current time required');
 const blocks=certificateBytes.toString().match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g);
 assert(blocks&&blocks.length>=2&&blocks.length<=5,'Leaf and issuer chain required');
 const certificates=blocks.map(block=>new X509Certificate(block));const leaf=certificates[0];
 assert.equal(leaf.ca,false,'Origin leaf must not be a CA');
 assert(leaf.checkHost('looplabs.run',{subject:'never'})&&leaf.checkHost('www.looplabs.run',{subject:'never'}),'Canonical SANs required');
 assert(leaf.checkPrivateKey(createPrivateKey(keyBytes)),'Certificate key mismatch');
 for(let i=0;i<certificates.length;i++){
  const certificate=certificates[i];assert(Date.parse(certificate.validFrom)<=now&&Date.parse(certificate.validTo)>now+minimumRemainingMs,'Origin certificate expires too soon or is not valid yet');
  if(i+1<certificates.length)assert(certificate.checkIssued(certificates[i+1])&&certificate.verify(certificates[i+1].publicKey),'Origin issuer chain mismatch');
 }
 return Object.freeze({contract:'installed-origin-tls-inspection-1',canonicalNames:['looplabs.run','www.looplabs.run'],leafSha256:createHash('sha256').update(leaf.raw).digest('hex'),notAfter:leaf.validTo,minimumRemainingDays:7,renewalEstablished:false,listenerStarted:false});
}
async function readOwned(path){const h=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW);try{const s=await h.stat();assert(s.isFile()&&s.uid===1001&&s.nlink===1&&(s.mode&0o777)===0o600&&s.size>0&&s.size<65536,'Fixed owned private TLS file required');return await h.readFile();}finally{await h.close();}}
export async function inspectInstalledOriginTls(){
 const certificate=await readOwned(root+'/fullchain.pem'),key=await readOwned(root+'/privkey.pem');
 const result=validateInstalledOriginCertificateBytes(certificate,key);
 // Trusted system roots, fixed hostname and fixed private path; no insecure
 // transport option or arbitrary CA supplied by the deployment caller.
 execFileSync('/usr/bin/openssl',['verify','-verify_hostname','looplabs.run','-CApath','/etc/ssl/certs','-untrusted',root+'/fullchain.pem',root+'/fullchain.pem'],{stdio:['ignore','pipe','pipe'],timeout:10000});
 // Re-read after the subprocess to refuse a concurrent certificate replacement.
 assert((await readOwned(root+'/fullchain.pem')).equals(certificate)&&(await readOwned(root+'/privkey.pem')).equals(key),'Origin TLS material changed during inspection');
 return Object.freeze({...result,systemTrustVerified:true});
}
