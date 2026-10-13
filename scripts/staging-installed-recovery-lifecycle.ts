// Source-owned offline lifecycle of the existing assembled trial. No HTTP route,
// automatic member reactivation, workload token replacement or release authority.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import type {Pool} from 'pg';
import {captureExistingRecoveryIdentity,recoverExistingTenantInstallation} from '../lib/workspace/tenant-installer';
import {readTenantInstallation,readOwnerWorkloadInventory,readPublishedWebGeneration,readWorkloadInstallation} from '../lib/workspace/tenant-bootstrap';
import {inspectQuoteRecoveryInventory} from '../lib/workspace/quote-recovery-inventory';
import {scopedMigrations} from '../runtime/temporal/staging-preflight';
import {digestOwnedPrivateArchive} from './staging-image-artifact.mjs';
import {quarantineRestore} from '../lib/durable/recovery';
import {attachInstalledRuntime} from './staging-installed-runtime-attachment';
type Target=Parameters<typeof captureExistingRecoveryIdentity>[1];
type Settings=Parameters<typeof attachInstalledRuntime>[1];
export async function reviewedInstalledAssemblyRecoveryInventory(owner:Pick<Pool,'query'>,target:Readonly<Target>){
 // Exact source reviewed prerequisites, never target-inferred admission.
 const base=await Promise.all([...scopedMigrations,[14,'lib/enquiries/worker-admission-schema.sql'],[15,'lib/enquiries/reset-intent-schema.sql'],[16,'lib/workspace/cloud-inventory-schema.sql'],[17,'lib/workspace/cloud-project-schema.sql'],[18,'lib/workspace/cloud-owner-review-schema.sql']] .map(async([version,file])=>({version:Number(version),digest:createHash('sha256').update(await readFile(String(file))).digest('hex')})));
 await inspectQuoteRecoveryInventory(owner,target.schema,base);
}
export async function captureInstalledAssemblyRecovery(input:{ownerUrl:string;target:Target;generation:string;captureFile:string;quoteWorkloads:readonly string[]}){
 assert.deepEqual(Object.keys(input).sort(),['ownerUrl','target','generation','captureFile','quoteWorkloads'].sort());
 return captureExistingRecoveryIdentity(input.ownerUrl,input.target,input.generation,input.captureFile,reviewedInstalledAssemblyRecoveryInventory,undefined,input.quoteWorkloads);
}
export async function recoverInstalledAssemblyRuntime(input:{owner:Pool;ownerUrl:string;target:Target;originalDirectory:string;identityFile:string;identitySha256:string;archiveFile:string;restoredSchemaOid:string;ownerOutput:string;runtimeOutput:string;settings:Settings}){
 assert.deepEqual(Object.keys(input).sort(),['owner','ownerUrl','target','originalDirectory','identityFile','identitySha256','archiveFile','restoredSchemaOid','ownerOutput','runtimeOutput','settings'].sort());
 const archive=await digestOwnedPrivateArchive(input.archiveFile);assert.equal(archive.header,'PGDMP');const archiveSha256=archive.sha256;
 const current=(await input.owner.query('SELECT oid::text oid FROM pg_namespace WHERE nspname=$1',[input.target.schema])).rows[0];assert.equal(current?.oid,input.restoredSchemaOid);
 const original=await readTenantInstallation(join(input.originalDirectory,'web.json'));
 assert.notEqual(input.target.tenants[0].epoch,original.web[0].epoch);
 // Offline quarantine retains reservations/effects and invalidates restored
 // approvals, sessions, member/agent identities and record grants. Replay idempotent.
 await quarantineRestore(input.owner,input.target.tenants[0].org,input.target.tenants[0].epoch,archiveSha256);
 // Repeat the exact quarantine authority operation; it must preserve the same
 // event and contained state rather than reviving or duplicating authority.
 await quarantineRestore(input.owner,input.target.tenants[0].org,input.target.tenants[0].epoch,archiveSha256);
 await archive.assertStable();
 const recovered=await recoverExistingTenantInstallation(input.ownerUrl,input.target,{originalDirectory:input.originalDirectory,identityFile:input.identityFile,identitySha256:input.identitySha256,restoredSchemaOid:input.restoredSchemaOid,archiveSha256,acknowledgement:'WRITERS_STOPPED_AND_EPOCH_ROTATED'},input.ownerOutput,reviewedInstalledAssemblyRecoveryInventory);
 assert.equal(recovered.activated,false);
 // Publish each process separately from the owner inventory. Copy exact immutable
 // bytes only: no config mutation to pretend old credentials are a new epoch.
 await mkdir(input.runtimeOutput,{mode:0o700});const webDirectory=join(input.runtimeOutput,'web');await mkdir(webDirectory,{mode:0o700});
 for(const name of ['web.json','ready.json'])await copyFile(join(input.ownerOutput,name),join(webDirectory,name));
 const webFile=join(webDirectory,'web.json'),web=await readPublishedWebGeneration(webFile),workloads=await readOwnerWorkloadInventory(join(input.ownerOutput,'workloads.json'));
 const files={webFile,workerFile:'',schedulerFile:''};
 for(const purpose of ['worker','scheduler'] as const){const entry=workloads.config.entries.find(e=>e.purpose===purpose);assert(entry);const file=join(input.ownerOutput,'runtime',entry.role,'workloads.json'),read=await readWorkloadInstallation(file);assert.equal(read.config.entries[0].epoch,input.target.tenants[0].epoch);assert.equal(read.config.entries[0].purpose,purpose);await read.assertStable();files[purpose==='worker'?'workerFile':'schedulerFile']=file;}
 await attachInstalledRuntime(files,input.settings,join(input.runtimeOutput,'attached'));
 await web.assertStable();await workloads.assertStable();await archive.assertStable();
 const quoteFiles:Partial<Record<'workerFile'|'schedulerFile',string>>={};
 for(const e of recovered.supplementalRoles){assert.equal(e.org,input.target.tenants[0].org);assert(['worker','scheduler'].includes(e.purpose));const key=e.purpose==='worker'?'workerFile':'schedulerFile';assert(!quoteFiles[key]);const file=join(input.ownerOutput,'runtime',e.role,'workloads.json'),read=await readWorkloadInstallation(file);assert.equal(read.config.entries[0].role,e.role);assert.equal(read.config.entries[0].epoch,input.target.tenants[0].epoch);await read.assertStable();quoteFiles[key]=file;}
 assert(recovered.supplementalRoles.length===0||recovered.supplementalRoles.length===2&&quoteFiles.workerFile&&quoteFiles.schedulerFile,'One complete quote purpose pair required');
 return {recovered,files,quoteFiles,archiveSha256,archiveBytes:archive.bytes,restoredSchemaOid:input.restoredSchemaOid,restoredAuthorityReactivated:false as const,releaseAccepted:false as const};
}
