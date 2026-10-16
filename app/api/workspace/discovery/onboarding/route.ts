import { NextRequest } from "next/server";
import { tenantContext } from "../../../../../lib/workspace/tenant-context";
import { body, credential, failure, sameOrigin } from "../../../../../lib/durable/http";
import { CloudInventoryStore } from "../../../../../lib/workspace/cloud-inventory";
import { CloudOwnerReviewStore } from "../../../../../lib/workspace/cloud-owner-review";
import { CloudObservationStore } from "../../../../../lib/workspace/cloud-observation-store";
import { CloudObservationOperations } from "../../../../../lib/workspace/cloud-observation-operations";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 try{sameOrigin(request);const {db,actor}=await tenantContext().authenticated(credential(request));
  const result=await new CloudObservationOperations(new CloudObservationStore(db),new CloudInventoryStore(db),new CloudOwnerReviewStore(db)).perform(actor,await body(request));
  return Response.json(result,{headers:{"Cache-Control":"no-store"}});
 }catch(error){return failure(error);}
}
