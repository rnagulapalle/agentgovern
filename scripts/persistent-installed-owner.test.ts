import {describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {validatePersistentMembers,validateInstalledAssemblyTarget} from './staging-installed-database-bootstrap';
import {passwordHash,passwordMatches} from '../lib/workspace/auth';
import {validateCurrentInspectedImage} from './staging-installed-publication';
const member=(email:string)=>({email,name:'Synthetic operator',passwordHash:passwordHash('synthetic-only-password')});
describe('trusted offline persistent member import',()=>{
 it('preserves exact existing hashes without minting/resetting passwords',()=>{const value=[member('requester@synthetic.example'),member('reviewer@synthetic.example')];const parsed=validatePersistentMembers(value);expect(parsed).toEqual(value);expect(passwordMatches('synthetic-only-password',parsed[0].passwordHash)).toBe(true);expect(Object.keys(parsed[0])).toEqual(['email','name','passwordHash']);});
 it('rejects duplicate, sample aliases, inactive/extra field, plaintext or malformed hashes',()=>{for(const change of [(v:ReturnType<typeof member>[])=>v.pop(),(v:ReturnType<typeof member>[])=>v[1]=v[0],(v:ReturnType<typeof member>[])=>v[0].email='requester@example.test',(v:ReturnType<typeof member>[])=>v[0].email=' UPPER@synthetic.example ',(v:ReturnType<typeof member>[])=>Object.assign(v[0],{active:false}),(v:ReturnType<typeof member>[])=>v[0].passwordHash='plaintext',(v:ReturnType<typeof member>[])=>v[0].name='',(v:ReturnType<typeof member>[])=>v[0].passwordHash='a'.repeat(32)+':'+ 'b'.repeat(127)]){const v=[member('requester@synthetic.example'),member('reviewer@synthetic.example')];change(v);expect(()=>validatePersistentMembers(v)).toThrow();}});
 it('refuses accessors without invoking a member credential getter',()=>{let reads=0;const m=member('requester@synthetic.example');Object.defineProperty(m,'passwordHash',{get(){reads++;return 'private';},enumerable:true});expect(()=>validatePersistentMembers([m,member('reviewer@synthetic.example')])).toThrow();expect(reads).toBe(0);});
 it('retention requires explicit complete imported members while old target contract stays unchanged',()=>{const base={url:'postgres://fixture:private@localhost/fixture',directory:'/private/fixture',transport:{mode:'verified-tls' as const,trust:'standard' as const}};expect(validateInstalledAssemblyTarget(base)).toEqual({database:'fixture'});expect(()=>validateInstalledAssemblyTarget({...base,retention:'retain-owned-installation',members:[]})).toThrow();expect(()=>validateInstalledAssemblyTarget({...base,members:[member('one@synthetic.example'),member('two@synthetic.example')]})).toThrow();expect(validateInstalledAssemblyTarget({...base,retention:'retain-owned-installation',members:[member('one@synthetic.example'),member('two@synthetic.example')]})).toEqual({database:'fixture'});});
});
describe('current profile facts remain independent source-owned callback consistency',()=>{
 it('explicit quote profile matches inspected bytes, never default ACK or mismatched source/hash',()=>{const construction='a'.repeat(64),imageId='sha256:'+'b'.repeat(64),raw={buildId:'quote-'+'c'.repeat(64),serviceHash:'d'.repeat(64),workflowHash:'e'.repeat(64),lockHash:'f'.repeat(64)},current={...raw,imageId,profile:'quote',constructionSha256:construction} as unknown as Parameters<typeof validateCurrentInspectedImage>[2];expect(()=>validateCurrentInspectedImage(imageId,construction,current,raw,'quote')).not.toThrow();expect(()=>validateCurrentInspectedImage(imageId,construction,current,raw)).toThrow();expect(()=>validateCurrentInspectedImage(imageId,construction,current,{...raw,workflowHash:randomUUID()},'quote')).toThrow();});
});
describe('sealed member-file boundary',()=>{
 it('rejects control characters without accepting alternate member authority',()=>{for(const field of ['email','name'] as const){const value=[member('requester@synthetic.example'),member('reviewer@synthetic.example')];value[0][field]+='\u0000';expect(()=>validatePersistentMembers(value)).toThrow();}});
});
it('reads only sealed regular private membership files and rejects world-readable or linked inputs',async()=>{
 const {mkdtemp,writeFile,chmod,symlink,rm,realpath}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {readPersistentMembers}=await import('./staging-installed-database-bootstrap');
 const directory=await realpath(await mkdtemp(join(tmpdir(),'ll-retained-member-'))),file=join(directory,'members.json'),value=[member('one@synthetic.example'),member('two@synthetic.example')];
 try{await writeFile(file,JSON.stringify(value),{mode:0o600});expect((await readPersistentMembers(file)).members).toEqual(value);await chmod(file,0o644);await expect(readPersistentMembers(file)).rejects.toThrow();await chmod(file,0o600);await symlink(file,join(directory,'linked.json'));await expect(readPersistentMembers(join(directory,'linked.json'))).rejects.toThrow();await writeFile(file,JSON.stringify({...value,extra:'not a member array'}));await expect(readPersistentMembers(file)).rejects.toThrow();}finally{await rm(directory,{recursive:true,force:true});}
});

it('accepts exact extracted profile metadata independent of key insertion order and rejects substitutions',async()=>{
 const {validatePersistentExtractedArtifacts}=await import('./persistent-installed-owner');
 const images={ack:'sha256:'+'a'.repeat(64),quote:'sha256:'+'b'.repeat(64)},root='/private/owned';
 const records=[{profile:'ack' as const,imageId:images.ack,directory:root+'/ack-artifact'},{directory:root+'/quote-artifact',imageId:images.quote,profile:'quote' as const}];
 expect(()=>validatePersistentExtractedArtifacts(root,records,images)).not.toThrow();
 for(const mutate of [(v:typeof records)=>Object.assign(v[0],{extra:true}),(v:typeof records)=>v[0].imageId=images.quote,(v:typeof records)=>v[0].directory='/private/other/ack-artifact',(v:typeof records)=>v[0].directory=root+'/../foreign',(v:typeof records)=>v[0].directory=root+'/ack-artifact/..',(v:typeof records)=>v[0].directory=root+'//ack-artifact',(v:typeof records)=>v[1].profile='ack']){const v=structuredClone(records);mutate(v);expect(()=>validatePersistentExtractedArtifacts(root,v,images)).toThrow();}
});

it('scoped cleanup attempts every close, rejects failed cleanup and preserves primary failure',async()=>{
 const {finishPersistentScopedCleanup}=await import('./persistent-installed-owner');
 const observed:string[]=[],first=new Error('first close failed'),second=new Error('second close failed'),primary=new Error('inspection failed');
 await expect(finishPersistentScopedCleanup([async()=>{observed.push('one');},async()=>{observed.push('two');}])).resolves.toBeUndefined();
 expect(observed).toEqual(['one','two']);observed.length=0;
 let error:unknown;try{await finishPersistentScopedCleanup([async()=>{observed.push('one');throw first;},()=>{observed.push('two');throw second;},async()=>{observed.push('three');}],{error:primary});}catch(value){error=value;}
 expect(observed).toEqual(['one','two','three']);expect(error).toBeInstanceOf(AggregateError);expect((error as AggregateError).errors).toEqual([primary,first,second]);
 await expect(finishPersistentScopedCleanup([async()=>{throw first;}])).rejects.toThrow('inspection not accepted');
 await expect(finishPersistentScopedCleanup([async()=>{}],{error:primary})).resolves.toBeUndefined();
});

it('offline enrollment marker is scoped and restored after success and failure, with other modes refused',async()=>{
 const {withPersistentOfflineEnrollment}=await import('./persistent-installed-owner');
 const oldOwner=process.env.LOOPLABS_RETAINED_INSTALLATION,oldDrain=process.env.LOOPLABS_STAGING_DRAIN_PROOF;
 const restore=(key:string,value:string|undefined)=>{if(value===undefined)delete process.env[key];else process.env[key]=value;};
 try{
  delete process.env.LOOPLABS_RETAINED_INSTALLATION;delete process.env.LOOPLABS_STAGING_DRAIN_PROOF;let calls=0;
  await expect(withPersistentOfflineEnrollment(async()=>{calls++;})).rejects.toThrow();expect(calls).toBe(0);expect(process.env.LOOPLABS_STAGING_DRAIN_PROOF).toBeUndefined();
  process.env.LOOPLABS_RETAINED_INSTALLATION='explicit-offline';
  for(const previous of [undefined,'isolated']){
   restore('LOOPLABS_STAGING_DRAIN_PROOF',previous);
   await expect(withPersistentOfflineEnrollment(async()=>{expect(process.env.LOOPLABS_STAGING_DRAIN_PROOF).toBe('isolated');return 'same enrollment';})).resolves.toBe('same enrollment');
   expect(process.env.LOOPLABS_STAGING_DRAIN_PROOF).toBe(previous);
   const failure=new Error('native admission refused');await expect(withPersistentOfflineEnrollment(async()=>{expect(process.env.LOOPLABS_STAGING_DRAIN_PROOF).toBe('isolated');throw failure;})).rejects.toBe(failure);
   expect(process.env.LOOPLABS_STAGING_DRAIN_PROOF).toBe(previous);
  }
  process.env.LOOPLABS_STAGING_DRAIN_PROOF='foreign';await expect(withPersistentOfflineEnrollment(async()=>{calls++;})).rejects.toThrow('Foreign enrollment mode refused');expect(calls).toBe(0);expect(process.env.LOOPLABS_STAGING_DRAIN_PROOF).toBe('foreign');
 }finally{restore('LOOPLABS_RETAINED_INSTALLATION',oldOwner);restore('LOOPLABS_STAGING_DRAIN_PROOF',oldDrain);}
});

it('cleanup stops only writer services declared by bootstrap or assembled topology and refuses missing base ownership',async()=>{
 const {persistentCleanupWriterServices}=await import('./persistent-installed-owner');
 const base=['application-db','temporal-db','temporal','authorization','web','temporal-worker','temporal-scheduler','connector-twin'];
 expect(persistentCleanupWriterServices(base)).toEqual(['web','temporal-worker','temporal-scheduler']);
 expect(persistentCleanupWriterServices([...base,'quote-worker','quote-scheduler','quote-twin','quote-email','offline-installer'])).toEqual(['web','temporal-worker','temporal-scheduler','quote-worker','quote-scheduler','quote-twin','quote-email']);
 expect(()=>persistentCleanupWriterServices(base.filter(name=>name!=='application-db'))).toThrow();expect(()=>persistentCleanupWriterServices([...base,'web'])).toThrow();
});
