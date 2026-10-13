import { NextRequest } from "next/server";
import { tenantContext } from "../../../../lib/workspace/tenant-context";
import { credential,failure,sameOrigin } from "../../../../lib/durable/http";
import { ControlError } from "../../../../lib/durable/contracts";
import { QuoteWorkflowReader } from "../../../../lib/quotes/read-service";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(r:NextRequest){try{
 if(r.headers.has("origin"))sameOrigin(r);
 if(r.headers.get("sec-fetch-site")==="cross-site")throw new ControlError(403,"Same-origin quote views are required.");
 const {db,actor}=await tenantContext().member(credential(r));
 const entries=[...r.nextUrl.searchParams];
 if(entries.length>1 || entries.some(([key,value])=>key!=="run" || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)))throw new ControlError(400,"Choose one exact saved quote workflow.");
 const reader=new QuoteWorkflowReader(db),id=r.nextUrl.searchParams.get("run");
 return Response.json(id?{view:await reader.read(actor,id)}:await reader.list(actor),{headers:{"Cache-Control":"no-store"}});
 }catch(e){return failure(e);}}

// Explicit trusted quote factory provisioning is required; unsupported scopes
// return503 rather than selecting an acknowledgement/sample provider.
export { quoteDemoPost as POST } from '../../../../lib/quotes/demo-http';
