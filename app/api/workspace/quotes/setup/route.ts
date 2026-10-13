import { NextRequest } from 'next/server';
import { tenantContext } from '../../../../../lib/workspace/tenant-context';
import { credential,failure,sameOrigin } from '../../../../../lib/durable/http';
import { ControlError } from '../../../../../lib/durable/contracts';
import { configuredQuoteDemos } from '../../../../../lib/quotes/demo-registry';
export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Read-only actual enrolled configuration. No fixture or guessed default scope. */
export async function GET(r:NextRequest){try{
 if(r.headers.has('origin'))sameOrigin(r);if(r.headers.get('sec-fetch-site')==='cross-site')throw new ControlError(403,'Use the workspace site.');if([...r.nextUrl.searchParams].length)throw new ControlError(400,'Quote configuration does not accept destination overrides.');
 const {db,actor}=await tenantContext().member(credential(r)),scopes=[];
 for(const control of configuredQuoteDemos(db)){const scope=await control.catalog(actor);if(scope)scopes.push({...scope,plans:await control.savedRequests(actor)});}
 return Response.json({viewer:actor.subject,scopes,available:scopes.length>0},{headers:{'Cache-Control':'no-store'}});
 }catch(e){const r=failure(e);r.headers.set('Cache-Control','no-store');return r;}}
