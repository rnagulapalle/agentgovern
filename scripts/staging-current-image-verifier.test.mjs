import {expect,test} from 'vitest';
import {currentAssemblyBuildArguments,validateOwnedAssemblyImage,buildCurrentAssemblyImage,verifyApprovedCurrentBuildSources} from './staging-current-image-verifier.mjs';
import {readFile} from 'node:fs/promises';
const h='a'.repeat(64),owner='b'.repeat(48),imageId='sha256:'+h,options={sourceRoot:'/owned/source',iidFile:'/owned/output/image-id',tag:'ll-platform-'+ 'c'.repeat(24)+':ack',owner,freezeSha256:h,runId:'123'};
// Fixture observations are consistency tests only, never a genuine image proof.
const facts=()=>({Id:imageId,Os:'linux',Architecture:'amd64',Config:{User:'node',Cmd:['node','.worker/temporal-service.cjs','worker'],Labels:{'looplabs.worker.profile':'ack','looplabs.worker.target':'runner','looplabs.source-manifest-sha256':h,'looplabs.profile.component.run':'123','looplabs.assembly.build.owner':owner}}});
test('closed build recipe selects existing ACK Dockerfile/target/compile profile and process-owned iidfile',()=>{
 const args=currentAssemblyBuildArguments(options);expect(args).toContain('LOOPLABS_WORKER_PROFILE=ack');expect(args[args.indexOf('--target')+1]).toBe('runner');expect(args[args.indexOf('--file')+1]).toBe('/owned/source/Dockerfile.temporal');expect(args[args.indexOf('--iidfile')+1]).toBe(options.iidFile);expect(args.at(-1)).toBe(options.sourceRoot);expect(args).not.toContain('--build-arg=AWS_SECRET_ACCESS_KEY');
 for(const [key,value]of [['tag','existing:latest'],['owner','other'],['freezeSha256','wrong'],['sourceRoot','relative'],['iidFile','relative'],['runId','0']])expect(()=>currentAssemblyBuildArguments({...options,[key]:value})).toThrow();
});
test('same-job image invariants reuse original profile validator and refuse changed owner/run/profile/command/platform/volumes',()=>{
 const expected={imageId,freezeSha256:h,runId:'123',owner};expect(()=>validateOwnedAssemblyImage(facts(),expected)).not.toThrow();
 const changes=[f=>f.Id='sha256:'+ 'd'.repeat(64),f=>f.Architecture='arm64',f=>f.Config.User='root',f=>f.Config.Cmd=['sh'],f=>f.Config.Volumes={'/anonymous':{}},f=>f.Config.Labels['looplabs.worker.profile']='quote',f=>f.Config.Labels['looplabs.profile.component.run']='124',f=>f.Config.Labels['looplabs.assembly.build.owner']='foreign',f=>f.Config.Labels['looplabs.source-manifest-sha256']='d'.repeat(64)];
 for(const change of changes){const f=facts();change(f);expect(()=>validateOwnedAssemblyImage(f,expected)).toThrow();}
});
test('uploaded eligible/image facts and missing freeze cannot initiate a build or provide an observation',async()=>{
 await expect(buildCurrentAssemblyImage({...options,eligible:true})).rejects.toThrow();
 await expect(verifyApprovedCurrentBuildSources({sourceRoot:'/missing/current-build-source',freezeFile:'/missing/freeze.json',freezeSha256:h,constructionSha256:h})).rejects.toThrow();
});
test('source-owned verifier has no injected Docker/build/verification operation or enrollment primitive',async()=>{
 const source=await readFile(new URL('./staging-current-image-verifier.mjs',import.meta.url),'utf8');expect(source).toContain("execFileSync('docker'");expect(source).toContain('builder.build(...currentAssemblyBuildArguments');expect(source).toContain('inspectedWorkerArtifact(builtId,docker');expect(source).not.toContain('enrollInspectedWorker');expect(source).toContain('authenticatedCi:false');expect(source).toContain('releaseAccepted:false');
});
test('explicit quote recipe and genuine dedicated opt-in remain closed while ACK defaults stay unchanged',()=>{
 const quote={...options,profile:'quote',tag:options.tag.replace(':ack',':quote')};const args=currentAssemblyBuildArguments(quote);expect(args).toContain('LOOPLABS_WORKER_PROFILE=quote');expect(args[args.indexOf('--target')+1]).toBe('quote-runtime');expect(args).toContain('looplabs.worker.profile=quote');expect(()=>currentAssemblyBuildArguments({...quote,profile:'unknown'})).toThrow();expect(()=>currentAssemblyBuildArguments({...quote,tag:options.tag})).toThrow();
 expect(()=>currentAssemblyBuildArguments({...quote,execution:'dedicated-isolated-linux',runId:'dedicated-'+'d'.repeat(24)})).not.toThrow();expect(()=>currentAssemblyBuildArguments({...quote,execution:'dedicated-isolated-linux',runId:'123'})).toThrow();expect(()=>currentAssemblyBuildArguments({...quote,runId:'dedicated-'+'d'.repeat(24)})).toThrow();
 const q=facts();q.Config.Cmd=['node','.worker/quote-temporal-service.cjs','worker','quote'];q.Config.Labels['looplabs.worker.profile']='quote';q.Config.Labels['looplabs.worker.target']='quote-runtime';expect(()=>validateOwnedAssemblyImage(q,{imageId,freezeSha256:h,runId:'123',owner,profile:'quote'})).not.toThrow();expect(()=>validateOwnedAssemblyImage(q,{imageId,freezeSha256:h,runId:'123',owner})).toThrow();
});
