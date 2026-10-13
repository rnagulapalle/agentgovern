// Authenticated current artifact transfer. No caller-provided redirect/download URL.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,open,lstat,realpath,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {Transform,Writable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const installedArtifactZipLimit2=8*1024**3+2*1024**2+65536;
export async function ownedInstalledInput2(path,limit){
 assert(typeof path==='string'&&resolve(path)===path&&await realpath(path)===path);const before=await lstat(path);assert(before.isFile()&&!before.isSymbolicLink()&&before.uid===process.getuid()&&before.nlink===1&&(before.mode&0o7777)===0o600&&before.size>0&&before.size<=limit);const bytes=await readFile(path),after=await lstat(path);for(const key of ['dev','ino','uid','nlink','size','mode','mtimeMs','ctimeMs'])assert.equal(before[key],after[key]);assert.equal(bytes.length,before.size);return bytes;
}
export async function extractInstalledArtifact2(archive,destination){
 assert(resolve(archive)===archive&&resolve(destination)===destination);
 execFileSync('python3',[fileURLToPath(new URL('./staging-installed-artifact-extract.py',import.meta.url)),archive,destination],{timeout:600000,maxBuffer:65536,stdio:['ignore','pipe','pipe']});
}
// Metadata comes only from authenticated API in the production caller. Test
// validators remain separate from this hardwired transport and confer no keys.
export async function downloadInstalledArtifact2(artifact,directory){
 assert(Number.isSafeInteger(artifact?.id)&&artifact.id>0);assert(/^sha256:[a-f0-9]{64}$/.test(artifact.digest));assert(artifact.expired===false);assert(Number.isSafeInteger(artifact.size_in_bytes)&&artifact.size_in_bytes>0&&artifact.size_in_bytes<=installedArtifactZipLimit2);
 assert(resolve(directory)===directory);await mkdir(directory,{mode:0o700});assert(await realpath(directory)===directory);const state=await lstat(directory);assert(state.uid===process.getuid()&&(state.mode&0o7777)===0o700);const archive=resolve(directory,'artifact.zip'),extracted=resolve(directory,'contents');await mkdir(extracted,{mode:0o700});const handle=await open(archive,'wx',0o600);let child,exit,timer,killTimer;
 try{
  const hash=createHash('sha256');let bytes=0;child=spawn('gh',['api',`repos/rnagulapalle/sandbox/actions/artifacts/${artifact.id}/zip`],{stdio:['ignore','pipe','pipe']});let errorBytes=0;child.stderr.on('data',chunk=>{errorBytes+=chunk.length;if(errorBytes>65536)child.kill('SIGTERM');});
  exit=new Promise((yes,no)=>{child.once('error',no);child.once('close',(code,signal)=>code===0&&!signal?yes():no(Error('Authenticated artifact transfer refused')));});exit.catch(()=>{});timer=setTimeout(()=>{child.kill('SIGTERM');killTimer=setTimeout(()=>child.kill('SIGKILL'),2500);},600000);
  const bounded=new Transform({transform(chunk,encoding,callback){bytes+=chunk.length;if(bytes>installedArtifactZipLimit2){callback(Error('Artifact byte limit exceeded'));return;}hash.update(chunk);callback(null,chunk);}});
  const output=new Writable({write(chunk,encoding,callback){(async()=>{let offset=0;while(offset<chunk.length){const result=await handle.write(chunk,offset,chunk.length-offset,null);assert(result.bytesWritten>0);offset+=result.bytesWritten;}})().then(()=>callback(),callback);}});
  await pipeline(child.stdout,bounded,output);await exit;assert.equal(bytes,artifact.size_in_bytes,'Authenticated artifact byte count mismatch');const digest='sha256:'+hash.digest('hex');assert.equal(digest,artifact.digest,'Authenticated artifact digest mismatch');await handle.close();
  await extractInstalledArtifact2(archive,extracted);await rm(archive);return {directory:extracted,downloadDigest:digest,downloadBytes:bytes};
 }catch(error){child?.kill('SIGTERM');if(child&&exit){killTimer=setTimeout(()=>child.kill('SIGKILL'),2500);await exit.catch(()=>{});}await handle.close().catch(()=>{});throw error;}finally{clearTimeout(timer);clearTimeout(killTimer);}
}
