import {Pool} from "pg";
import {migrationDigests,stagingConfiguration,stagingDatabase} from "../runtime/temporal/staging-preflight";
async function main(){
 const blockers=stagingConfiguration(process.env);
 if(!process.env.LOOPLABS_DATABASE_URL)blockers.push("runtime_database_configuration_missing");
 else{
  const db=new Pool({connectionString:process.env.LOOPLABS_DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
  try{blockers.push(...await stagingDatabase(db,await migrationDigests(),process.env.LOOPLABS_WORKSPACE_ID||"",process.env.LOOPLABS_TEMPORAL_WORKER_TOKEN||"",process.env.LOOPLABS_RECOVERY_EPOCH));}
  catch(error){blockers.push((error as {code?:string}).code==="42501"?"runtime_database_inspection_denied":"runtime_database_inspection_unavailable");}finally{await db.end();}
 }
 console.log(JSON.stringify({scope:"read-only staging prerequisites",prerequisitesPassed:blockers.length===0,blockers,notVerified:["packaged artifact integrity","Temporal namespace authorization and compatible pollers","provider availability and enrolled-record consistency","remote fault, restore, rotation and alert drills","production release and ownership cutover"]},null,2));
 if(blockers.length)process.exitCode=1;
}
main().catch(()=>{console.error("Staging prerequisite inspection failed. No rollout was performed.");process.exitCode=1;});
