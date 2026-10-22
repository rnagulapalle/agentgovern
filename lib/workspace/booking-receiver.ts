import { readOwnedPrivateFile } from './owned-private-file';
import { tenantContext } from './tenant-context';
import { normalizeBooking,parseBookingConfig } from './booking-event';
import { persistBooking } from './booking-store';
import { ControlError } from '../durable/contracts';
import { failure } from '../durable/http';
/** Disabled without an owned server configuration. No browser tenant or source authority. */
export async function receiveBooking(request:Request){
 try{
  const file=process.env.LOOPLABS_BOOKING_CONFIG;if(!file)throw new ControlError(503,'Booking receiver unavailable.');
  const config=parseBookingConfig(JSON.parse((await readOwnedPrivateFile(file,4096)).bytes.toString('utf8')));
  if(request.headers.get('content-type')?.split(';')[0].trim()!=='application/json')throw new ControlError(400,'JSON required.');
  const reader=request.body?.getReader();if(!reader)throw new ControlError(400,'Booking body required.');
  const chunks:Buffer[]=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>131072){await reader.cancel();throw new ControlError(413,'Booking body too large.');}chunks.push(Buffer.from(part.value));}}finally{reader.releaseLock();}
  const event=normalizeBooking(Buffer.concat(chunks),request.headers.get('x-cal-signature-256'),request.headers.get('x-cal-webhook-version'),config);
  // Reuse configured sales admission after signature/scope checks. The shared
  // ten-per-five-minute budget may return429; no booking write occurs then.
  const db=await tenantContext().sales();const result=await persistBooking(db,config,event);
  return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){return failure(e);}
}
