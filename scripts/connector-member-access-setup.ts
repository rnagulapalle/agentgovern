// Explicit offline owner command only. No runtime route provisions permissions.
import {Pool} from 'pg';
import {readOwnedPrivateFile} from '../lib/workspace/tenant-bootstrap';
import {installConnectorMemberAccess} from '../lib/workspace/connector-member-access-migration';
async function main(){
 if(process.env.LOOPLABS_MEMBER_ACCESS_SETUP!=='explicit-offline')throw Error('Explicit offline owner setup required.');
 const url=process.env.LOOPLABS_MIGRATION_DATABASE_URL,org=process.env.LOOPLABS_MIGRATION_WORKSPACE,file=process.env.LOOPLABS_MEMBER_ACCESS_INPUT;
 if(!url||!org||!/^[-a-zA-Z0-9_]{1,64}$/.test(org)||!file)throw Error('Exact private owner target and input required.');
 const input=await readOwnedPrivateFile(file,131072),value=JSON.parse(input.bytes.toString('utf8')),pool=new Pool({connectionString:url});
 try{await input.assertStable();const receipt=await installConnectorMemberAccess(pool,org,value);await input.assertStable();console.log(JSON.stringify({...receipt,accountsCreated:0,agentsCreated:0,providerEffects:0,awsResourcesCreated:0}));}finally{await pool.end();}
}
main().catch(()=>{console.error('Member authority setup refused or failed. No successful completion receipt.');process.exitCode=1;});
