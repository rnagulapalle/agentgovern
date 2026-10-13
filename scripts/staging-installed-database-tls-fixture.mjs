// Narrow source-owned extraction of the existing assembled producer TLS fixture.
// Isolated proof only: this is not public certificate or production CA issuance.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,chmod,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
export async function prepareInstalledDatabaseTlsFixture(parent,password,postgresImage,docker){
 assert(resolve(parent)===parent&&/^[A-Za-z0-9_-]{32,128}$/.test(password)&&/^[^\s]+@sha256:[a-f0-9]{64}$/.test(postgresImage)&&typeof docker==='function');const tlsDirectory=resolve(parent,'db-tls'),caDirectory=resolve(parent,'db-ca'),dataDirectory=resolve(parent,'db-data');for(const d of [tlsDirectory,caDirectory,dataDirectory])await mkdir(d,{mode:0o700});const ssl=(...args)=>execFileSync('openssl',args,{stdio:'ignore',timeout:30000});
 ssl('req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=Owned assembled DB CA','-addext','basicConstraints=critical,CA:TRUE','-keyout',resolve(tlsDirectory,'ca.key'),'-out',resolve(caDirectory,'ca.pem'));
 ssl('req','-newkey','rsa:2048','-nodes','-subj','/CN=trial-db','-keyout',resolve(tlsDirectory,'server.key'),'-out',resolve(tlsDirectory,'server.csr'));await writeFile(resolve(tlsDirectory,'ext'),'subjectAltName=DNS:trial-db\nextendedKeyUsage=serverAuth\n',{mode:0o600});
 ssl('x509','-req','-in',resolve(tlsDirectory,'server.csr'),'-CA',resolve(caDirectory,'ca.pem'),'-CAkey',resolve(tlsDirectory,'ca.key'),'-CAcreateserial','-days','1','-extfile',resolve(tlsDirectory,'ext'),'-out',resolve(tlsDirectory,'server.pem'));
 await writeFile(resolve(tlsDirectory,'password'),password,{mode:0o600});const passwdFile=resolve(tlsDirectory,'passwd');await writeFile(passwdFile,docker('run','--rm','--network','none','--entrypoint','cat',postgresImage,'/etc/passwd')+`\nlltrial:x:${process.getuid()}:${process.getgid()}:Owned:/tmp:/bin/sh\n`,{mode:0o600});for(const f of ['server.key','server.pem'])await chmod(resolve(tlsDirectory,f),0o600);const caFile=resolve(caDirectory,'ca.pem');await chmod(caFile,0o600);await rm(resolve(caDirectory,'ca.srl'),{force:true});return {tlsDirectory,dataDirectory,passwdFile,caFile,transport:{mode:'verified-tls',trust:'owned-ca',caFile,caSha256:createHash('sha256').update(await readFile(caFile)).digest('hex')}};
}
