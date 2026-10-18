/** Source-owned composed catalog verifier for offline recovery. Never infers an
 * allowlist from a target catalog and never mutates schemas or runtime rights. */
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {Pool} from 'pg';
import {verifyTenantInventory} from './tenant-read-inventory';
import {quoteExecutionMigrations} from './quote-execution-migrations';
const quoteColumns=Object.freeze({
 ll_quote_background_routes:Object.freeze(['org_id','plan_id','plan_hash','recovery_epoch','worker_role_oid','scheduler_role_oid','worker_build_id','workflow_id','authority','contract','created_at','state','lease_token','lease_until','next_attempt','attempts','started_at']),
 ll_quote_workload_roles:Object.freeze(['org_id','role_oid','purpose'])
});
type Catalog=Parameters<typeof verifyTenantInventory>[0];
export function verifyQuoteRecoveryInventory(actual:Catalog,base:Catalog['migrations'],quote:Catalog['migrations']){
 if(quote.length!==quoteExecutionMigrations.length||quote.some((row,i)=>row.version!==quoteExecutionMigrations[i][0]))throw Error('Reviewed quote recovery inventory mismatch');
 for(const [name,columns]of Object.entries(quoteColumns)){
  const rows=actual.tables.filter(t=>t.name===name);
  if(rows.length!==1||!rows[0].rls||!rows[0].force||JSON.stringify(rows[0].columns)!==JSON.stringify(columns))throw Error('Reviewed quote recovery inventory mismatch');
 }
 const quoteVersions=new Set(quote.map(m=>m.version));
 const installed=actual.migrations.filter(m=>quoteVersions.has(m.version));
 if(installed.length!==quote.length||new Set(installed.map(m=>m.version)).size!==quote.length||installed.some(m=>m.digest!==quote.find(q=>q.version===m.version)?.digest))throw Error('Reviewed quote recovery migration mismatch');
 verifyTenantInventory({tables:actual.tables.filter(t=>!Object.hasOwn(quoteColumns,t.name)),migrations:actual.migrations.filter(m=>!quoteVersions.has(m.version))},base);
}
export async function inspectQuoteRecoveryInventory(owner:Pick<Pool,'query'>,schema:string,base:Catalog['migrations']){
 if(!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(schema))throw Error('Exact quote recovery schema');
 const quote=await Promise.all(quoteExecutionMigrations.map(async([version,file])=>({version,digest:createHash('sha256').update(await readFile(file)).digest('hex')})));
 const tables=(await owner.query(`SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname`,[schema])).rows;
 const migrations=(await owner.query(`SELECT version,digest FROM ${schema}.ll_migrations ORDER BY version`)).rows;
 verifyQuoteRecoveryInventory({tables,migrations},base,quote);
}
