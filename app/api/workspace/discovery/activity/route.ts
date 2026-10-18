import { NextRequest } from "next/server";
import { tenantContext } from "../../../../../lib/workspace/tenant-context";
import { body, credential, failure, sameOrigin } from "../../../../../lib/durable/http";
import { CloudInventoryStore } from "../../../../../lib/workspace/cloud-inventory";
import { CloudActivityOperations } from "../../../../../lib/workspace/cloud-activity";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const { db, actor } = await tenantContext().authenticated(credential(request));
    const result = await new CloudActivityOperations(new CloudInventoryStore(db)).read(actor, await body(request));
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
