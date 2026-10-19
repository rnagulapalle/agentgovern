import {describe,it,expect} from 'vitest';
import {validateApprovalAttachment,approvalVolume,approvalEnvironment,withoutApprovalMount,readInstalledApprovalAttachment} from './shared-approval-release.mjs';
const source='/srv/looplabs-production/config/shared-approvals-'+'a'.repeat(16),row={tenantId:'org1',connectionId:'connection1',epoch:'epoch1',resourceArn:'arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/quote_agent_demo_20261015-P3t39c2UvD',version:'15',endpoint:'https://abc.execute-api.us-west-2.amazonaws.com/looplabs/approval-bridge',secretPath:'/run/looplabs-approvals/signing.hex',reviewers:['raj@example.test'],allowSelfReview:true};
describe('exact shared approval release attachment',()=>{
 it('adds only the reviewed binding metadata and read-only private directory',()=>{const a=validateApprovalAttachment(source,[row]);expect(approvalEnvironment({TOKEN:'retained'},a)).toEqual({TOKEN:'retained',LOOPLABS_EXTERNAL_APPROVAL_BRIDGES:JSON.stringify([row])});expect(approvalVolume(a)).toEqual({type:'bind',source,target:'/run/looplabs-approvals',read_only:true,bind:{create_host_path:false,propagation:'rprivate'}});expect(approvalEnvironment({TOKEN:'retained'},null)).toEqual({TOKEN:'retained'});});
 it('rejects other runtimes, arbitrary endpoints, unreviewed fields and implicit demo authority',()=>{for(const patch of [{resourceArn:row.resourceArn+'other'},{endpoint:'https://evil.test/looplabs/approval-bridge'},{endpoint:row.endpoint+'?key=x'},{secretPath:'/tmp/key'},{allowSelfReview:'true'},{version:'LATEST'},{reviewers:[]},{newPermission:true}])expect(()=>validateApprovalAttachment(source,[{...row,...patch}])).toThrow();expect(()=>validateApprovalAttachment('/tmp/app',[row])).toThrow();expect(()=>validateApprovalAttachment(source,[row,row])).toThrow();});
 it('removes only the exact validated private mount before existing complete host comparison',()=>{const a=validateApprovalAttachment(source,[row]),other={Type:'bind',Source:'/safe',Destination:'/other',RW:false,Propagation:'rprivate'},mount={Type:'bind',Source:source,Destination:a.target,RW:false,Propagation:'rprivate'};expect(withoutApprovalMount([other,mount],a)).toEqual([other]);expect(withoutApprovalMount([other],null)).toEqual([other]);for(const patch of [{Source:'/wrong'},{RW:true},{Propagation:'rshared'}])expect(()=>withoutApprovalMount([other,{...mount,...patch}],a)).toThrow();expect(()=>withoutApprovalMount([mount],null)).toThrow();expect(()=>withoutApprovalMount([mount,mount],a)).toThrow();const host={Memory:1024,ReadonlyRootfs:true,Mounts:[{Type:'bind',Source:source,Target:a.target,ReadOnly:true,BindOptions:{Propagation:'rprivate'}}]};expect(withoutApprovalMount(host,a,true)).toEqual({Memory:1024,ReadonlyRootfs:true});expect(()=>withoutApprovalMount({...host,Binds:[source+':'+a.target+':rw']},a,true)).toThrow();});
});

describe('installed approval attachment replacement',()=>{
 const old=validateApprovalAttachment(source,[row]),nextSource='/srv/looplabs-production/config/shared-approvals-'+'b'.repeat(16),next=validateApprovalAttachment(nextSource,[{...row,version:'18'}]);
 const mount={Type:'bind',Source:source,Destination:old.target,RW:false,Propagation:'rprivate'};
 it('keeps the observed v15 mount and environment for rollback while selecting a separate v18 attachment',async()=>{
  const read=async path=>{expect(path).toBe(source);return old;};const installed=await readInstalledApprovalAttachment([mount],read);
  expect(installed).toEqual(old);expect(installed.source).not.toBe(next.source);
  expect(JSON.parse(approvalEnvironment({},installed).LOOPLABS_EXTERNAL_APPROVAL_BRIDGES)[0].version).toBe('15');
  expect(JSON.parse(approvalEnvironment({},next).LOOPLABS_EXTERNAL_APPROVAL_BRIDGES)[0].version).toBe('18');
  expect(()=>withoutApprovalMount([mount],installed)).not.toThrow();expect(()=>withoutApprovalMount([mount],next)).toThrow();
  const host={ReadonlyRootfs:true,Mounts:[{Type:'bind',Source:source,Target:old.target,ReadOnly:true,BindOptions:{Propagation:'rprivate'}}]};expect(withoutApprovalMount(host,installed,true)).toEqual({ReadonlyRootfs:true});expect(()=>withoutApprovalMount(host,next,true)).toThrow();
 });
 it('refuses ambiguous, writable, propagated or foreign installed mounts',async()=>{
  for(const mounts of [[mount,mount],[{...mount,Source:'/tmp/unreviewed'}],[{...mount,RW:true}],[{...mount,Propagation:'rshared'}],[{...mount,Type:'volume'}]])await expect(readInstalledApprovalAttachment(mounts,async()=>old)).rejects.toThrow();
  await expect(readInstalledApprovalAttachment([mount],async()=>next)).rejects.toThrow();
 });
 it('does not read absent attachments and propagates protected-directory verification failures',async()=>{
  const read=async()=>{throw Error('private directory verification refused');};expect(await readInstalledApprovalAttachment([],read)).toBeNull();await expect(readInstalledApprovalAttachment([mount],read)).rejects.toThrow('private directory verification refused');
 });
});
