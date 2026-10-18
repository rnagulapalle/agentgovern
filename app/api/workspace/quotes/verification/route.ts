import {NextRequest} from 'next/server';
import {tenantContext} from '../../../../../lib/workspace/tenant-context';
import {credential,failure,sameOrigin} from '../../../../../lib/durable/http';
import {ControlError} from '../../../../../lib/durable/contracts';
import {quoteDemo} from '../../../../../lib/quotes/demo-registry';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(r:NextRequest){try{
 if(r.headers.has('origin'))sameOrigin(r);if(r.headers.get('sec-fetch-site')==='cross-site')throw new ControlError(403,'Use the workspace site.');
 const entries=[...r.nextUrl.searchParams],q=r.nextUrl.searchParams,uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
 if(entries.length!==3||entries.map(([k])=>k).sort().join()!=='id,planHash,scope'||!uuid.test(q.get('scope')??'')||!uuid.test(q.get('id')??'')||!/^[a-f0-9]{64}$/.test(q.get('planHash')??''))throw new ControlError(400,'Choose an exact saved quote verification.');
 const {db,actor}=await tenantContext().member(credential(r));const result=await quoteDemo(db,q.get('scope')!).verification(actor,q.get('id')!,q.get('planHash')!);
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){const response=failure(e);response.headers.set('Cache-Control','no-store');return response;}}
