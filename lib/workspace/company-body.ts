import type {NextRequest} from 'next/server';
import {ControlError} from '../durable/contracts';
/** Dedicated, bounded business directory payload; ordinary action bodies stay8KiB. */
export async function companyBody(request:NextRequest):Promise<Record<string,unknown>>{
 if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ControlError(415,'Send application/json.');
 const reader=request.body?.getReader();if(!reader)throw new ControlError(400,'Company directory is required.');
 const chunks:Uint8Array[]=[];let size=0;
 for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>262144){await reader.cancel();throw new ControlError(413,'Company directory is too large.');}chunks.push(value);}
 let value;try{value=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ControlError(400,'Send a valid company directory.');}
 if(!value||typeof value!=='object'||Array.isArray(value))throw new ControlError(400,'Send a valid company directory.');return value;
}
