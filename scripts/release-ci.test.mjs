import {it,expect} from 'vitest';
import {readFile} from 'node:fs/promises';
import {verifyReleaseCi} from './release-ci.mjs';
const commit='a'.repeat(40),tree='b'.repeat(40),head='c'.repeat(40),repo='rnagulapalle/agentgovern';
function fixture({mainRuns=[],headRuns=[],headTree=tree,pullChanges={}}={}){
 const pull={merged_at:'2026-10-15T20:00:00Z',merge_commit_sha:commit,base:{ref:'main',repo:{full_name:repo}},head:{sha:head,repo:{full_name:repo}},...pullChanges};
 return {commit,tree,api:async path=>{
  if(path.includes('/pulls?'))return [pull];
  if(path.endsWith('/git/commits/'+commit))return {sha:commit,tree:{sha:tree}};
  if(path.endsWith('/git/commits/'+head))return {sha:head,tree:{sha:headTree}};
  if(path.includes('head_sha='+commit))return {workflow_runs:mainRuns};
  if(path.includes('head_sha='+head))return {workflow_runs:headRuns};
  throw Error('Unexpected GitHub request');
 }};
}
const run=(tested,id=10,changes={})=>({id,head_sha:tested,path:'.github/workflows/quality-gates.yml',repository:{full_name:repo},head_repository:{full_name:repo},event:'push',status:'completed',conclusion:'success',...changes});
it('accepts direct exact-commit CI or the identical tree of a merged internal PR',async()=>{
 expect(await verifyReleaseCi(fixture({mainRuns:[run(commit)]}))).toMatchObject({commit,tree,testedCommit:commit,run:10});
 expect(await verifyReleaseCi(fixture({headRuns:[run(head)]}))).toMatchObject({commit,tree,testedCommit:head,run:10});
});
it('refuses unmerged, different-base, foreign-repository and mismatched-tree evidence',async()=>{
 for(const pullChanges of [{merged_at:null},{merge_commit_sha:head},{base:{ref:'other',repo:{full_name:repo}}},{head:{sha:head,repo:{full_name:'someone/fork'}}}])await expect(verifyReleaseCi(fixture({headRuns:[run(head)],pullChanges}))).rejects.toThrow();
 await expect(verifyReleaseCi(fixture({headRuns:[run(head)],headTree:'d'.repeat(40)}))).rejects.toThrow();
});
it('refuses failed, pending, cancelled, skipped, wrong workflow or foreign run evidence',async()=>{
 for(const changes of [{conclusion:'failure'},{status:'in_progress'},{conclusion:'cancelled'},{conclusion:'skipped'},{path:'.github/workflows/other.yml'},{event:'pull_request_target'},{head_sha:commit},{repository:{full_name:'other/repo'}},{head_repository:{full_name:'other/repo'}}])await expect(verifyReleaseCi(fixture({headRuns:[run(head,10,changes)]}))).rejects.toThrow();
});
it('does not fall back to an old success after a newer failed or pending run',async()=>{
 await expect(verifyReleaseCi(fixture({headRuns:[run(head)],mainRuns:[run(commit,11,{conclusion:'failure'})]}))).rejects.toThrow();
 await expect(verifyReleaseCi(fixture({headRuns:[run(head),run(head,12,{status:'in_progress',conclusion:null})]}))).rejects.toThrow();
});
it('refuses absent, malformed and unavailable GitHub evidence',async()=>{
 await expect(verifyReleaseCi(fixture())).rejects.toThrow();
 await expect(verifyReleaseCi({...fixture(),commit:'not-a-sha'})).rejects.toThrow();
 await expect(verifyReleaseCi({...fixture(),api:async()=>{throw Error('unavailable');}})).rejects.toThrow('unavailable');
});
it('does not repeat full quality in push/deployment and does not trigger it on squash merge',async()=>{
 for(const path of ['../.githooks/pre-push','./release-gate.sh','./deploy-control-demo.sh','./quote-demo-source-gate.sh'])expect(await readFile(new URL(path,import.meta.url),'utf8')).not.toMatch(/\bpnpm (?:exec )?(?:quality|vitest|build|lint)\b/);
 for(const path of ['./release-gate.sh','./deploy-control-demo.sh','./quote-demo-source-gate.sh'])expect(await readFile(new URL(path,import.meta.url),'utf8')).toContain('node scripts/release-ci.mjs');
 const workflow=await readFile(new URL('../.github/workflows/quality-gates.yml',import.meta.url),'utf8');expect(workflow).toContain("branches: ['codex/**']");expect(workflow).toContain('workflow_dispatch:');expect(workflow.match(/run: pnpm quality/g)).toHaveLength(1);
});
