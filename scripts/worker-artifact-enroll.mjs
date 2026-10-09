// Owner-only offline opt-in. Never executes a worker, creates a route or grants approval.
import {execFileSync} from "node:child_process";
import {Pool} from "pg";
import {enrollInspectedWorker} from "./worker-artifact-enrollment.mjs";
let db;
try{
 if(!process.env.LOOPLABS_MIGRATION_DATABASE_URL||process.argv.length!==3)throw Error('Explicit owner connection and immutable image required');
 db=new Pool({connectionString:process.env.LOOPLABS_MIGRATION_DATABASE_URL});
 const docker=(...args)=>execFileSync('docker',args,{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}).trim();
 const result=await enrollInspectedWorker(db,process.argv[2],docker);
 console.log(JSON.stringify({enrolled:true,...result,executionAuthorized:false}));
}catch{console.error('Worker artifact enrollment refused; no raw Docker output, database details or credentials printed.');process.exitCode=1;}
finally{await db?.end();}
