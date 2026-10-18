import {beforeAll,afterAll,it,expect} from 'vitest';
import {Pool} from 'pg';
import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {installQuoteWorkloadGrants} from './quote-workload-installation';
import {scopedPoolOptions} from '../durable/pg-transport';
import {registerTenantPool,assertTenantPool} from '../durable/tenant-pool';
import {transaction} from '../durable/database';
import {authorize,tokenHash} from '../durable/service';
import {managedQuoteWorker} from '../quotes/background';
const suffix=randomBytes(8).toString('hex'),roles={worker:'llqt_'+suffix+'_worker',scheduler:'llqt_'+suffix+'_scheduler'};
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>;
const pools:Partial<Record<'worker'|'scheduler',Pool>>={},oids:Partial<Record<'worker'|'scheduler',string>>={};
const actor={orgId:'one',subject:'quote-temporal',role:'worker' as const,tokenHash:tokenHash(randomBytes(32).toString('base64url'))};
beforeAll(async()=>{
 fixture=await createInstalledTenantFixture({tenants:['one','two'],salesOrg:'one',seed:async()=>{}});
 await fixture.owner.query(await readFile('lib/quotes/background-schema.sql','utf8'));
 await fixture.owner.query("INSERT INTO ll_tokens(hash,org_id,subject,role) VALUES($1,'one','quote-temporal','worker')",[actor.tokenHash]);
 const epoch=(await fixture.owner.query("SELECT epoch FROM ll_workspace_recovery WHERE org_id='one'")).rows[0].epoch;
 for(const purpose of ['worker','scheduler'] as const){
 const password=randomBytes(32).toString('base64url');await fixture.owner.query(`CREATE ROLE ${roles[purpose]} LOGIN PASSWORD '${password}' NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
 const oid=(await fixture.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[roles[purpose]])).rows[0].oid;oids[purpose]=oid;
 await installQuoteWorkloadGrants(fixture.owner,fixture.schema,roles[purpose],'one',purpose,oid);
 const url=new URL(process.env.LOOPLABS_TEST_DATABASE_URL!);url.username=roles[purpose];url.password=password;
 const pool=new Pool(await scopedPoolOptions({url:url.href,schema:fixture.schema,purpose,transport:{mode:'loopback-plaintext-test-fixture',fixture:'disposable-local-postgres'}},{kind:'owned-disposable-fixture'}));pools[purpose]=pool;
 await registerTenantPool(pool,{org:'one',epoch,role:roles[purpose],schema:fixture.schema,purpose});
 }
},20000);
afterAll(async()=>{
 for(const pool of Object.values(pools))await pool.end();
 if(fixture){try{for(const purpose of ['worker','scheduler'] as const){if(!oids[purpose])continue;expect((await fixture.owner.query('SELECT oid::text oid FROM pg_roles WHERE rolname=$1',[roles[purpose]])).rows[0]?.oid).toBe(oids[purpose]);await fixture.owner.query('DELETE FROM ll_quote_workload_roles WHERE role_oid=$1::oid',[oids[purpose]]);await fixture.owner.query('DELETE FROM ll_runtime_workspace_bindings WHERE login_oid=$1::oid',[oids[purpose]]);await fixture.owner.query(`DROP OWNED BY ${roles[purpose]}`);await fixture.owner.query(`DROP ROLE ${roles[purpose]}`);expect((await fixture.owner.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[roles[purpose]])).rows).toEqual([]);}}finally{await fixture.close();}}
},20000);
it('actual dedicated roles register separate purposes/OIDs; no old worker role is adopted',async()=>{for(const purpose of ['worker','scheduler'] as const){const b=await assertTenantPool(pools[purpose]!,'one');expect(b.purpose).toBe(purpose);expect(b.roleOid).toBe(oids[purpose]);}expect(oids.worker).not.toBe(oids.scheduler);await expect(installQuoteWorkloadGrants(fixture.owner,fixture.schema,roles.worker,'one','worker',oids.worker!)).rejects.toThrow('Existing workload role cannot be reused');});
it('actual quote execution token cannot authorize discounts/refunds/enquiry operations or operate an unrequested quote',async()=>{await expect(transaction(pools.worker!,'one',c=>authorize(c,actor,['worker']))).rejects.toMatchObject({status:403});await expect(transaction(pools.worker!,'one',c=>authorize(c,actor,['worker'],'enquiries'))).rejects.toMatchObject({status:403});await transaction(pools.worker!,'one',c=>authorize(c,actor,['worker'],'quotes'));await expect(transaction(pools.worker!,'one',c=>managedQuoteWorker(c,actor,'00000000-0000-4000-8000-000000000000','plan'))).rejects.toMatchObject({status:403});});
it('actual worker cannot approve, alter grants/membership, insert dispatch or access money action state',async()=>{for(const sql of ['UPDATE ll_connector_actions SET approved_by=approved_by','UPDATE ll_connector_actions SET approval_until=approval_until','UPDATE ll_members SET active=active','UPDATE ll_quote_manager_grants SET active=active','SELECT * FROM ll_actions','SELECT * FROM ll_refund_actions','INSERT INTO ll_quote_background_routes DEFAULT VALUES','DELETE FROM ll_quote_plans','TRUNCATE ll_quote_plans'])await expect(pools.worker!.query(sql)).rejects.toMatchObject({code:'42501'});});
it('actual scheduler cannot read/execute actions, read members, edit immutable route or insert it',async()=>{for(const sql of ['SELECT * FROM ll_connector_actions','SELECT * FROM ll_members','UPDATE ll_quote_background_routes SET authority=authority','INSERT INTO ll_quote_background_routes DEFAULT VALUES','DELETE FROM ll_quote_background_routes','TRUNCATE ll_quote_background_routes'])await expect(pools.scheduler!.query(sql)).rejects.toMatchObject({code:'42501'});await expect(transaction(pools.scheduler!,'one',c=>managedQuoteWorker(c,actor,'00000000-0000-4000-8000-000000000000','plan'))).rejects.toMatchObject({status:403});});
it('actual foreign RLS read hides dedicated role metadata and runtime cannot rewrite its registration',async()=>{for(const pool of Object.values(pools)){expect((await pool.query("SELECT * FROM ll_quote_workload_roles WHERE org_id='two'")).rows).toEqual([]);await expect(pool.query('UPDATE ll_quote_workload_roles SET role_oid=role_oid')).rejects.toMatchObject({code:'42501'});await expect(pool.query('SELECT * FROM ll_runtime_workspace_bindings')).rejects.toMatchObject({code:'42501'});}});
