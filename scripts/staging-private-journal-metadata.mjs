import {lstat} from 'node:fs/promises';
import {dirname} from 'node:path';
/** Failure diagnostics only: no path, file bytes, exception message or secret. */
export async function privateJournalMetadata(file){
 const observe=async path=>{try{
  const s=await lstat(path);
  return {present:true,type:s.isSymbolicLink()?'symlink':s.isFile()?'file':s.isDirectory()?'directory':'special',uid:s.uid,mode:s.mode&0o7777,links:s.nlink,size:s.size};
 }catch(error){return {present:false,error:['ENOENT','EACCES','EPERM','ENOTDIR','ELOOP'].includes(error?.code)?error.code:'unavailable'};}};
 return {version:1,processUid:typeof process.getuid==='function'?process.getuid():null,journal:await observe(file),parent:await observe(dirname(file))};
}
/** Preserve the exact failing strict read; writing diagnostics cannot promote
 * the absent/malformed journal or replace its original error. */
export async function readJournalWithFailureMetadata(file,read,record){
 try{return await read(file);}catch(error){try{await record(await privateJournalMetadata(file));}catch{}throw error;}
}

import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {readOwnedPrivateFile} from '../lib/workspace/owned-private-file.ts';
/** Fixed allowlist: metadata only, never retain journal bytes or paths. */
export function validatePrivateJournalMetadata(value){
 const keys=(v,k)=>{assert(v&&typeof v==='object'&&!Array.isArray(v));assert.deepEqual(Object.keys(v).sort(),k.sort());};
 keys(value,['version','processUid','journal','parent']);assert.equal(value.version,1);assert(value.processUid===null||Number.isSafeInteger(value.processUid)&&value.processUid>=0);
 for(const item of [value.journal,value.parent]){
  if(item?.present===false){keys(item,['present','error']);assert(['ENOENT','EACCES','EPERM','ENOTDIR','ELOOP','unavailable'].includes(item.error));}
  else{keys(item,['present','type','uid','mode','links','size']);assert.equal(item.present,true);assert(['symlink','file','directory','special'].includes(item.type));for(const k of ['uid','mode','links','size'])assert(Number.isSafeInteger(item[k])&&item[k]>=0);assert(item.mode<=0o7777);}
 }
 return value;
}
export async function retainPrivateJournalDiagnostic(application,evidenceDirectory){
 const name='observer-private-journal-diagnostic.json',file=join(application,name);
 try{await lstat(file);}catch(error){if(error.code==='ENOENT')return false;throw Error('Private metadata retention unavailable');}
 const raw=await readOwnedPrivateFile(file,8192);const value=validatePrivateJournalMetadata(JSON.parse(raw.bytes.toString('utf8')));await raw.assertStable();
 await writeFile(join(evidenceDirectory,name),JSON.stringify(value)+'\n',{mode:0o600,flag:'wx'});return true;
}
