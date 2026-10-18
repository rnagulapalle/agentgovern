// Reuse GitHub's completed quality run; never accept a caller-supplied receipt.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repository='rnagulapalle/agentgovern',sha=/^[a-f0-9]{40}$/;
export async function verifyReleaseCi({commit,tree,api}){
 assert(sha.test(commit)&&sha.test(tree),'Exact release commit and tree required');
 const candidates=[commit];
 const pulls=await api(`repos/${repository}/commits/${commit}/pulls?per_page=100`);
 assert(Array.isArray(pulls),'GitHub pull request evidence unavailable');
 for(const p of pulls){
  if(p.merged_at&&p.merge_commit_sha===commit&&p.base?.ref==='main'&&p.base?.repo?.full_name===repository&&p.head?.repo?.full_name===repository&&sha.test(p.head.sha))candidates.push(p.head.sha);
 }
 const accepted=[];
 for(const tested of [...new Set(candidates)]){
  const source=await api(`repos/${repository}/git/commits/${tested}`);
  if(source.sha!==tested||source.tree?.sha!==tree)continue;
  const evidence=await api(`repos/${repository}/actions/workflows/quality-gates.yml/runs?head_sha=${tested}&per_page=100`);
  assert(Array.isArray(evidence.workflow_runs),'GitHub workflow evidence unavailable');
  const runs=evidence.workflow_runs.filter(r=>r.head_sha===tested&&r.path==='.github/workflows/quality-gates.yml'&&r.repository?.full_name===repository&&r.head_repository?.full_name===repository&&['push','workflow_dispatch'].includes(r.event)).sort((a,b)=>b.id-a.id);
  for(const run of runs){assert(Number.isSafeInteger(run.id)&&run.id>0,'Invalid GitHub run identity');accepted.push({run,tested});}
 }
 // A newer failed/running run for the identical source must not be hidden by
 // an earlier success, even when one ran on main and the other on the PR head.
 const latest=accepted.sort((a,b)=>b.run.id-a.run.id)[0];
 if(latest?.run.status==='completed'&&latest.run.conclusion==='success')return {contract:'github-ci-identical-release-tree-1',commit,tree,testedCommit:latest.tested,run:latest.run.id,url:`https://github.com/${repository}/actions/runs/${latest.run.id}`};
 throw Error('Release requires a successful Quality gates run for this source tree. Run CI; do not repeat the suite locally.');
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{
  assert.equal(process.argv.length,2,'No caller evidence arguments accepted');
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();
  assert(['https://github.com/'+repository,'https://github.com/'+repository+'.git','git@github.com:'+repository+'.git'].includes(git('remote','get-url','origin')),'Unexpected release repository');
  const receipt=await verifyReleaseCi({commit:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),api:async endpoint=>JSON.parse(execFileSync('gh',['api','--hostname','github.com',endpoint],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}))});
  console.log(JSON.stringify(receipt));
 }catch(error){console.error(error instanceof assert.AssertionError?error.message:'CI evidence unavailable or not successful. Authenticate gh for this repository and inspect its Quality gates run.');process.exitCode=1;}
}
