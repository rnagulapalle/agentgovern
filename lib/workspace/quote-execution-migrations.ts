/** Offline additive installation only. This never enrolls, approves or executes work. */
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import type {Pool} from 'pg';
import {scopedMigrations} from '../../runtime/temporal/staging-preflight';

export const quoteExecutionMigrations = [
 [25,'lib/connectors/quote-action-schema.sql'],
 [26,'lib/quotes/background-schema.sql'],
 [27,'lib/quotes/worker-admission-schema.sql'],
] as const;

export async function applyQuoteExecutionMigrations(owner:Pool){
 const client=await owner.connect();
 try{
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout='2s'");
  await client.query("SET LOCAL statement_timeout='5s'");
  // Serialize this installation's ledger, not unrelated tenant schemas.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':' || 'll_migrations'::regclass::oid::text, 68391205))");
  const applied=(await client.query('SELECT version,digest FROM ll_migrations')).rows;
  // Quote execution migrations 25–27 depend on their released base, not a later
  // unrelated observation enrollment. Verify all original prerequisites exactly.
  for(const [version,file] of [...scopedMigrations.filter(([v])=>v<=24),[14,'lib/enquiries/worker-admission-schema.sql']] as const){
   const old=applied.find(row=>row.version===version);
   if(!old)throw Error(`Apply prerequisite migration ${version} first.`);
   if(old.digest!==createHash('sha256').update(await readFile(file)).digest('hex'))throw Error(`Applied prerequisite migration ${version} changed.`);
  }
  for(const table of ['ll_orgs','ll_migrations','ll_connector_actions','ll_connector_policies','ll_agent_profiles','ll_workflow_runs','ll_workflow_events','ll_quote_plans','ll_temporal_worker_builds']){
   if(!(await client.query('SELECT pg_get_userbyid(relowner)=current_user owned FROM pg_class WHERE oid=to_regclass($1)',[table])).rows[0]?.owned)
    throw Error('Separate quote-execution owner connection required.');
  }
  if((await client.query('SELECT ll_runtime_classification() purpose')).rows[0]?.purpose!=='offline')throw Error('Offline quote-execution installation required.');
  const installed:number[]=[];
  for(const [version,file] of quoteExecutionMigrations){
   const sql=await readFile(file,'utf8'),hash=createHash('sha256').update(sql).digest('hex'),old=applied.find(row=>row.version===version);
   if(old&&old.digest!==hash)throw Error(`Applied migration ${version} changed.`);
   if(!old){await client.query(sql);await client.query('INSERT INTO ll_migrations(version,digest) VALUES($1,$2)',[version,hash]);installed.push(version);}
  }
  await client.query('COMMIT');
  return Object.freeze({installed:Object.freeze(installed),approved:false as const,executed:false as const,granted:false as const});
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}
