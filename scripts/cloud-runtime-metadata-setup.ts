import { Pool } from "pg";
import { installCloudRuntimeMetadata } from "../lib/workspace/cloud-runtime-metadata-migration";
async function main(){
 const url=process.env.LOOPLABS_MIGRATION_DATABASE_URL;
 if(!url)throw Error("Separate inventory table-owner database URL required.");
 const db=new Pool({connectionString:url,max:1}),c=await db.connect();
 try {console.log(JSON.stringify(await installCloudRuntimeMetadata(c)));} finally {c.release();await db.end();}
}
main().catch(()=>{console.error("Runtime metadata storage upgrade failed; no completion confirmed.");process.exitCode=1;});
