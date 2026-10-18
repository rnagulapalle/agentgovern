import {expect,it} from 'vitest';import {writeFile,readFile,chmod,symlink} from 'node:fs/promises';import {join} from 'node:path';
import {readNativeQuoteTlsGeneration} from './server-tls-generation';import {BoundedHttpsJsonClient} from './https-transport';import {createTlsFixture,tlsScope,sha} from './tls.test-fixture';
async function fixture(run:(f:Awaited<ReturnType<typeof createTlsFixture>>)=>Promise<void>){const f=await createTlsFixture();try{await run(f);}finally{await f.close();}}
it('actual TLS server uses sealed matching key/cert and refuses requests after publication drift',async()=>fixture(async f=>{
 const generation=await readNativeQuoteTlsGeneration(f.file,tlsScope);let calls=0;const server=generation.createServer((_req,res)=>{calls++;res.writeHead(200,{'content-type':'application/json'});res.end('{"observed":true}');});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));
 try{const origin='https://127.0.0.1:'+(server.address() as {port:number}).port;const client=new BoundedHttpsJsonClient({origin,transport:{mode:'verified-tls',trust:'owned-ca',caFile:f.ca,caSha256:f.caSha256}},async()=>'t'.repeat(40),async()=>{});expect(await client.request('/quotes/q',{method:'GET'})).toEqual({status:200,body:{observed:true}});await f.publish({...f.config,quoteId:'other'});expect(await client.request('/quotes/q',{method:'GET'})).toEqual({status:503,body:{status:'unavailable'}});expect(calls).toBe(1);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));}
}),10000);
it('refuses foreign scope, wrong key, digest and exact generation inventory',async()=>fixture(async f=>{
 await expect(readNativeQuoteTlsGeneration(f.file,{...tlsScope,workspaceId:'foreign'})).rejects.toMatchObject({status:503});
 await f.publish({...f.config,keySha256:'0'.repeat(64)});await expect(readNativeQuoteTlsGeneration(f.file,tlsScope)).rejects.toMatchObject({status:503});
 const wrong=await readFile(join(f.root,'ca.key'));await writeFile(join(f.dir,'key.pem'),wrong);await f.publish({...f.config,keySha256:sha(wrong)});await expect(readNativeQuoteTlsGeneration(f.file,tlsScope)).rejects.toMatchObject({status:503});
 await writeFile(join(f.dir,'key.pem'),await readFile(join(f.root,'leaf.key')));await f.publish();await writeFile(join(f.dir,'extra'),'unexpected',{mode:0o600});await expect(readNativeQuoteTlsGeneration(f.file,tlsScope)).rejects.toMatchObject({status:503});
}),10000);
it('refuses symlink, private key permissions and CA certificate used as server leaf',async()=>fixture(async f=>{
 await chmod(join(f.dir,'key.pem'),0o644);await expect(readNativeQuoteTlsGeneration(f.file,tlsScope)).rejects.toMatchObject({status:503});await chmod(join(f.dir,'key.pem'),0o600);
 const ca=await readFile(f.ca);await writeFile(join(f.dir,'cert.pem'),ca);await f.publish({...f.config,certSha256:sha(ca)});await expect(readNativeQuoteTlsGeneration(f.file,tlsScope)).rejects.toMatchObject({status:503});
 await symlink(f.file,join(f.root,'tls.json'));await expect(readNativeQuoteTlsGeneration(join(f.root,'tls.json'),tlsScope)).rejects.toMatchObject({status:503});
}),10000);

it('PEM private marker remains case-sensitive with exactly one ASCII space and exact framing',async()=>fixture(async f=>{
 const original=(await readFile(join(f.dir,'key.pem'))).toString(),marker=['PRIVATE','KEY'].join(' ');
 await readNativeQuoteTlsGeneration(f.file,tlsScope); // genuine generated PKCS8
 for(const replacement of ['PRIVATE  KEY','PRIVATE\tKEY','private key','Private Key','PRIVATEKEY','RSA '+marker]){
  const bytes=Buffer.from(original.replaceAll(marker,replacement));await writeFile(join(f.dir,'key.pem'),bytes);await f.publish({...f.config,keySha256:sha(bytes)});await expect(readNativeQuoteTlsGeneration(f.file,tlsScope)).rejects.toMatchObject({status:503});
 }
 const broken=Buffer.from(original.replace('-----BEGIN','----BEGIN'));await writeFile(join(f.dir,'key.pem'),broken);await f.publish({...f.config,keySha256:sha(broken)});await expect(readNativeQuoteTlsGeneration(f.file,tlsScope)).rejects.toMatchObject({status:503});
 const crlf=Buffer.from(original.replaceAll('\n','\r\n'));await writeFile(join(f.dir,'key.pem'),crlf);await f.publish({...f.config,keySha256:sha(crlf)});await readNativeQuoteTlsGeneration(f.file,tlsScope);
}),10000);
