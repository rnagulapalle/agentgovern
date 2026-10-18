// Private injected coordinator increment. No remote/config-selected verifier.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {buildCurrentAssemblyImage} from './staging-current-image-verifier.mjs';
import {bootstrapInstalledAssemblyDatabase} from './staging-installed-database-bootstrap.ts';
import {prepareInstalledAssemblyPublication} from './staging-installed-publication.ts';

/** Call only from the existing assembled job's source-owned preparation stage.
 * Source and TLS target originate from its pinned owned fixture constructor.
 * It prepares; it does not enroll, dispatch, export or declare trial success. */
export async function prepareCurrentInstalledAssembly(input){
 assert.deepEqual(Object.keys(input).sort(),['source','database'].sort());
 let image,installed,closed=false;
 const docker=(...args)=>{try{return execFileSync('docker',args,{cwd:input.source.sourceRoot,env:{PATH:process.env.PATH,HOME:process.env.HOME},encoding:'utf8',timeout:600000,maxBuffer:4*1024**2,stdio:['ignore','pipe','pipe']}).trim();}catch{throw Error('Owned image inspection refused.');}};
 const close=async()=>{
  assert(!closed);const results=await Promise.allSettled([...(installed?[installed.close()]:[]),...(image?[image.close()]:[])]);
  assert(results.every(r=>r.status==='fulfilled'),'Owned installation/image cleanup unconfirmed');closed=true;
 };
 try{
  image=await buildCurrentAssemblyImage(input.source);
  installed=await bootstrapInstalledAssemblyDatabase(input.database);
  const publication=await prepareInstalledAssemblyPublication({...installed,sourceRoot:input.source.sourceRoot,imageId:image.imageId,docker,verifyCurrentImage:image.verifyCurrentImage});
  assert.equal(publication.preparedOnly,true);assert.equal(publication.admissionEstablished,false);assert.equal(publication.releaseAccepted,false);
  return {publication,imageId:image.imageId,owner:installed.owner,named:installed.named,close,
   evidence:{contract:'same-job-installed-assembly-preparation-1',image:image.evidence,constructionSha256:publication.constructionSha256,namedMembersRechecked:true,verifiedTls:true,admissionEstablished:false,runtimeVerified:false,releaseAccepted:false}};
 }catch{
  try{await close();}catch{throw Error('Current installed assembly preparation refused; owned cleanup unconfirmed.');}
  throw Error('Current installed assembly preparation refused; no runtime or release acceptance.');
 }
}
