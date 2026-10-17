import { Pool } from "pg";
import { installCompanyDirectory } from "../lib/workspace/company-profile-migration";
async function main(){const url=process.env.LOOPLABS_MIGRATION_DATABASE_URL,role=process.env.LOOPLABS_MIGRATION_RUNTIME_ROLE,org=process.env.LOOPLABS_MIGRATION_WORKSPACE,name=process.env.LOOPLABS_COMPANY_NAME;
 if(!url||!role||!org||!name)throw Error("Separate migration owner, exact web role, workspace and company name required.");
 const pool=new Pool({connectionString:url}),c=await pool.connect();try{console.log(JSON.stringify(await installCompanyDirectory(c,role,org,name)));}finally{c.release();await pool.end();}}
main().catch(()=>{console.error('Company directory setup refused or failed. No completion confirmed.');process.exitCode=1;});
