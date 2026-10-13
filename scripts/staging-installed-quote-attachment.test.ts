import {it,expect} from 'vitest';
import {mkdtemp,realpath,chmod,mkdir,writeFile,rm,copyFile,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {createTlsFixture} from '../lib/quotes/tls.test-fixture';
import {attachInstalledQuoteRuntime} from './staging-installed-quote-attachment';
async function fixture(run:(root:string,input:Parameters<typeof attachInstalledQuoteRuntime>[0])=>Promise<void>){
 const tls=await createTlsFixture(),root=await realpath(await mkdtemp(join(tmpdir(),'ll-quote-attachment-')));await chmod(root,0o700);
 try{
  for(const dir of ['worker','scheduler','trust'])await mkdir(join(root,dir),{mode:0o700});await copyFile(tls.ca,join(root,'trust','ca.pem'));
  const transport={mode:'verified-tls',trust:'owned-ca',caFile:join(root,'trust','ca.pem'),caSha256:tls.caSha256},epoch=randomUUID();
  for(const purpose of ['worker','scheduler']){const role='llqt_'+purpose,w={version:1,installation:'quote_test',schema:'fixture',database:'looplabs_test',transport,entries:[{url:`postgresql://${role}:private_password@trial-db:5432/looplabs_test`,role,org:'local-proof',epoch,purpose}]},bytes=JSON.stringify(w);
   const m={contract:'quote-worker-execution-2',workspaceId:'local-proof',recoveryEpoch:epoch,roleOid:'42',databaseOid:'99',buildId:'quote-'+'a'.repeat(64),scopeId:randomUUID(),quoteId:'quote-42',distributorId:'distributor-7',quoteBinding:'b'.repeat(64),emailBinding:'c'.repeat(64),nativeOrigin:'https://quote-twin.looplabs.test:9443',emailOrigin:'https://quote-email.looplabs.test:9444',nativeToken:'n'.repeat(32),emailToken:'m'.repeat(32),nativeTransport:transport,emailTransport:transport},execution=JSON.stringify(m);
   await writeFile(join(root,purpose,'workloads.json'),bytes,{mode:0o600});if(purpose==='worker')await writeFile(join(root,purpose,'execution.json'),execution,{mode:0o600});await writeFile(join(root,purpose,'ready.json'),JSON.stringify({installation:w.installation,workloadsSha256:createHash('sha256').update(bytes).digest('hex'),...(purpose==='worker'?{executionSha256:createHash('sha256').update(execution).digest('hex')}:{})}),{mode:0o600});
  }
  await run(root,{workerExecutionFile:join(root,'worker','execution.json'),schedulerFile:join(root,'scheduler','workloads.json'),workloadToken:'w'.repeat(43),taskQueue:'quote-installed',temporal:{LOOPLABS_TEMPORAL_ADDRESS:'temporal:7233',LOOPLABS_TEMPORAL_NAMESPACE:'looplabs-staging-quote',LOOPLABS_TEMPORAL_API_KEY:'k'.repeat(43),LOOPLABS_TEMPORAL_CA_PATH:'/run/temporal-tls/ca.pem',LOOPLABS_TEMPORAL_CERT_PATH:'/run/temporal-tls/client.pem',LOOPLABS_TEMPORAL_KEY_PATH:'/run/temporal-tls/client.key'}});
 }finally{await rm(root,{recursive:true,force:true});await tls.close();}
}
it('attachment keeps native execution credentials away from scheduler and mounts only distinct sealed purposes and trust',()=>fixture(async(root,input)=>{
 const output=join(root,'attached');expect((await attachInstalledQuoteRuntime(input,output)).currentImageExecuted).toBe(false);
 const env=await readFile(join(output,'quote-scheduler.env'),'utf8');expect(env).not.toContain('LOOPLABS_QUOTE_WORKER_EXECUTION_FILE');expect(env).not.toContain('nativeToken');expect(env).not.toContain('provisioner');
 const compose=JSON.parse(await readFile(join(output,'compose-quote-installed.json'),'utf8'));expect(compose.services['quote-worker'].command.at(-1)).toBe('quote');expect(compose.services['quote-scheduler'].volumes.every((v:{source:string})=>!v.source.endsWith('/worker'))).toBe(true);
}),15000);
it('signing keys cannot enter CA trust mount and mixed purposes never write prepared output',()=>fixture(async(root,input)=>{
 await writeFile(join(root,'trust','ca.key'),'private',{mode:0o600});await expect(attachInstalledQuoteRuntime(input,join(root,'bad'))).rejects.toThrow('Trust-only');await rm(join(root,'trust','ca.key'));
 await expect(attachInstalledQuoteRuntime({...input,schedulerFile:join(root,'worker','workloads.json')},join(root,'bad'))).rejects.toThrow();
 await expect(attachInstalledQuoteRuntime({...input,temporal:{...input.temporal,LOOPLABS_TEMPORAL_ADDRESS:'foreign:7233'}},join(root,'bad'))).rejects.toThrow();
}),15000);
