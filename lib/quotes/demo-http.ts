import { NextRequest } from 'next/server';
import { tenantContext } from '../workspace/tenant-context';
import { body,credential,failure,sameOrigin } from '../durable/http';
import { ControlError } from '../durable/contracts';
import { quoteDemo } from './demo-registry';
import { transaction } from '../durable/database';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
/** Quote-only strict mutation seam. A trusted server facade must already be
 * installed; no product or provider authority is constructed from request data. */
export async function quoteDemoPost(r:NextRequest){try{
 sameOrigin(r);if(r.headers.get('sec-fetch-site')==='cross-site')throw new ControlError(403,'Use the workspace site.');
 const p=await body(r),shapes:Record<string,string[]>={prepare:['operation','id','turns'],submit:['operation','id','planHash'],review:['operation','id','planHash','step','payloadHash','approve'],advance:['operation','id','planHash','step'],observe:['operation','id','planHash','step'],verify:['operation','id','planHash'],background:['operation','id','planHash'],resolve:['operation','id']};
 const keys=typeof p.operation==='string'?shapes[p.operation]:undefined;if(!keys||Object.keys(p).sort().join()!==[...keys].sort().join()||typeof p.id!=='string'||!uuid.test(p.id))throw new ControlError(400,'Choose a supported exact quote operation.');
 const entries=[...r.nextUrl.searchParams.entries()];if(entries.length!==1||entries[0][0]!=='scope'||!uuid.test(entries[0][1]))throw new ControlError(400,'Select one enrolled quote scope.');
 if(keys.includes('planHash')&&(typeof p.planHash!=='string'||!/^[a-f0-9]{64}$/.test(p.planHash)))throw new ControlError(400,'Review the exact saved quote first.');
 if(keys.includes('step')&&!['update','message'].includes(p.step as string)||keys.includes('payloadHash')&&(typeof p.payloadHash!=='string'||!/^[a-f0-9]{64}$/.test(p.payloadHash))||keys.includes('approve')&&typeof p.approve!=='boolean')throw new ControlError(400,'Choose an exact quote decision.');
 const {db,actor}=p.operation==='prepare'?await tenantContext().admitPlanner(credential(r)):await tenantContext().member(credential(r));
 const accessible=await transaction(db,actor.orgId,async c=>(await c.query("SELECT id FROM ll_connector_scopes WHERE org_id=$1 AND id=$2 AND active=true AND contract_version='private-quote-twin-1'",[actor.orgId,entries[0][1]])).rowCount===1);
 if(!accessible)throw new ControlError(403,'This quote scope is not accessible in your workspace.');
 const control=quoteDemo(db,entries[0][1]);let result;
 if(p.operation==='prepare')result=await control.prepare(actor,p.id,p.turns);
 else if(p.operation==='resolve')result=await control.resolve(actor,p.id);
 else if(p.operation==='submit')result=await control.submit(actor,p.id,p.planHash as string);
 else if(p.operation==='background')result=await control.background(actor,p.id,p.planHash as string);
 else if(p.operation==='review')result=await control.review(actor,p.id,p.planHash as string,p.step as 'update'|'message',p.payloadHash as string,p.approve as boolean);
 else if(p.operation==='verify')result=await control.verify(actor,p.id,p.planHash as string);
 else result=await control.advance(actor,p.id,p.planHash as string,p.step as 'update'|'message',p.operation==='observe');
 return Response.json(result,{headers:{'Cache-Control':'no-store'}});
 }catch(e){const response=failure(e);response.headers.set('Cache-Control','no-store');return response;}}
