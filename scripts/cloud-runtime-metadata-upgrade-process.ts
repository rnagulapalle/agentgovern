// One-shot owner process, never run by the web/worker and never reinstalls authority.
import assert from 'node:assert/strict';
import {Pool} from 'pg';
import {readOwnedPrivateFile,parseTenantInstallation} from '../lib/workspace/tenant-bootstrap';
import {scopedPoolOptions} from '../lib/durable/pg-transport';
import {installCloudRuntimeMetadata} from '../lib/workspace/cloud-runtime-metadata-migration';
async function main(){
 assert.equal(process.env.LOOPLABS_RUNTIME_METADATA_UPGRADE,'explicit-offline');assert.equal(process.platform,'linux');assert.equal(process.getuid?.(),1001);
 const ownerPath=process.env.LOOPLABS_RUNTIME_METADATA_OWNER_INPUT,webPath=process.env.LOOPLABS_RUNTIME_METADATA_WEB_CONFIG;
 assert(typeof ownerPath==='string');assert(typeof webPath==='string');
 assert(ownerPath.startsWith('/srv/looplabs-production/releases/')&&ownerPath.endsWith('/application/retained-owner-input.json'));
 assert(webPath.startsWith('/srv/looplabs-production/releases/')&&webPath.endsWith('/sealed-web/web.json'));
 const owner=await readOwnedPrivateFile(ownerPath,65536),web=await readOwnedPrivateFile(webPath,131072),input=JSON.parse(owner.bytes.toString()),config=parseTenantInstallation(JSON.parse(web.bytes.toString()));
 assert.equal(config.web.length,1);assert.equal(config.workloads.length,0);const role=config.web[0];assert.equal(role.org,config.salesOrg);
 const url=new URL(input.database.url),target=new URL(config.broker.url);assert.equal(url.username,'trial');assert.equal(url.pathname,target.pathname);assert(!url.search&&!url.hash);url.hostname=target.hostname;url.port=target.port;
 const db=new Pool(await scopedPoolOptions({url:url.href,schema:config.schema,purpose:'installer',transport:config.transport}));
 try{const client=await db.connect();try{await owner.assertStable();await web.assertStable();const result=await installCloudRuntimeMetadata(client,{role:role.role,org:role.org});await owner.assertStable();await web.assertStable();console.log(JSON.stringify({contract:'additive-cloud-runtime-metadata-upgrade-1',...result,schema:config.schema,org:role.org,ownerProcessRetained:false}));}finally{client.release();}}finally{await db.end();}
}
main().catch(()=>{console.error('Runtime metadata upgrade refused or failed; no completion receipt. Inspect the private one-shot owner diagnostics.');process.exitCode=1;});
