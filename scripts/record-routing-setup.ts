import {readFile} from "node:fs/promises";
import {createHash} from "node:crypto";
import {Pool} from "pg";
async function main(){
 const url=process.env.LOOPLABS_MIGRATION_DATABASE_URL;if(!url)throw Error("Separate migration-owner connection required.");
 const db=new Pool({connectionString:url}),c=await db.connect();
 try{
  await c.query("BEGIN");await c.query("SELECT pg_advisory_xact_lock(68391204)");
  const prerequisites=[[1,"lib/durable/schema.sql"],[2,"lib/refunds/schema.sql"],[3,"lib/workspace/schema.sql"],[4,"lib/connectors/schema.sql"],[5,"lib/workflows/schema.sql"],[7,"lib/enquiries/schema.sql"],[8,"lib/enquiries/managed-schema.sql"],[9,"lib/enquiries/temporal-schema.sql"],[11,"lib/durable/proposal-schema.sql"],[12,"lib/connectors/scope-schema.sql"]] as const;
  const applied=(await c.query("SELECT version,digest FROM ll_migrations")).rows;
  for(const [version,file] of prerequisites){const old=applied.find(r=>r.version===version);if(!old)throw Error(`Apply prerequisite migration ${version} first; no permission was granted.`);if(old.digest!==createHash("sha256").update(await readFile(file)).digest("hex"))throw Error(`Applied prerequisite migration ${version} changed.`);}
  const sql=await readFile("lib/enquiries/record-routing-schema.sql","utf8"),hash=createHash("sha256").update(sql).digest("hex"),old=applied.find(r=>r.version===13);
  if(old && old.digest!==hash)throw Error("Applied migration 13 changed.");
  if(!old){await c.query(sql);await c.query("INSERT INTO ll_migrations(version,digest) VALUES(13,$1)",[hash]);}
  if((await c.query("SELECT 1 FROM pg_roles WHERE rolname='ll_runtime'")).rows[0]){
   await c.query("GRANT SELECT,INSERT ON ll_temporal_record_routes TO ll_runtime");
  }
  await c.query("COMMIT");console.log("Migration 13 applied. No route created, ownership transferred, action approved or worker enabled.");
 }catch(e){await c.query("ROLLBACK");throw e;}finally{c.release();await db.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
