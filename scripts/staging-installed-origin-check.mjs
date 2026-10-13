// Independent authenticated six-image origin check. This CLI grants no
// deployment authority and never starts a worker or application service.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile,open,lstat,realpath} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadInstalledAcceptedPackagesFromFile2} from './staging-installed-accepted-origins.mjs';
export function installedOriginCheckArguments2(argv){
 assert(Array.isArray(argv)&&argv.length===4,'Expected: request.json private-download-directory receipt.json source-root');
 const [input,downloadRoot,output,root]=argv;for(const path of argv)assert(typeof path==='string'&&resolve(path)===path,'Canonical absolute paths required');
 assert.notEqual(input,output);assert.notEqual(downloadRoot,root);return {input,downloadRoot,output,root};
}
export async function runInstalledOriginCheck2(argv){
 const {input,downloadRoot,output,root}=installedOriginCheckArguments2(argv);
 // Reserve output before any external operation; never overwrite a prior result.
 assert(await realpath(root)===root);const source=await lstat(root);assert(source.isDirectory()&&!source.isSymbolicLink());
 const parent=dirname(output);assert(await realpath(parent)===parent);const outputParent=await lstat(parent);assert(outputParent.isDirectory()&&!outputParent.isSymbolicLink()&&outputParent.uid===process.getuid()&&(outputParent.mode&0o7777)===0o700);
 const handle=await open(output,'wx',0o600);await handle.close();
 const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:600000,maxBuffer:2*1024**2,stdio:['ignore','pipe','pipe']});
 const owned=[];let result,error;try{result=await loadInstalledAcceptedPackagesFromFile2(input,docker,owned,{root,downloadRoot});}catch(cause){error=cause;}
 let cleanupPassed=false;try{
  // These exact IDs were individually proved absent before load by the source
  // owned consumer. Never prune, force, or remove another owner's image.
  const inventory=docker('image','ls','--no-trunc','--quiet').split('\n').filter(Boolean);assert(inventory.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)));
  for(const id of owned)if(inventory.includes(id))docker('image','rm',id);
  const after=docker('image','ls','--no-trunc','--quiet').split('\n').filter(Boolean);assert(after.every(id=>/^sha256:[a-f0-9]{64}$/.test(id)));assert(owned.every(id=>!after.includes(id)));cleanupPassed=true;
 }catch(cause){error??=cause;}
 const receipt={contract:'installed-independent-origin-check-2',completedUtc:new Date().toISOString(),passed:!error&&cleanupPassed,ownedCleanupVerified:cleanupPassed,...(result?{observation:result}:{}),fullInstalledAcceptance:false,releaseEligible:false,productionChanged:false,notProved:['current six-image promotion and reversion','current semantic drain and reset acceptance','persistent application installation','production operator acceptance']};
 // No provider/account exception text or credentials may reach the receipt.
 await writeFile(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600});if(error)throw Error('Independent six-image origin check or owned cleanup refused; sanitized receipt retained');return receipt;
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 try{const result=await runInstalledOriginCheck2(process.argv.slice(2));console.log(JSON.stringify({passed:result.passed,ownedCleanupVerified:result.ownedCleanupVerified,fullInstalledAcceptance:false,releaseEligible:false}));}
 catch{console.error('Independent six-image origin check refused; no account or Docker diagnostics printed.');process.exitCode=1;}
}
