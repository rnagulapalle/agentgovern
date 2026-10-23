/** Owner-only optional measurement extension for an already installed web role.
 * Does not admit an HTTP route, qualify calls, or grant workflow execution. */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { PoolClient } from 'pg';

export const bookingColumns = Object.freeze({
 ll_booking_deliveries: Object.freeze(['org_id','scope','digest','received_at']),
 ll_booking_reservations: Object.freeze(['org_id','scope','uid','state','occurred_at','intake_ref','predecessor','successor','classification','starts_at','ends_at']),
});
const migrationFile='lib/workspace/booking-schema.sql';
const prerequisites=[[1,'lib/durable/schema.sql'],[3,'lib/workspace/schema.sql'],[10,'lib/durable/recovery-schema.sql']] as const;
export async function installBookingMeasurement(client:PoolClient,binding:{role:string;org:string}) {
 if(!binding||Object.keys(binding).sort().join()!=='org,role'||!/^[_a-z][_a-z0-9_]{0,62}$/.test(binding.role)||!/^[-_a-zA-Z0-9]{1,64}$/.test(binding.org))throw Error('Exact installed booking web binding required');
 await client.query('BEGIN');
 try{
  await client.query("SET LOCAL lock_timeout='2s'");await client.query("SET LOCAL statement_timeout='5s'");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':' || 'll_migrations'::regclass::oid::text,68391205))");
  for(const table of ['ll_orgs','ll_migrations','ll_sales_requests','ll_runtime_workspace_bindings']){
   if(!(await client.query('SELECT pg_get_userbyid(relowner)=current_user owned FROM pg_class WHERE oid=to_regclass($1)',[table])).rows[0]?.owned)throw Error('Separate booking migration owner required');
  }
  if((await client.query('SELECT ll_runtime_classification() purpose')).rows[0]?.purpose!=='offline')throw Error('Offline booking installation required');
  const migrations=(await client.query('SELECT version,digest FROM ll_migrations')).rows;
  for(const [version,file]of prerequisites){if(migrations.find(m=>m.version===version)?.digest!==createHash('sha256').update(await readFile(file)).digest('hex'))throw Error('Booking prerequisite migration missing or changed');}
  const bound=(await client.query("SELECT 1 FROM ll_runtime_workspace_bindings b JOIN pg_roles r ON r.oid=b.login_oid AND r.rolname=b.login_name JOIN pg_database d ON d.oid=b.database_oid AND d.datname=b.database_name WHERE b.login_name=$1 AND b.org_id=$2 AND b.purpose='web' AND d.datname=current_database() AND r.rolcanlogin AND NOT r.rolsuper AND NOT r.rolbypassrls AND NOT r.rolinherit AND NOT r.rolcreatedb AND NOT r.rolcreaterole AND NOT r.rolreplication",[binding.role,binding.org])).rows[0];
  if(!bound)throw Error('Exact restricted installed booking web role required');
  const sql=await readFile(migrationFile,'utf8'),digest=createHash('sha256').update(sql).digest('hex'),old=migrations.find(m=>m.version===32);
  if(old&&old.digest!==digest)throw Error('Applied booking migration changed');
  if(!old){await client.query(sql);await client.query('INSERT INTO ll_migrations(version,digest) VALUES(32,$1)',[digest]);}
  for(const [table,columns]of Object.entries(bookingColumns)){
   const facts=(await client.query("SELECT pg_get_userbyid(c.relowner)=current_user owned,c.relrowsecurity rls,c.relforcerowsecurity force,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c WHERE c.oid=to_regclass($1)",[table])).rows[0];
   if(!facts?.owned||!facts.rls||!facts.force||JSON.stringify(facts.columns)!==JSON.stringify(columns))throw Error('Booking installed catalog mismatch');
   const policies=(await client.query("SELECT polname,polcmd,polpermissive,polroles::text roles,pg_get_expr(polqual,polrelid) qualified,pg_get_expr(polwithcheck,polrelid) checked FROM pg_policy WHERE polrelid=to_regclass($1)",[table])).rows;
   if(policies.length!==1||policies[0].polname!=='ll_booking_scope'||policies[0].polcmd!=='*'||!policies[0].polpermissive||policies[0].roles!=='{0}'||policies[0].qualified?.replace(/\s/g,'')!=='(org_id=ll_bound_workspace())'||policies[0].checked?.replace(/\s/g,'')!=='(org_id=ll_bound_workspace())')throw Error('Booking installed policy mismatch');
   const broad=(await client.query("SELECT has_table_privilege($1,to_regclass($2),'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') granted",[binding.role,table])).rows[0]?.granted;
   const publicAcl=(await client.query('SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) acl WHERE c.oid=to_regclass($1) AND acl.grantee=0',[table])).rows.length;
   if(broad||publicAcl)throw Error('Unexpected broad booking grants');
  }
  const role='"'+binding.role+'"';
  await client.query(`GRANT SELECT(org_id,scope,digest),INSERT(org_id,scope,digest) ON ll_booking_deliveries TO ${role}`);
  await client.query(`GRANT SELECT(org_id,scope,uid,state,occurred_at,intake_ref,predecessor,successor,classification,starts_at,ends_at),INSERT(org_id,scope,uid,state,occurred_at,intake_ref,predecessor,successor,classification,starts_at,ends_at),UPDATE(state,occurred_at,intake_ref,predecessor,successor,starts_at,ends_at) ON ll_booking_reservations TO ${role}`);
  await client.query('COMMIT');
  return Object.freeze({migration:32,digest,repeated:Boolean(old),runtimeRole:binding.role,scope:'installed-web-measurement-only',endpointEnabled:false,executionAuthorityGranted:false});
 }catch(error){await client.query('ROLLBACK');throw error;}
}
