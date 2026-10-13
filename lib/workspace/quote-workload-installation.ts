import type { Pool } from "pg";
// Offline extension of the installed tenant's classification. Publication uses
// the existing sealed single-entry workload format; this function emits no secret
// or runtime pool and never activates a worker.
export async function installQuoteWorkloadGrants(owner:Pool,schema:string,role:string,org:string,purpose:"worker"|"scheduler",expectedOid:string){
 if(!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(schema)||!/^llqt_[a-z0-9_]{1,54}$/.test(role)||!/^[-_a-zA-Z0-9]{1,64}$/.test(org)||!['worker','scheduler'].includes(purpose)||!/^\d+$/.test(expectedOid))throw Error('Exact quote installation required');
 const c=await owner.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query("SET LOCAL statement_timeout='10s'");
 const offline=(await c.query(`SELECT ${schema}.ll_runtime_classification() classification`)).rows[0];if(offline?.classification!=='offline')throw Error('Offline installer required');
 const facts=(await c.query('SELECT oid::text oid,rolcanlogin,rolsuper,rolbypassrls,rolcreatedb,rolcreaterole,rolreplication,EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) grouped FROM pg_roles r WHERE rolname=$1',[role])).rows[0];
 if(!facts||facts.oid!==expectedOid||!facts.rolcanlogin||facts.rolsuper||facts.rolbypassrls||facts.rolcreatedb||facts.rolcreaterole||facts.rolreplication||facts.grouped)throw Error('Dedicated role identity refused');
 if((await c.query(`SELECT 1 FROM ${schema}.ll_runtime_workspace_bindings WHERE login_oid=$1::oid OR login_name=$2`,[expectedOid,role])).rowCount)throw Error('Existing workload role cannot be reused');
 const inherited=(await c.query('SELECT 1 FROM pg_class t JOIN pg_namespace n ON n.oid=t.relnamespace WHERE n.nspname=$1 AND t.relkind IN (\'r\',\'p\') AND (pg_has_role($2,t.relowner,\'USAGE\') OR has_table_privilege($2,t.oid,\'SELECT,INSERT,UPDATE,DELETE,TRUNCATE\')) LIMIT 1',[schema,role])).rowCount;if(inherited)throw Error('Workload role has prior table authority');
 await grantQuoteWorkloadCapabilities(c,schema,role,purpose);
 await c.query(`INSERT INTO ${schema}.ll_runtime_workspace_bindings(login_oid,login_name,database_oid,database_name,org_id,purpose) SELECT oid,rolname,(SELECT oid FROM pg_database WHERE datname=current_database()),current_database(),$2,$3 FROM pg_roles WHERE rolname=$1`,[role,org,purpose]);
 await c.query(`INSERT INTO ${schema}.ll_quote_workload_roles(org_id,role_oid,purpose) VALUES($1,$2::oid,$3)`,[org,expectedOid,purpose]);await c.query('COMMIT');
 }catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}
/** Extends only the existing named web role's scheduling-intent rights. */
export async function installQuoteAdmissionGrants(owner:Pool,schema:string,role:string,org:string,expectedOid:string){
 if(!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(schema)||!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(role)||!/^[-_a-zA-Z0-9]{1,64}$/.test(org)||!/^\d+$/.test(expectedOid))throw Error('Exact web installation required');
 const c=await owner.connect();try{await c.query('BEGIN');await c.query("SET LOCAL lock_timeout='2s'");await c.query("SET LOCAL statement_timeout='10s'");
 if((await c.query(`SELECT ${schema}.ll_runtime_classification() classification`)).rows[0]?.classification!=='offline')throw Error('Offline installer required');
 const current=(await c.query(`SELECT b.login_oid::text oid FROM ${schema}.ll_runtime_workspace_bindings b JOIN pg_roles r ON r.oid=b.login_oid AND r.rolname=b.login_name WHERE b.org_id=$1 AND b.login_name=$2 AND b.purpose='web' AND NOT(r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb OR r.rolreplication)`,[org,role])).rows[0];
 if(current?.oid!==expectedOid)throw Error('Current installed web role required');
 await grantQuoteAdmissionCapabilities(c,schema,role);
 await c.query('COMMIT');}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}
}

/** Source-owned offline capability application; no catalog registration, role
 * adoption, credential publication or runtime authority. Call only after the
 * enclosing installer/recovery validates exact identities and source inventory. */
export async function grantQuoteWorkloadCapabilities(owner:Pick<Pool,'query'>,schema:string,role:string,purpose:'worker'|'scheduler'){
 if(!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(schema)||!/^llqt_[a-z0-9_]{1,54}$/.test(role)||!['worker','scheduler'].includes(purpose))throw Error('Exact quote capability identity required');
 await owner.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
 const reads=purpose==='scheduler'?['ll_orgs','ll_tokens','ll_workspace_recovery','ll_quote_background_routes','ll_quote_workload_roles']:['ll_orgs','ll_tokens','ll_workspace_recovery','ll_agents','ll_agent_profiles','ll_quote_plans','ll_quote_manager_grants','ll_quote_member_generations','ll_connector_actions','ll_connector_policies','ll_connector_scopes','ll_connector_scope_grants','ll_workflow_runs','ll_workflow_steps','ll_quote_background_routes','ll_quote_workload_roles'];
 for(const table of reads)await owner.query(`GRANT SELECT ON ${schema}.${table} TO ${role}`);
 await owner.query(`GRANT UPDATE(id) ON ${schema}.ll_orgs TO ${role}`);
 if(purpose==='worker'){
 await owner.query(`GRANT SELECT(email,org_id,name,active),UPDATE(name) ON ${schema}.ll_members TO ${role}`);
 // Retained membership/ownership helpers query enquiry attribution even for a
 // quote action. Only those read columns, no enquiry state/authority writes.
 await owner.query(`GRANT SELECT(org_id,id,run_id,membership_owner,created_by) ON ${schema}.ll_enquiry_plans TO ${role}`);
 await owner.query(`GRANT UPDATE(state,reason,lease_token,lease_until,evidence) ON ${schema}.ll_connector_actions TO ${role}`);
 await owner.query(`GRANT UPDATE(reserved) ON ${schema}.ll_agents TO ${role}`);
 await owner.query(`GRANT INSERT ON ${schema}.ll_connector_events TO ${role}`);
 }else await owner.query(`GRANT UPDATE(state,lease_token,lease_until,next_attempt,attempts,started_at) ON ${schema}.ll_quote_background_routes TO ${role}`);
 await owner.query(`GRANT EXECUTE ON FUNCTION ${schema}.ll_bound_workspace(),${schema}.ll_named_subject_exists(text),${schema}.ll_runtime_classification() TO ${role}`);
}
export async function grantQuoteAdmissionCapabilities(owner:Pick<Pool,'query'>,schema:string,role:string){
 if(!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(schema)||!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(role))throw Error('Exact quote admission identity required');
 await owner.query(`GRANT SELECT ON ${schema}.ll_quote_background_routes,${schema}.ll_quote_workload_roles TO ${role}`);
 await owner.query(`GRANT INSERT(org_id,plan_id,plan_hash,recovery_epoch,worker_role_oid,scheduler_role_oid,worker_build_id,workflow_id,authority,contract) ON ${schema}.ll_quote_background_routes TO ${role}`);
}
