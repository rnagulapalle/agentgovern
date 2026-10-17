import { Pool } from "pg";
import { installCloudRuntimeMetadata } from "../lib/workspace/cloud-runtime-metadata-migration";
async function main(){
 const url=process.env.LOOPLABS_MIGRATION_DATABASE_URL,role=process.env.LOOPLABS_MIGRATION_RUNTIME_ROLE,org=process.env.LOOPLABS_MIGRATION_WORKSPACE;
 if(!url||!role||!org)throw Error("Separate inventory table owner, exact existing web role and workspace required.");
 const db=new Pool({connectionString:url,max:1}),c=await db.connect();
 try {console.log(JSON.stringify(await installCloudRuntimeMetadata(c,{role,org})));} finally {c.release();await db.end();}
}
main().catch(()=>{console.error("Runtime metadata storage upgrade failed; no completion confirmed.");process.exitCode=1;});
