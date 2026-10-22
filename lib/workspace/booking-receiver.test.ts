import {afterEach,beforeAll,afterAll,expect,it,vi} from 'vitest';
import {createHmac,randomUUID} from 'node:crypto';
import {mkdtemp,writeFile,chmod,rm,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';import {join} from 'node:path';
import {normalizeBooking,parseBookingConfig} from './booking-event';
const deps=vi.hoisted(()=>({sales:vi.fn(),persist:vi.fn()}));
vi.mock('./tenant-context',()=>({tenantContext:()=>({sales:deps.sales})}));
vi.mock('./booking-store',()=>({persistBooking:deps.persist}));
import {POST} from '../../app/api/booking-events/route';
const config={secret:'a'.repeat(48),organizer:'looplabs-founder',eventTypeId:42,version:'2021-10-20' as const,classification:'test' as const};
const ref:string=randomUUID();const sample=()=>({triggerEvent:'BOOKING_CREATED',createdAt:'2026-10-20T08:30:00Z',payload:{uid:'booking-one',eventTypeId:42,organizer:{username:config.organizer},startTime:'2026-10-22T16:00:00Z',endTime:'2026-10-22T16:30:00Z',status:'ACCEPTED',requiresConfirmation:false,metadata:{looplabs_intake_ref:ref},attendees:[{email:'never-store@example.test',name:'Private attendee'}]}});
const raw=(x:unknown)=>Buffer.from(JSON.stringify(x));const sign=(b:Buffer)=>createHmac('sha256',config.secret).update(b).digest('hex');
let dir:string,file:string;const previous=process.env.LOOPLABS_BOOKING_CONFIG;
beforeAll(async()=>{dir=await realpath(await mkdtemp(join(tmpdir(),'ll-booking-route-')));await chmod(dir,0o700);file=join(dir,'config.json');await writeFile(file,JSON.stringify(config),{mode:0o600});});
afterEach(()=>{vi.clearAllMocks();if(previous===undefined)delete process.env.LOOPLABS_BOOKING_CONFIG;else process.env.LOOPLABS_BOOKING_CONFIG=previous;});
afterAll(async()=>{await rm(dir,{recursive:true,force:true})});
function request(b:Buffer,signature=sign(b),version=config.version){return new Request('http://localhost/api/booking-events',{method:'POST',headers:{'content-type':'application/json','x-cal-signature-256':signature,'x-cal-webhook-version':version},body:new Uint8Array(b)});}
it('uses actual UUID receipt contract and strips attendee content',()=>{const b=raw(sample()),e=normalizeBooking(b,sign(b),config.version,config);expect(e.proposedIntakeReference).toBe(ref);expect(e.state).toBe('reserved');expect(JSON.stringify(e)).not.toContain('never-store');expect(JSON.stringify(e)).not.toContain('attendees');});
it.each(['bad signature','wrong organizer','wrong event','wrong version','invalid time','invalid metadata','requested not confirmed','malformed body'])('refuses %s before tenant selection',async kind=>{process.env.LOOPLABS_BOOKING_CONFIG=file;const x=sample();let version:string=config.version;if(kind==='wrong organizer')x.payload.organizer.username='other';if(kind==='wrong event')x.payload.eventTypeId=43;if(kind==='wrong version')version='unsupported';if(kind==='invalid time')x.payload.endTime=x.payload.startTime;if(kind==='invalid metadata')x.payload.metadata.looplabs_intake_ref='f'.repeat(64);if(kind==='requested not confirmed')x.payload.requiresConfirmation=true;const b=kind==='malformed body'?Buffer.from('{'):raw(x);const response=await POST(request(b,kind==='bad signature'?'0'.repeat(64):sign(b),version as typeof config.version));expect(response.status).toBe(400);expect(deps.sales).not.toHaveBeenCalled();expect(deps.persist).not.toHaveBeenCalled();});
it('is disabled without owned configuration',async()=>{delete process.env.LOOPLABS_BOOKING_CONFIG;expect((await POST(request(raw(sample())))).status).toBe(503);expect(deps.sales).not.toHaveBeenCalled();});
it('passes verified minimized data to actual configured-workspace/store interfaces',async()=>{process.env.LOOPLABS_BOOKING_CONFIG=file;const db={};deps.sales.mockResolvedValue(db);deps.persist.mockResolvedValue({received:true,replay:false});const r=await POST(request(raw(sample())));expect(r.status).toBe(200);expect(r.headers.get('cache-control')).toBe('no-store');expect(await r.json()).toEqual({received:true,replay:false});expect(deps.sales).toHaveBeenCalledOnce();expect(deps.persist).toHaveBeenCalledWith(db,config,expect.objectContaining({proposedIntakeReference:ref,state:'reserved'}));});
it('does not claim success on storage failure',async()=>{process.env.LOOPLABS_BOOKING_CONFIG=file;deps.sales.mockResolvedValue({});deps.persist.mockRejectedValue(Error('private details'));const r=await POST(request(raw(sample())));expect(r.status).toBe(503);expect(await r.text()).not.toContain('private details');});
it('separates requested and cancelled from confirmed reservation',()=>{const x=sample();x.triggerEvent='BOOKING_REQUESTED';x.payload.status='PENDING';let b=raw(x);expect(normalizeBooking(b,sign(b),config.version,config).state).toBe('requested');x.triggerEvent='BOOKING_CANCELLED';x.payload.status='CANCELLED';b=raw(x);expect(normalizeBooking(b,sign(b),config.version,config).state).toBe('cancelled');});
it('requires a valid predecessor only on replacement events',()=>{const x={...sample(),triggerEvent:'BOOKING_RESCHEDULED',payload:{...sample().payload,rescheduleUid:'old-booking'}};let b=raw(x);expect(normalizeBooking(b,sign(b),config.version,config).predecessorBookingUid).toBe('old-booking');x.payload.rescheduleUid=x.payload.uid;b=raw(x);expect(()=>normalizeBooking(b,sign(b),config.version,config)).toThrow();});
it('refuses unknown config, empty body and oversized input',()=>{expect(()=>parseBookingConfig({...config,workspace:'user-selected'})).toThrow();for(const b of [Buffer.alloc(0),Buffer.alloc(131073)])expect(()=>normalizeBooking(b,sign(b),config.version,config)).toThrow();});

it('keeps the unreviewed receiver outside installed public capabilities',async()=>{
 const {deploymentRouteDecision}=await import('./deployment-capabilities');
 for(const profile of ['isolated-control-demo-1','isolated-quote-demo-1'])for(const method of ['GET','POST','PUT','DELETE'])expect(deploymentRouteDecision(profile,'/api/booking-events',method)).toBe('deny');
});

it('preserves configured sales admission denial without writing a booking',async()=>{process.env.LOOPLABS_BOOKING_CONFIG=file;const {ControlError}=await import('../durable/contracts');deps.sales.mockRejectedValue(new ControlError(429,'Too many requests. Please try again later.'));const r=await POST(request(raw(sample())));expect(r.status).toBe(429);expect(deps.persist).not.toHaveBeenCalled();});
