// Exact source-byte inspection for proof preparation, never execution authority.
import {lstat,readFile,realpath} from 'node:fs/promises';
import {resolve,relative,isAbsolute} from 'node:path';
import {createHash} from 'node:crypto';
export class ProofSourceRefusal extends Error{
 constructor(readonly category:'source_path_invalid'|'source_link_refused'|'source_hash_invalid'|'source_bytes_changed'){super('Frozen proof source refused');}
}
export function assertProofSourcePath(file:unknown):asserts file is string{
 if(typeof file!=='string'||file.length<1||file.length>512||!/^[A-Za-z0-9_.\[\]/-]+$/.test(file)||isAbsolute(file)||file.split('/').some(s=>!s||s==='.'||s==='..'))throw new ProofSourceRefusal('source_path_invalid');
}
export async function verifyProofSource(file:unknown,sha:unknown,root:string){
 assertProofSourcePath(file);if(typeof sha!=='string'||!/^[a-f0-9]{64}$/.test(sha))throw new ProofSourceRefusal('source_hash_invalid');
 const canonicalRoot=await realpath(root),path=resolve(canonicalRoot,file),canonical=await realpath(path),relation=relative(canonicalRoot,canonical);
 if(isAbsolute(relation)||relation==='..'||relation.startsWith('../')||canonical!==path)throw new ProofSourceRefusal('source_link_refused');
 const before=await lstat(path,{bigint:true});if(!before.isFile()||before.isSymbolicLink()||before.size>64n*1024n*1024n)throw new ProofSourceRefusal('source_link_refused');
 const bytes=await readFile(path),after=await lstat(path,{bigint:true});
 if(before.dev!==after.dev||before.ino!==after.ino||before.size!==after.size||before.mtimeNs!==after.mtimeNs||before.ctimeNs!==after.ctimeNs||createHash('sha256').update(bytes).digest('hex')!==sha)throw new ProofSourceRefusal('source_bytes_changed');
}
export function sourceFailureCategory(error:unknown){return error instanceof ProofSourceRefusal?error.category:'proof_failed';}
