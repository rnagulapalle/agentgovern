import {execFile} from "node:child_process";
import {promisify} from "node:util";
import {readFile} from "node:fs/promises";
import {createHash,randomBytes} from "node:crypto";
import {Pool} from "pg";
import {it,expect} from "vitest";
const command=promisify(execFile);
it("applies migration 12 through the actual owner CLI idempotently and refuses changed prerequisites",async()=>{
 const url=process.env.LOOPLABS_TEST_DATABASE_URL;if(!url)throw Error("Dedicated PostgreSQL required.");
 const schema=`scope_setup_${randomBytes(8).toString("hex")}`,admin=new Pool({connectionString:url});let db:Pool|undefined;
 try{
  await admin.query(`CREATE SCHEMA ${schema}`);db=new Pool({connectionString:url,options:`-c search_path=${schema}`});
  const isolated=new URL(url);isolated.searchParams.set("options",`-c search_path=${schema}`);
  const env={...process.env,LOOPLABS_MIGRATION_DATABASE_URL:isolated.toString()},run=()=>command(process.execPath,["--import","tsx","scripts/record-scope-setup.ts"],{env});
  await expect(command(process.execPath,["--import","tsx","scripts/record-scope-setup.ts"],{env:{...env,LOOPLABS_MIGRATION_DATABASE_URL:""}})).rejects.toThrow("owner connection");
  await db.query("CREATE TABLE ll_migrations(version integer PRIMARY KEY,digest text NOT NULL)");await expect(run()).rejects.toThrow("prerequisite migration");
  for(const [version,file] of [[1,"lib/durable/schema.sql"],[3,"lib/workspace/schema.sql"],[2,"lib/refunds/schema.sql"],[4,"lib/connectors/schema.sql"],[5,"lib/workflows/schema.sql"],[11,"lib/durable/proposal-schema.sql"],[7,"lib/enquiries/schema.sql"],[8,"lib/enquiries/managed-schema.sql"],[9,"lib/enquiries/temporal-schema.sql"]] as const){const sql=await readFile(file,"utf8");await db.query(sql);await db.query("INSERT INTO ll_migrations(version,digest) VALUES($1,$2)",[version,createHash("sha256").update(sql).digest("hex")]);}
  await Promise.all([run(),run()]);await run();expect((await db.query("SELECT count(*)::int n FROM ll_migrations WHERE version=12")).rows[0].n).toBe(1);
  expect((await db.query("SELECT count(*)::int n FROM ll_connector_scopes")).rows[0].n).toBe(0);expect((await db.query("SELECT count(*)::int n FROM ll_connector_scope_grants")).rows[0].n).toBe(0);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=11");await expect(run()).rejects.toThrow("migration 11 changed");await db.query("UPDATE ll_migrations SET digest=$1 WHERE version=11",[createHash("sha256").update(await readFile("lib/durable/proposal-schema.sql")).digest("hex")]);
  await db.query("UPDATE ll_migrations SET digest='changed' WHERE version=12");await expect(run()).rejects.toThrow("migration 12 changed");
 }finally{await db?.end();await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);await admin.end();}
},20000);
