// No mutating SQL, approval API, secret output or database-owner credential.
import {readFile,writeFile,lstat} from "node:fs/promises";
import {parseEnv} from "node:util";
import assert from "node:assert/strict";
import pg from "pg";
import {readPendingPackageState} from "./staging-package-pending.mjs";
let db;
try{
 const mode=process.argv[2];assert(process.argv.length===3&&["baseline","compare"].includes(mode));
 const env=parseEnv(await readFile("/run/trial/worker.env","utf8"));
 const url=new URL(env.LOOPLABS_DATABASE_URL);assert(["postgres:","postgresql:"].includes(url.protocol)&&url.hostname==="application-db"&&url.pathname==="/looplabs_staging"&&url.username==="ll_runtime"&&url.password&&!url.search&&!url.hash,"Dedicated restricted staging connection required");
 const reference=JSON.parse(await readFile("/run/trial/restore-reference.json","utf8"));
 db=new pg.Pool({connectionString:env.LOOPLABS_DATABASE_URL,connectionTimeoutMillis:5000,query_timeout:10000});
 const snapshot=await readPendingPackageState(db,reference,env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID);
 const path="/run/trial/package-pending-baseline.json";
 if(mode==="baseline")await writeFile(path,JSON.stringify(snapshot),{mode:0o600,flag:"wx"});
 else{const state=await lstat(path);assert(state.isFile()&&!state.isSymbolicLink()&&state.uid===process.getuid()&&(state.mode&0o077)===0);const prior=JSON.parse(await readFile(path,"utf8"));assert(JSON.stringify(prior)===JSON.stringify(snapshot),"Saved authority changed during package transition");}
 console.log(JSON.stringify({passed:true,pendingAuthorityUnchanged:true}));
}catch{console.error("Pending package authority check refused; no credential, payload or raw database error printed.");process.exitCode=1;}
finally{await db?.end();}
