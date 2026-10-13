// Source-owned CI observation recording only. No accepted receipt or release flag.
import assert from 'node:assert/strict';
import {readFile,writeFile,lstat,realpath} from 'node:fs/promises';
import {resolve} from 'node:path';
import {installedObservationReceipt2} from './staging-installed-release-intake.mjs';
try{
 assert(process.env.GITHUB_ACTIONS==='true'&&process.env.LOOPLABS_STAGING_BROWSER_PROOF==='isolated'&&process.argv.length===4);
 const [directory,output]=process.argv.slice(2);assert(resolve(directory)===directory&&resolve(output)===output);
 const state=await lstat(directory);assert(state.isDirectory()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o7777)===0o700&&await realpath(directory)===directory);
 const read=async name=>{const path=resolve(directory,name),before=await lstat(path);assert(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&before.nlink===1&&(before.mode&0o7777)===0o600&&before.size>0&&before.size<=2*1024**2);const bytes=await readFile(path),after=await lstat(path);for(const key of ['dev','ino','uid','nlink','mode','size','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);assert.equal(bytes.length,before.size);return JSON.parse(bytes);};
 const envelope={contract:'installed-generation-observation-intake-2',observations:await read('diagnostic-result.json'),construction:await read('construction.json'),sourceBefore:await read('source-before.json'),sourceAfter:await read('source-after.json'),cleanup:await read('cleanup.json')};
 const receipt=await installedObservationReceipt2(envelope,{runId:Number(process.env.GITHUB_RUN_ID),privateWorkflowCommit:process.env.GITHUB_SHA,publicBaseCommit:process.env.LOOPLABS_SOURCE_BASE,exactCompressedOverlaySha256:process.env.LOOPLABS_SOURCE_OVERLAY_SHA256});
 await writeFile(output,JSON.stringify(receipt,null,2)+'\n',{mode:0o600,flag:'wx'});console.log(JSON.stringify({recorded:true,contract:receipt.contract,fullInstalledAcceptance:false,releaseEligible:false}));
}catch{console.error('Current installed observation receipt refused; no credentials or raw result printed.');process.exitCode=1;}
