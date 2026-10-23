import { createHash,createHmac,timingSafeEqual } from 'node:crypto';
import { parseSalesReceipt } from './sales-handoff';
import { ControlError } from '../durable/contracts';
export type BookingConfig=Readonly<{secret:string;eventTypeId:number;organizer:string;version:'2021-10-20';classification:'test'|'external'}>;
export type BookingEvent=Readonly<{deliveryDigest:string;bookingUid:string;predecessorBookingUid:string|null;event:string;occurredAt:string;state:'reserved'|'requested'|'cancelled';startsAt:string;endsAt:string;proposedIntakeReference:string|null}>;
const object=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x);
function fail():never{throw new ControlError(400,'Unverified booking event.');}
const time=(x:unknown):x is string=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(x)&&Number.isFinite(Date.parse(x));
export function parseBookingConfig(x:unknown):BookingConfig{
 if(!object(x)||Object.keys(x).sort().join()!=='classification,eventTypeId,organizer,secret,version'||typeof x.secret!=='string'||x.secret.length<32||x.secret.length>512||!Number.isSafeInteger(x.eventTypeId)||Number(x.eventTypeId)<=0||typeof x.organizer!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(x.organizer)||x.version!=='2021-10-20'||!['test','external'].includes(String(x.classification)))throw new ControlError(503,'Booking receiver unavailable.');
 return Object.freeze(x as unknown as BookingConfig);
}
export function normalizeBooking(raw:Buffer,signature:string|null,version:string|null,config:BookingConfig):BookingEvent{
 parseBookingConfig(config);
 if(!Buffer.isBuffer(raw)||raw.length===0||raw.length>131072||version!==config.version||typeof signature!=='string'||!/^[a-fA-F0-9]{64}$/.test(signature))fail();
 const expected=createHmac('sha256',config.secret).update(raw).digest();if(!timingSafeEqual(expected,Buffer.from(signature,'hex')))fail();
 let input:unknown;try{input=JSON.parse(raw.toString('utf8'));}catch{fail();}
 if(!object(input)||!object(input.payload)||!time(input.createdAt))fail();
 const p=input.payload;
 if(!['BOOKING_CREATED','BOOKING_REQUESTED','BOOKING_CANCELLED','BOOKING_RESCHEDULED'].includes(String(input.triggerEvent))||p.eventTypeId!==config.eventTypeId||!object(p.organizer)||p.organizer.username!==config.organizer||typeof p.uid!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(p.uid)||!time(p.startTime)||!time(p.endTime)||Date.parse(p.endTime)<=Date.parse(p.startTime))fail();
 const rescheduled=input.triggerEvent==='BOOKING_RESCHEDULED';
 if(rescheduled&&(typeof p.rescheduleUid!=='string'||!/^[-a-zA-Z0-9_]{1,128}$/.test(p.rescheduleUid)||p.rescheduleUid===p.uid))fail();
 if(!rescheduled&&p.rescheduleUid!==undefined&&p.rescheduleUid!==null)fail();
 let state:BookingEvent['state'];
 if(input.triggerEvent==='BOOKING_CANCELLED'&&(p.status===undefined||p.status==='CANCELLED'))state='cancelled';
 else if(input.triggerEvent==='BOOKING_REQUESTED'&&p.status==='PENDING')state='requested';
 else if(['BOOKING_CREATED','BOOKING_RESCHEDULED'].includes(String(input.triggerEvent))&&p.status==='ACCEPTED'&&p.requiresConfirmation===false)state='reserved';else fail();
 let ref:string|null=null;
 const metadata=object(p.metadata)?p.metadata.looplabs_intake_ref:undefined;
 if(metadata!==undefined&&metadata!==null){try{ref=parseSalesReceipt({received:true,intakeRef:metadata}).intakeRef;}catch{fail();}}
 return Object.freeze({deliveryDigest:createHash('sha256').update(raw).digest('hex'),bookingUid:p.uid,predecessorBookingUid:rescheduled?p.rescheduleUid as string:null,event:String(input.triggerEvent),occurredAt:new Date(input.createdAt).toISOString(),state,startsAt:new Date(p.startTime).toISOString(),endsAt:new Date(p.endTime).toISOString(),proposedIntakeReference:ref});
}
