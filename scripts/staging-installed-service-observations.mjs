// Sanitized Docker observations: never serializes environment, mounts or keys.
import assert from 'node:assert/strict';
export const installedServiceRoles2=Object.freeze(['web','application-db','temporal-db','temporal','temporal-worker','temporal-scheduler','connector-twin','authorization','quote-worker','quote-scheduler','quote-twin','quote-email','offline-installer']);
export function installedServiceObservations2(inspection,identities,project){
 assert(typeof project==='string'&&/^[a-z0-9][a-z0-9_-]{0,100}$/.test(project));
 assert.deepEqual(Object.keys(identities),installedServiceRoles2);assert.equal(inspection.length,13);assert.equal(new Set(inspection.map(c=>c.Id)).size,13);
 assert.equal(new Set(Object.values(identities)).size,13);
 return installedServiceRoles2.map(role=>{const id=identities[role];assert(/^[a-f0-9]{64}$/.test(id));const matches=inspection.filter(c=>c.Id===id);assert.equal(matches.length,1);const c=matches[0];assert.equal(c.Config.Labels?.['looplabs.assembly.owner'],project);if(role!=='offline-installer'){assert.equal(c.Config.Labels?.['com.docker.compose.project'],project);assert.equal(c.Config.Labels?.['com.docker.compose.service'],role);}assert(/^sha256:[a-f0-9]{64}$/.test(c.Image));assert(Number.isSafeInteger(c.HostConfig.Memory)&&c.HostConfig.Memory>0);assert(Number.isSafeInteger(c.HostConfig.PidsLimit)&&c.HostConfig.PidsLimit>0);assert.equal(typeof c.HostConfig.ReadonlyRootfs,'boolean');const health=c.State.Health?.Status??'not-configured';assert(['healthy','not-configured'].includes(health));return {role,containerId:id,imageId:c.Image,memoryBytes:c.HostConfig.Memory,readOnly:c.HostConfig.ReadonlyRootfs,pids:c.HostConfig.PidsLimit,health};});
}
