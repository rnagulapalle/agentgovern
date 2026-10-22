/** Actual Next Request/Response handler, owned config, actual configured tenant
 * context and PostgreSQL store. Optional schema/grants now use the owner-only extension;
 * this is not base catalog/recovery, network/TLS or native calendar acceptance. */
import {afterAll,beforeAll,beforeEach,expect,it} from 'vitest';
import {createHmac} from 'node:crypto';
import {mkdtemp,writeFile,chmod,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createInstalledTenantFixture} from './installed-tenant-fixture';
import {configureTenantContext} from './tenant-context';
import {POST} from '../../app/api/booking-events/route';
import {installBookingMeasurement} from './booking-installation';
let fixture:Awaited<ReturnType<typeof createInstalledTenantFixture>>,dir:string,file:string;
const previous=process.env.LOOPLABS_BOOKING_CONFIG;
const localRef='8332ee28-b559-4370-8f77-8fd888056b1a',foreignRef='9ff3339e-bd1b-40de-8a34-a86e9fbc19d4';
const config={secret:'a'.repeat(48),organizer:'looplabs-founder',eventTypeId:42,version:'2021-10-20' as const,classification:'test' as const};
function sample(uid:string,ref:string|null=localRef){return {triggerEvent:'BOOKING_CREATED',createdAt:'2026-10-21T08:30:00Z',payload:{uid,eventTypeId:42,organizer:{username:config.organizer},startTime:'2026-10-22T16:00:00Z',endTime:'2026-10-22T16:30:00Z',status:'ACCEPTED',requiresConfirmation:false,metadata:ref?{looplabs_intake_ref:ref}:{},attendees:[{email:'never-store@example.invalid',name:'Private attendee'}]}};}
function request(body:Buffer,signature=createHmac('sha256',config.secret).update(body).digest('hex')){return new Request('http://localhost/api/booking-events',{method:'POST',headers:{'content-type':'application/json','x-cal-signature-256':signature,'x-cal-webhook-version':config.version,'x-workspace-id':'route_b'},body:new Uint8Array(body)});}
const post=(data:unknown)=>POST(request(Buffer.from(JSON.stringify(data))));
const rows=async(uid:string)=>(await fixture.web('route_a').query('SELECT * FROM ll_booking_reservations WHERE uid=$1',[uid])).rows;
const counts=async()=>Number((await fixture.web('route_a').query('SELECT count(*) n FROM ll_booking_deliveries')).rows[0].n);
beforeAll(async()=>{
 fixture=await createInstalledTenantFixture({tenants:['route_a','route_b'],salesOrg:'route_a',seed:async db=>{for(const [org,id]of [['route_a',localRef],['route_b',foreignRef]])await db.query("INSERT INTO ll_sales_requests(org_id,id,email,name,company,company_size,role,workflow) VALUES($1,$2,'fixture@example.invalid','Fixture','Fixture','1-10','owner','fixture workflow')",[org,id]);}});
 for(const org of ['route_a','route_b']){const role=(await fixture.web(org).query('SELECT current_user role')).rows[0].role;const client=await fixture.owner.connect();try{await installBookingMeasurement(client,{role,org});}finally{client.release();}}
 configureTenantContext(fixture.context);
 dir=await realpath(await mkdtemp(join(tmpdir(),'ll-booking-installed-route-')));await chmod(dir,0o700);file=join(dir,'config.json');await writeFile(file,JSON.stringify(config),{mode:0o600});process.env.LOOPLABS_BOOKING_CONFIG=file;
},60000);
afterAll(async()=>{if(previous===undefined)delete process.env.LOOPLABS_BOOKING_CONFIG;else process.env.LOOPLABS_BOOKING_CONFIG=previous;await fixture?.close();if(dir)await rm(dir,{recursive:true,force:true});},60000);
// Reset only disposable-fixture admission windows between independent cases.
beforeEach(async()=>{await fixture.owner.query('DELETE FROM ll_access_attempts');});
it('stores an actual signed POST in configured sales tenant and strips attendee content',async()=>{const r=await post(sample('created'));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({received:true,replay:false});const a=await rows('created');expect(a).toHaveLength(1);expect(a[0]).toMatchObject({org_id:'route_a',state:'reserved',intake_ref:localRef,classification:'test'});expect(JSON.stringify(a)).not.toContain('never-store');expect((await fixture.web('route_b').query("SELECT uid FROM ll_booking_reservations WHERE uid='created'")).rows).toHaveLength(0);});
it('8 parallel signed POSTs yield one stored delivery and seven replay acknowledgments',async()=>{const values=await Promise.all(Array.from({length:8},()=>post(sample('parallel'))));expect(values.every(v=>v.status===200)).toBe(true);const results=await Promise.all(values.map(v=>v.json()));expect(results.filter(v=>v.replay===false)).toHaveLength(1);expect(results.filter(v=>v.replay===true)).toHaveLength(7);expect(await rows('parallel')).toHaveLength(1);});
it('refuses changed-body signature without any database delivery',async()=>{const before=await counts(),body=Buffer.from(JSON.stringify(sample('bad-signature')));const r=await POST(request(body,'0'.repeat(64)));expect(r.status).toBe(400);expect(await counts()).toBe(before);expect(await rows('bad-signature')).toHaveLength(0);});
it('refuses foreign intake correlation and rolls the entire transaction back',async()=>{const before=await counts(),r=await post(sample('foreign',foreignRef));expect(r.status).toBe(400);expect(await counts()).toBe(before);expect(await rows('foreign')).toHaveLength(0);});
it('projects pending and cancelled events distinctly and never revives a cancelled UID',async()=>{const x=sample('pending');x.triggerEvent='BOOKING_REQUESTED';x.payload.status='PENDING';expect((await post(x)).status).toBe(200);expect((await rows('pending'))[0].state).toBe('requested');const c=sample('cancelled');c.triggerEvent='BOOKING_CANCELLED';c.payload.status='CANCELLED';expect((await post(c)).status).toBe(200);const later=sample('cancelled');later.createdAt='2026-10-21T08:31:00Z';expect((await post(later)).status).toBe(200);expect((await rows('cancelled'))[0].state).toBe('cancelled');});
it('actual reschedule links original intake and refuses a second successor',async()=>{expect((await post(sample('old'))).status).toBe(200);const x={...sample('new',null),triggerEvent:'BOOKING_RESCHEDULED',payload:{...sample('new',null).payload,rescheduleUid:'old'}};expect((await post(x)).status).toBe(200);expect((await rows('old'))[0]).toMatchObject({state:'superseded',successor:'new'});expect((await rows('new'))[0]).toMatchObject({predecessor:'old',intake_ref:localRef});const bad={...x,payload:{...x.payload,uid:'other'}};expect((await post(bad)).status).toBe(409);expect(await rows('other')).toHaveLength(0);});
it('actual SQL failure returns503 without private details or partial delivery; retry succeeds once',async()=>{const before=await counts();await fixture.owner.query("CREATE FUNCTION booking_route_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.uid='fault' THEN RAISE EXCEPTION 'private fixture details'; END IF; RETURN NEW; END $$; CREATE TRIGGER booking_route_fixture_fail BEFORE INSERT ON ll_booking_reservations FOR EACH ROW EXECUTE FUNCTION booking_route_fixture_fail()");try{const r=await post(sample('fault'));expect(r.status).toBe(503);expect(await r.text()).not.toContain('private fixture details');expect(await counts()).toBe(before);expect(await rows('fault')).toHaveLength(0);}finally{await fixture.owner.query('DROP TRIGGER booking_route_fixture_fail ON ll_booking_reservations; DROP FUNCTION booking_route_fixture_fail()');}expect((await post(sample('fault'))).status).toBe(200);expect(await rows('fault')).toHaveLength(1);});
it('fails closed without owned configuration even with installed context',async()=>{const before=await counts();delete process.env.LOOPLABS_BOOKING_CONFIG;try{expect((await post(sample('disabled'))).status).toBe(503);expect(await counts()).toBe(before);}finally{process.env.LOOPLABS_BOOKING_CONFIG=file;}});

it('current actual installation inventory refuses fixture-added booking tables',async()=>{const installed=fixture.captureRecovery();await expect(installed.verify(fixture.owner)).rejects.toThrow('Reviewed tenant inventory mismatch');});

it('shared real sales admission bounds booking writes and allows retry after window expiry',async()=>{
 for(let i=0;i<10;i++)expect((await post(sample('budget-'+i))).status).toBe(200);
 const before=await counts();expect((await post(sample('budget-denied'))).status).toBe(429);expect(await counts()).toBe(before);expect(await rows('budget-denied')).toHaveLength(0);
 // Owner fault/time setup in the disposable fixture, never a runtime bypass.
 await fixture.owner.query("UPDATE ll_access_attempts SET window_start=now()-interval '301 seconds'");
 expect((await post(sample('budget-denied'))).status).toBe(200);expect(await rows('budget-denied')).toHaveLength(1);
});
