/** Owned PostgreSQL fixture proof with genuine installed roles. The proposed
 * booking tables/grants are applied explicitly here, not by the installer. */
import {afterAll,beforeAll,expect,it} from 'vitest';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {persistBooking} from './booking-store';
import type {BookingEvent} from './booking-event';
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>;
const localRef='8332ee28-b559-4370-8f77-8fd888056b1a',foreignRef='9ff3339e-bd1b-40de-8a34-a86e9fbc19d4';
const config={secret:'a'.repeat(48),organizer:'owner',eventTypeId:42,version:'2021-10-20' as const,classification:'test' as const};
function event(uid:string,change:Partial<BookingEvent>={}):BookingEvent{
 const data={bookingUid:uid,predecessorBookingUid:null,event:'BOOKING_CREATED',occurredAt:'2026-10-20T08:30:00Z',state:'reserved' as const,startsAt:'2026-10-22T16:00:00Z',endsAt:'2026-10-22T16:30:00Z',proposedIntakeReference:null,...change};
 return {...data,deliveryDigest:createHash('sha256').update(JSON.stringify(data)).digest('hex')};
}
const persist=(e:BookingEvent)=>persistBooking(fixture.web('booking_a'),config,e);
const rows=async(uid:string)=>(await fixture.web('booking_a').query('SELECT * FROM ll_booking_reservations WHERE uid=$1',[uid])).rows;
beforeAll(async()=>{
 fixture=await createInstalledTenantFixture({tenants:['booking_a','booking_b'],salesOrg:'booking_a',seed:async db=>{
  for(const [org,id]of [['booking_a',localRef],['booking_b',foreignRef]])await db.query("INSERT INTO ll_sales_requests(org_id,id,email,name,company,company_size,role,workflow) VALUES($1,$2,'fixture@example.invalid','Fixture','Fixture','1-10','owner','fixture workflow')",[org,id]);
 }});
 await fixture.owner.query(await readFile('lib/workspace/booking-schema.sql','utf8'));
 for(const org of ['booking_a','booking_b']){
  const role=(await fixture.web(org).query('SELECT current_user role')).rows[0].role;
  if(!/^[_a-zA-Z][_a-zA-Z0-9]{0,62}$/.test(role))throw Error('Invalid fixture role');
  await fixture.owner.query(`GRANT SELECT(org_id,scope,digest),INSERT(org_id,scope,digest) ON ll_booking_deliveries TO ${role}`);
  await fixture.owner.query(`GRANT SELECT(org_id,scope,uid,state,occurred_at,intake_ref,predecessor,successor,classification,starts_at,ends_at),INSERT(org_id,scope,uid,state,occurred_at,intake_ref,predecessor,successor,classification,starts_at,ends_at),UPDATE(state,occurred_at,intake_ref,predecessor,successor,starts_at,ends_at) ON ll_booking_reservations TO ${role}`);
 }
},60000);
afterAll(async()=>{await fixture?.close();},60000);
it('12 concurrent duplicate deliveries produce exactly one reservation and delivery',async()=>{
 const e=event('parallel');const results=await Promise.all(Array.from({length:12},()=>persist(e)));
 expect(results.filter(r=>!r.replay)).toHaveLength(1);expect(await rows('parallel')).toHaveLength(1);
 expect((await fixture.web('booking_a').query('SELECT digest FROM ll_booking_deliveries WHERE digest=$1',[e.deliveryDigest])).rows).toHaveLength(1);
});
it('cancel before create stays cancelled and requested cannot downgrade reserved',async()=>{
 await persist(event('cancel-first',{state:'cancelled',event:'BOOKING_CANCELLED'}));await persist(event('cancel-first',{occurredAt:'2026-10-20T08:31:00Z'}));
 expect((await rows('cancel-first'))[0].state).toBe('cancelled');
 await persist(event('reserve-first'));await persist(event('reserve-first',{state:'requested',event:'BOOKING_REQUESTED',occurredAt:'2026-10-20T08:32:00Z'}));
 expect((await rows('reserve-first'))[0].state).toBe('reserved');
});
it('requested stays distinct from reserved',async()=>{await persist(event('pending',{state:'requested',event:'BOOKING_REQUESTED'}));expect((await rows('pending'))[0].state).toBe('requested');});
it('foreign intake fails and rolls back its delivery; local intake resolves',async()=>{
 const bad=event('foreign',{proposedIntakeReference:foreignRef});await expect(persist(bad)).rejects.toThrow('correlation refused');expect(await rows('foreign')).toHaveLength(0);
 expect((await fixture.web('booking_a').query('SELECT digest FROM ll_booking_deliveries WHERE digest=$1',[bad.deliveryDigest])).rows).toHaveLength(0);
 await persist(event('local',{proposedIntakeReference:localRef}));expect((await rows('local'))[0].intake_ref).toBe(localRef);
});
it('reschedule retains correlation and refuses cycles and conflicting successors',async()=>{
 await persist(event('old',{proposedIntakeReference:localRef}));const replacement=event('new',{event:'BOOKING_RESCHEDULED',predecessorBookingUid:'old'});
 await persist(replacement);expect((await persist(replacement)).replay).toBe(true);
 expect((await rows('old'))[0]).toMatchObject({state:'superseded',successor:'new'});expect((await rows('new'))[0]).toMatchObject({state:'reserved',predecessor:'old',intake_ref:localRef});
 await expect(persist(event('other',{event:'BOOKING_RESCHEDULED',predecessorBookingUid:'old'}))).rejects.toThrow('relation refused');
 await expect(persist(event('old',{event:'BOOKING_RESCHEDULED',predecessorBookingUid:'new'}))).rejects.toThrow('relation refused');
});
it('missing predecessor is refused without projecting a reservation',async()=>{await expect(persist(event('orphan',{event:'BOOKING_RESCHEDULED',predecessorBookingUid:'missing'}))).rejects.toThrow('relation refused');expect(await rows('orphan')).toHaveLength(0);});
it('actual RLS hides other workspace rows and denies cross-workspace writes',async()=>{
 await persist(event('private'));expect((await fixture.web('booking_b').query("SELECT uid FROM ll_booking_reservations WHERE uid='private'")).rows).toHaveLength(0);
 await expect(fixture.web('booking_b').query('INSERT INTO ll_booking_deliveries(org_id,scope,digest) VALUES($1,$2,$3)',['booking_a','forbidden','f'.repeat(64)])).rejects.toThrow('row-level security');
});
it('worker and scheduler roles have no booking access',async()=>{
 for(const purpose of ['worker','scheduler'] as const){const db=await fixture.workload('booking_a',purpose);await expect(db.query('SELECT uid FROM ll_booking_reservations')).rejects.toThrow('permission denied');await expect(persistBooking(db,config,event('wrong-purpose'))).rejects.toThrow('web context');}
});
it('injected projection failure rolls back delivery and permits a safe retry',async()=>{
 const e=event('fault');await fixture.owner.query("CREATE FUNCTION booking_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.uid='fault' THEN RAISE EXCEPTION 'owned fixture injected failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER booking_fixture_fail BEFORE INSERT ON ll_booking_reservations FOR EACH ROW EXECUTE FUNCTION booking_fixture_fail()");
 try{await expect(persist(e)).rejects.toThrow('injected failure');expect((await fixture.web('booking_a').query('SELECT digest FROM ll_booking_deliveries WHERE digest=$1',[e.deliveryDigest])).rows).toHaveLength(0);}finally{await fixture.owner.query('DROP TRIGGER booking_fixture_fail ON ll_booking_reservations; DROP FUNCTION booking_fixture_fail()');}
 expect((await persist(e)).replay).toBe(false);expect(await rows('fault')).toHaveLength(1);
});
it('future column has no implicit read grant and store fails closed',async()=>{
 await fixture.owner.query('ALTER TABLE ll_booking_reservations ADD COLUMN future_private text');
 try{await expect(fixture.web('booking_a').query('SELECT future_private FROM ll_booking_reservations')).rejects.toThrow('permission denied');await expect(persist(event('future-column'))).rejects.toThrow('permission denied');}finally{await fixture.owner.query('ALTER TABLE ll_booking_reservations DROP COLUMN future_private');}
 expect(await rows('future-column')).toHaveLength(0);
});
