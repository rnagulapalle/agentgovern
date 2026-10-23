import type { Pool } from 'pg';
import { assertTenantPool } from '../durable/tenant-pool';
import { ControlError } from '../durable/contracts';
import type { BookingConfig,BookingEvent } from './booking-event';
const conflict=():never=>{throw new ControlError(409,'Booking relation refused.');};
/** Actual application store. No attendance/qualification is derived from a reservation. */
export async function persistBooking(pool:Pool,config:BookingConfig,event:BookingEvent){
 const binding=await assertTenantPool(pool);if(binding.purpose!=='web')throw new ControlError(403,'Booking web context required.');
 const scope=JSON.stringify([binding.org,config.organizer,config.eventTypeId,config.classification]);const db=await pool.connect();
 try{
  await db.query('BEGIN');await assertTenantPool(db,binding.org);
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[scope]);
  const inserted=await db.query('INSERT INTO ll_booking_deliveries(org_id,scope,digest) VALUES($1,$2,$3) ON CONFLICT DO NOTHING RETURNING digest',[binding.org,scope,event.deliveryDigest]);
  if(!inserted.rowCount){await db.query('COMMIT');return {received:true as const,replay:true};}
  const get=async(uid:string)=>(await db.query('SELECT * FROM ll_booking_reservations WHERE org_id=$1 AND scope=$2 AND uid=$3',[binding.org,scope,uid])).rows[0];
  const current=await get(event.bookingUid);
  const lookup=event.proposedIntakeReference?(await db.query('SELECT id FROM ll_sales_requests WHERE org_id=$1 AND id=$2',[binding.org,event.proposedIntakeReference])).rows[0]?.id:null;
  // Supplied correlation must resolve in this server-selected tenant. Never persist a foreign reference.
  if(event.proposedIntakeReference&&!lookup)throw new ControlError(400,'Booking correlation refused.');
  let ref:string|null=lookup??null;
  if(current?.intake_ref&&ref&&current.intake_ref!==ref)conflict();ref=current?.intake_ref??ref;
  if(event.predecessorBookingUid){
   const old=await get(event.predecessorBookingUid);
   if(!old||old.state==='cancelled'||old.successor&&old.successor!==event.bookingUid||current?.predecessor&&current.predecessor!==old.uid||current?.state==='superseded'||current?.successor)conflict();
   if(old.intake_ref&&ref&&old.intake_ref!==ref)conflict();ref=old.intake_ref??ref;
   await db.query("UPDATE ll_booking_reservations SET state='superseded',successor=$4 WHERE org_id=$1 AND scope=$2 AND uid=$3",[binding.org,scope,old.uid,event.bookingUid]);
   if(current?.state==='cancelled')await db.query('UPDATE ll_booking_reservations SET predecessor=$4,intake_ref=COALESCE(intake_ref,$5) WHERE org_id=$1 AND scope=$2 AND uid=$3',[binding.org,scope,event.bookingUid,old.uid,ref]);
   else await db.query("INSERT INTO ll_booking_reservations(org_id,scope,uid,state,occurred_at,intake_ref,predecessor,classification,starts_at,ends_at) VALUES($1,$2,$3,'reserved',$4,$5,$6,$7,$8,$9) ON CONFLICT(org_id,scope,uid) DO UPDATE SET predecessor=EXCLUDED.predecessor,intake_ref=COALESCE(ll_booking_reservations.intake_ref,EXCLUDED.intake_ref),state='reserved',occurred_at=GREATEST(ll_booking_reservations.occurred_at,EXCLUDED.occurred_at),starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at",[binding.org,scope,event.bookingUid,event.occurredAt,ref,old.uid,config.classification,event.startsAt,event.endsAt]);
  }else if(current?.state==='cancelled'||current?.state==='superseded'){
   // A delayed creation cannot reactivate a cancelled or replaced UID.
  }else if(event.state==='cancelled'||!current||Date.parse(event.occurredAt)>=new Date(current.occurred_at).getTime()&&!(current.state==='reserved'&&event.state==='requested')){
   await db.query('INSERT INTO ll_booking_reservations(org_id,scope,uid,state,occurred_at,intake_ref,classification,starts_at,ends_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(org_id,scope,uid) DO UPDATE SET state=EXCLUDED.state,occurred_at=EXCLUDED.occurred_at,intake_ref=COALESCE(ll_booking_reservations.intake_ref,EXCLUDED.intake_ref),starts_at=EXCLUDED.starts_at,ends_at=EXCLUDED.ends_at',[binding.org,scope,event.bookingUid,event.state,event.occurredAt,ref,config.classification,event.startsAt,event.endsAt]);
  }
  await db.query('COMMIT');return {received:true as const,replay:false};
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
