import {beforeAll,afterAll,it,expect} from 'vitest';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {installBookingMeasurement} from './booking-installation';
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
