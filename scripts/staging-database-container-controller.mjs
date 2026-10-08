import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {parseEnv} from "node:util";
import pg from "pg";
import {bootstrapDatabase} from "./staging-database-bootstrap.mjs";
import {stagingDatabase,migrationDigests} from "../runtime/temporal/staging-preflight.ts";
const dir="/run/private/installation",url=process.env.LOOPLABS_STAGING_OWNER_URL;
const first=await bootstrapDatabase(dir,url);
assert.equal(first.existingActions,0);assert.equal(first.existingRuns,0);
const credentials=await readFile(`${dir}/.env.local`,"utf8"),members=await readFile(`${dir}/.local/workspace-accounts.json`,"utf8");
const env=parseEnv(credentials),db=new pg.Pool({connectionString:env.LOOPLABS_DATABASE_URL});
try{
 assert.deepEqual(await stagingDatabase(db,await migrationDigests(),"local-proof",env.LOOPLABS_TEMPORAL_WORKER_TOKEN),[]);
 await assert.rejects(db.query("UPDATE ll_members SET active=false"),e=>e.code==="42501");
 const second=await bootstrapDatabase(dir,url);
 assert.deepEqual(second.migrations,first.migrations);
 assert.equal(await readFile(`${dir}/.env.local`,"utf8"),credentials);
 assert.equal(await readFile(`${dir}/.local/workspace-accounts.json`,"utf8"),members);
 assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_scopes")).rows[0].n,0);
 assert.equal((await db.query("SELECT count(*)::int n FROM ll_connector_scope_grants")).rows[0].n,0);
 console.log(JSON.stringify({passed:true,scope:"internal-network offline provisioner only",checks:["actual internal application-db service bootstrap","restricted runtime passes exact migration/workload/member inspection","member rewrite refused","repeat preserves authority and named-member credentials","no record grants or actions created"],migrations:first.migrations.map(m=>m.version)}));
}finally{await db.end();}
