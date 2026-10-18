// Execution opt-in only, never CI/release/provider attestation. Dedicated Linux
// diagnostics remain distinguishable from authentic GHA and issue no artifact.
import assert from 'node:assert/strict';
export function installedDiagnosticRunnerMode(env,facts){
 assert(facts.platform==='linux'&&facts.arch==='x64','Actual Linux/AMD64 required');
 assert(Number.isSafeInteger(facts.uid)&&facts.uid>0&&Number.isSafeInteger(facts.gid)&&facts.gid>0,'Owned nonroot diagnostic user required');
 assert.equal(env.LOOPLABS_STAGING_PLATFORM_PROOF,'isolated');
 if(env.GITHUB_ACTIONS==='true'){assert.equal(env.LOOPLABS_INSTALLED_DEDICATED_LINUX_PROOF,undefined,'Do not conflate dedicated diagnostics with CI');return {mode:'github-actions',ci:true,releaseAccepted:false};}
 assert.equal(env.GITHUB_ACTIONS,undefined,'Do not spoof CI flags for a dedicated diagnostic');
 assert.equal(env.LOOPLABS_INSTALLED_DEDICATED_LINUX_PROOF,'isolated','Explicit dedicated isolated Linux diagnostic opt-in required');
 return {mode:'dedicated-isolated-linux',ci:false,providerAttested:false,releaseAccepted:false};
}
export function actualInstalledDiagnosticRunner(){return installedDiagnosticRunnerMode(process.env,{platform:process.platform,arch:process.arch,uid:process.getuid?.(),gid:process.getgid?.()});}
