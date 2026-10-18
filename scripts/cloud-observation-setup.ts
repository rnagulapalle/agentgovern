import { Pool } from "pg";
import { installCloudObservation } from "../lib/workspace/cloud-observation-migration";
async function main(){
 const url=process.env.LOOPLABS_MIGRATION_DATABASE_URL;
 if(!url)throw Error();
 const pool=new Pool({connectionString:url,connectionTimeoutMillis:5000,query_timeout:10000});
 try{const client=await pool.connect();try{console.log(JSON.stringify(await installCloudObservation(client,process.env.LOOPLABS_MIGRATION_RUNTIME_ROLE||"ll_runtime",process.env.LOOPLABS_MIGRATION_WORKSPACE)));}finally{client.release();}}finally{await pool.end();}
}
main().catch(()=>{console.error("AWS observation setup refused or failed. No completion confirmed; inspect private migration diagnostics.");process.exitCode=1;});
