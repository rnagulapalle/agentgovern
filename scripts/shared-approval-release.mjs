// Optional exact private attachment; does not grant the observation role writes.
import assert from 'node:assert/strict';
import {lstat,readFile,readlink,realpath} from 'node:fs/promises';
import {join} from 'node:path';
export const approvalTarget='/run/looplabs-approvals';
export function validateApprovalAttachment(source,rows){
 assert(/^\/srv\/looplabs-production\/config\/shared-approvals-[a-f0-9]{16}$/.test(source));assert(Array.isArray(rows)&&rows.length>=1&&rows.length<=2);
 const seen=new Set();for(const row of rows){
 assert.deepEqual(Object.keys(row).sort(),['allowSelfReview','connectionId','endpoint','epoch','resourceArn','reviewers','secretPath','tenantId','version'].sort());
 for(const name of ['tenantId','connectionId','epoch'])assert(typeof row[name]==='string'&&/^[A-Za-z0-9_.-]{1,128}$/.test(row[name]));
 const quote='arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/quote_agent_demo_20261015-P3t39c2UvD',cancellation='arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/acme_product_cancellation-OXtwF22hKd';assert([quote,cancellation].includes(row.resourceArn));const identity=row.resourceArn;assert(!seen.has(identity));seen.add(identity);
 assert(/^[1-9][0-9]*$/.test(row.version));assert.equal(row.secretPath,approvalTarget+(row.resourceArn===quote?'/signing.hex':'/cancellation-signing.hex'));assert(typeof row.allowSelfReview==='boolean');assert(Array.isArray(row.reviewers)&&row.reviewers.length===1&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.reviewers[0]));
 const u=new URL(row.endpoint);assert.equal(u.protocol,'https:');assert(!u.username&&!u.password&&!u.port&&!u.search&&!u.hash);assert(/^[a-z0-9]+\.execute-api\.us-west-2\.amazonaws\.com$/.test(u.hostname));assert.equal(u.pathname,'/looplabs/approval-bridge');
 }
 return {source,target:approvalTarget,environment:JSON.stringify(rows)};
}
async function readApprovalDirectory(source){
 assert(/^\/srv\/looplabs-production\/config\/shared-approvals-[a-f0-9]{16}$/.test(source));
 const st=await lstat(source);assert(st.isDirectory()&&!st.isSymbolicLink()&&st.uid===1001&&(st.mode&0o777)===0o700);assert.equal(await realpath(source),source);
 async function file(name){const p=join(source,name),s=await lstat(p);assert(s.isFile()&&!s.isSymbolicLink()&&s.nlink===1&&s.uid===1001&&(s.mode&0o777)===0o600&&s.size<16384);assert.equal(await realpath(p),p);return readFile(p,'utf8');}
 const rows=JSON.parse(await file('bindings.json'));const result=validateApprovalAttachment(source,rows);for(const row of rows)assert(/^[a-f0-9]{64,128}\s*$/.test(await file(row.secretPath.slice(approvalTarget.length+1))));return result;
}
export async function readApprovalAttachment(){
 const pointer='/srv/looplabs-production/config/shared-approvals-current';let link;try{link=await lstat(pointer);}catch(e){if(e.code==='ENOENT')return null;throw e;}
 assert(link.isSymbolicLink()&&link.uid===1001);return readApprovalDirectory(await readlink(pointer));
}
export async function readInstalledApprovalAttachment(mounts,readDirectory=readApprovalDirectory){
 assert(Array.isArray(mounts));const found=mounts.filter(m=>m.Destination===approvalTarget);assert(found.length<=1,'Ambiguous installed approval mount');if(!found.length)return null;
 const source=found[0].Source;assert(/^\/srv\/looplabs-production\/config\/shared-approvals-[a-f0-9]{16}$/.test(source));
 const attachment=await readDirectory(source);assert.equal(attachment.source,source);approvalVolume(attachment);withoutApprovalMount(mounts,attachment);return attachment;
}
export function approvalVolume(a){assert(a?.target===approvalTarget);validateApprovalAttachment(a.source,JSON.parse(a.environment));return {type:'bind',source:a.source,target:a.target,read_only:true,bind:{create_host_path:false,propagation:'rprivate'}};}
export function approvalEnvironment(environment,attachment){if(!attachment)return environment;approvalVolume(attachment);return {...environment,LOOPLABS_EXTERNAL_APPROVAL_BRIDGES:attachment.environment};}
export function withoutApprovalMount(value,attachment,host=false){
 const out=structuredClone(value),rows=host?(out.Mounts??[]):out,field=host?'Target':'Destination';if(host)assert(!out.Binds?.some(x=>x.split(':')[1]===approvalTarget));
 const found=rows.filter(m=>m[field]===approvalTarget);assert.equal(found.length,attachment?1:0);
 for(const m of found){assert.equal(m.Type,'bind');assert.equal(m.Source,attachment.source);assert.equal(host?m.ReadOnly:!m.RW,true);assert.equal(host?m.BindOptions?.Propagation:m.Propagation,'rprivate');if(host)assert.deepEqual(Object.keys(m).filter(k=>k!=='Consistency').sort(),['BindOptions','ReadOnly','Source','Target','Type']);}
 const rest=rows.filter(m=>m[field]!==approvalTarget);if(!host)return rest;if(rest.length)out.Mounts=rest;else delete out.Mounts;return out;
}
