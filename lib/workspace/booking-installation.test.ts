import {beforeAll,afterAll,it,expect} from 'vitest';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {installBookingMeasurement} from './booking-installation';
import {verifyBookingTenantInventory} from './booking-inventory';
import {verifyTenantInventory} from './tenant-read-inventory';
import {scopedMigrations} from '../../runtime/temporal/staging-preflight';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {PoolClient} from 'pg';
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>,role:string;
const apply=async(org='booking_install_a',name=role)=>{const c=await fixture.owner.connect();try{return await installBookingMeasurement(c,{org,role:name});}finally{c.release();}};
beforeAll(async()=>{fixture=await createInstalledTenantFixture({tenants:['booking_install_a','booking_install_b'],salesOrg:'booking_install_a',seed:async()=>{}});role=(await fixture.web('booking_install_a').query('SELECT current_user role')).rows[0].role;},60000);
afterAll(async()=>{await fixture?.close();},60000);
it('refuses foreign binding without creating optional tables or migration ledger',async()=>{await expect(apply('booking_install_b')).rejects.toThrow('web role required');expect((await fixture.owner.query("SELECT to_regclass('ll_booking_deliveries') present")).rows[0].present).toBeNull();});
it('owner applies exact optional migration and only the bound web column grants; repeat is idempotent',async()=>{
 const result=await apply();expect(result).toMatchObject({migration:32,repeated:false,endpointEnabled:false,executionAuthorityGranted:false});expect(await apply()).toMatchObject({repeated:true,digest:result.digest});
 expect((await fixture.owner.query('SELECT count(*) n FROM ll_migrations WHERE version=32')).rows[0].n).toBe('1');
 await fixture.web('booking_install_a').query("INSERT INTO ll_booking_deliveries(org_id,scope,digest) VALUES('booking_install_a','fixture',$1)",['a'.repeat(64)]);
 await expect(fixture.web('booking_install_a').query('SELECT received_at FROM ll_booking_deliveries')).rejects.toThrow(/permission denied/);
});
it('parallel optional installation retains one ledger row and unchanged digest',async()=>{const r=await Promise.all([apply(),apply()]);expect(r.every(x=>x.repeated&&x.digest===r[0].digest)).toBe(true);});
it('workers, schedulers and the other tenant web role receive no booking access',async()=>{
 for(const db of [await fixture.workload('booking_install_a','worker'),await fixture.workload('booking_install_a','scheduler'),fixture.web('booking_install_b')])await expect(db.query('SELECT org_id FROM ll_booking_reservations')).rejects.toThrow(/permission denied/);
});
it('installed web role cannot run the owner-only extension or bypass tenant RLS',async()=>{
 const c=await fixture.web('booking_install_a').connect();try{await expect(installBookingMeasurement(c,{role,org:'booking_install_a'})).rejects.toThrow('owner');}finally{c.release();}
 await expect(fixture.web('booking_install_a').query("INSERT INTO ll_booking_deliveries(org_id,scope,digest) VALUES('booking_install_b','foreign',$1)",['b'.repeat(64)])).rejects.toThrow(/row-level security/);
 await expect(fixture.web('booking_install_a').query('DELETE FROM ll_booking_deliveries')).rejects.toThrow(/permission denied/);
});
it('refuses changed ledger, future column, weakened policy and broad privileges without blessing them',async()=>{
 const old=(await fixture.owner.query('SELECT digest FROM ll_migrations WHERE version=32')).rows[0].digest;
 await fixture.owner.query('UPDATE ll_migrations SET digest=$1 WHERE version=32',['f'.repeat(64)]);await expect(apply()).rejects.toThrow('migration changed');await fixture.owner.query('UPDATE ll_migrations SET digest=$1 WHERE version=32',[old]);
 await fixture.owner.query('ALTER TABLE ll_booking_reservations ADD COLUMN future_secret text');await expect(apply()).rejects.toThrow('catalog mismatch');await expect(fixture.web('booking_install_a').query('SELECT future_secret FROM ll_booking_reservations')).rejects.toThrow(/permission denied/);await fixture.owner.query('ALTER TABLE ll_booking_reservations DROP COLUMN future_secret');
 await fixture.owner.query('ALTER POLICY ll_booking_scope ON ll_booking_reservations USING (true)');await expect(apply()).rejects.toThrow('policy mismatch');await fixture.owner.query('ALTER POLICY ll_booking_scope ON ll_booking_reservations USING (org_id=ll_bound_workspace())');
 await fixture.owner.query(`GRANT SELECT ON ll_booking_reservations TO "${role}"`);await expect(apply()).rejects.toThrow('broad booking grants');await fixture.owner.query(`REVOKE SELECT ON ll_booking_reservations FROM "${role}"`);await apply();
});

const sourceLedger=()=>Promise.all([...scopedMigrations,...[[14,'lib/enquiries/worker-admission-schema.sql'],[15,'lib/enquiries/reset-intent-schema.sql'],[16,'lib/workspace/cloud-inventory-schema.sql'],[17,'lib/workspace/cloud-project-schema.sql'],[18,'lib/workspace/cloud-owner-review-schema.sql']] as const].map(async([version,file])=>({version,digest:createHash('sha256').update(await readFile(file)).digest('hex')})));
async function catalog(c:PoolClient){
 const tables=(await c.query("SELECT c.relname name,c.relrowsecurity rls,c.relforcerowsecurity force,ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum) columns FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND c.relkind IN ('r','p') ORDER BY c.relname",[fixture.schema])).rows;
 return{tables,migrations:(await c.query('SELECT version,digest FROM ll_migrations')).rows};
}
it('composes source-reviewed optional inventory after repeated installation while base verifier still refuses it',async()=>{
 await apply();const c=await fixture.owner.connect();try{
  const actual=await catalog(c),reviewed=await sourceLedger();
  await expect(verifyBookingTenantInventory(actual,reviewed)).resolves.toBeUndefined();
  expect(()=>verifyTenantInventory(actual,reviewed)).toThrow('inventory mismatch');
  // Target migration observations cannot replace the independently sourced base.
  await expect(verifyBookingTenantInventory(actual,actual.migrations)).rejects.toThrow('booking inventory mismatch');
 }finally{c.release();}
});
it.each([
 ['added column','ALTER TABLE ll_booking_reservations ADD COLUMN future_secret text'],
 ['missing column','ALTER TABLE ll_booking_reservations DROP COLUMN ends_at'],
 ['changed column','ALTER TABLE ll_booking_reservations RENAME COLUMN ends_at TO changed_end'],
 ['RLS disabled','ALTER TABLE ll_booking_reservations DISABLE ROW LEVEL SECURITY'],
 ['force disabled','ALTER TABLE ll_booking_reservations NO FORCE ROW LEVEL SECURITY'],
 ['changed digest',"UPDATE ll_migrations SET digest=repeat('f',64) WHERE version=32"],
 ['missing ledger','DELETE FROM ll_migrations WHERE version=32'],
 ['missing table','DROP TABLE ll_booking_deliveries'],
 ['unexpected table','CREATE TABLE ll_unreviewed_booking(secret text)'],
])('composed installed inventory refuses %s',async(_name,sql)=>{
 const c=await fixture.owner.connect();try{
  await c.query('BEGIN');await c.query(sql);
  await expect(verifyBookingTenantInventory(await catalog(c),await sourceLedger())).rejects.toThrow(/inventory mismatch/);
 }finally{await c.query('ROLLBACK');c.release();}
});
