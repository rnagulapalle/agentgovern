/** Server-only bounded owned publication reader. No file bytes or paths appear in errors.
 * Namespace checks detect replacement; they do not establish protection against a
 * privileged owner who can mutate and restore a publication between observations. */
import {constants,type Stats} from 'node:fs';
import {lstat,open,realpath} from 'node:fs/promises';
import {dirname,resolve,parse} from 'node:path';
const refuse=()=>new Error('Owned private publication unavailable.');
const fields=['dev','ino','uid','mode','nlink','size','mtimeMs','ctimeMs'] as const;
const same=(a:Stats,b:Stats)=>fields.every(k=>a[k]===b[k]);
const directorySame=(a:Stats,b:Stats)=>a.isDirectory()&&b.isDirectory()&&['dev','ino','uid','mode'].every(k=>a[k as keyof Stats]===b[k as keyof Stats]);
function regular(s:Stats,uid:number,limit:number){return s.isFile()&&s.nlink===1&&s.uid===uid&&(s.mode&0o7777)===0o600&&Number.isSafeInteger(s.size)&&s.size>=0&&s.size<=limit;}
export async function readOwnedPrivateFile(file:string,limit:number){
 let handle:Awaited<ReturnType<typeof open>>|undefined;
 try{
  if(typeof window!=='undefined'||typeof file!=='string'||!file||file.includes('\0')||!Number.isSafeInteger(limit)||limit<1||limit>1048576||typeof process.getuid!=='function')throw refuse();
  const uid=process.getuid(),path=resolve(file),parent=dirname(path),ancestors=new Map<string,Stats>();
  for(let p=parent;;p=dirname(p)){const s=await lstat(p);if(!s.isDirectory()||s.isSymbolicLink())throw refuse();ancestors.set(p,s);if(p===parse(p).root)break;}
  const directory=ancestors.get(parent)!;if(directory.uid!==uid||(directory.mode&0o7777)!==0o700||await realpath(path)!==path)throw refuse();
  const named=await lstat(path);if(!regular(named,uid,limit))throw refuse();
  handle=await open(path,constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  const stat=await handle.stat();if(!regular(stat,uid,limit)||!same(named,stat))throw refuse();
  // An extra byte detects growth; allocation and total FD reads can never exceed
  // the validated original length + 1, even if another process keeps appending.
  const buffer=Buffer.alloc(stat.size+1);let size=0;
  while(size<buffer.length){const next=await handle.read(buffer,size,buffer.length-size,size);if(!next.bytesRead)break;size+=next.bytesRead;}
  if(size!==stat.size||!same(stat,await handle.stat()))throw refuse();
  const assertStable=async()=>{try{
   for(const [p,s]of ancestors){const now=await lstat(p);if(now.isSymbolicLink()||!directorySame(s,now))throw refuse();}
   if(await realpath(path)!==path||!same(stat,await lstat(path)))throw refuse();
  }catch{throw refuse();}};
  await assertStable();return {bytes:buffer.subarray(0,size),assertStable};
 }catch{throw refuse();}finally{try{await handle?.close();}catch{throw refuse();}}
}
