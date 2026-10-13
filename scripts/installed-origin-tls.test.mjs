import {describe,it,expect} from 'vitest';
import {validateInstalledOriginCertificateBytes} from './installed-origin-tls.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
function fixture(test){const root=mkdtempSync(join(tmpdir(),'ll-origin-tls-'));const run=args=>execFileSync('openssl',args,{cwd:root,stdio:'ignore'});try{
 run(['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','30','-subj','/CN=Test CA']);
 run(['req','-newkey','rsa:2048','-nodes','-keyout','leaf.key','-out','leaf.csr','-subj','/CN=looplabs.run']);
 writeFileSync(join(root,'ext'),'basicConstraints=CA:FALSE\nsubjectAltName=DNS:looplabs.run,DNS:www.looplabs.run\n');
 run(['x509','-req','-in','leaf.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','leaf.pem','-days','20','-extfile','ext']);
 test({chain:Buffer.concat([readFileSync(join(root,'leaf.pem')),readFileSync(join(root,'ca.pem'))]),key:readFileSync(join(root,'leaf.key')),caKey:readFileSync(join(root,'ca.key'))});
 }finally{rmSync(root,{recursive:true,force:true});}}
describe('Certificate byte checks — generated local CA, not public system trust or renewal',()=>{
 it('checks canonical SANs, matching key, issuer signatures and seven-day runway',()=>fixture(({chain,key})=>{const r=validateInstalledOriginCertificateBytes(chain,key);expect(r.canonicalNames).toEqual(['looplabs.run','www.looplabs.run']);expect(r.renewalEstablished).toBe(false);expect(r.listenerStarted).toBe(false);}));
 it('refuses another private key',()=>fixture(({chain,caKey})=>expect(()=>validateInstalledOriginCertificateBytes(chain,caKey)).toThrow()));
 it('refuses expiry inside seven-day runway',()=>fixture(({chain,key})=>expect(()=>validateInstalledOriginCertificateBytes(chain,key,Date.now()+14*86400000)).toThrow()));
 it('refuses future-valid certificate observation',()=>fixture(({chain,key})=>expect(()=>validateInstalledOriginCertificateBytes(chain,key,Date.now()-86400000)).toThrow()));
 it('refuses a leaf without issuer chain',()=>fixture(({chain,key})=>expect(()=>validateInstalledOriginCertificateBytes(Buffer.from(chain.toString().match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/)[0]),key)).toThrow()));
 it('refuses malformed certificate and key',()=>expect(()=>validateInstalledOriginCertificateBytes(Buffer.from('invalid'),Buffer.from('invalid'))).toThrow());
});
