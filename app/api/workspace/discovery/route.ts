import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { CloudInventoryStore } from "@/lib/workspace/cloud-inventory";
import { CloudDiscoveryOperations } from "@/lib/workspace/cloud-operations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const id = /^[a-zA-Z0-9_-]{1,64}$/;
export async function GET(r: NextRequest) {
  try {
    const db = database(), actor = await authenticate(db, credential(r));
    const params = r.nextUrl.searchParams;
    if ([...params.keys()].some(k => k !== "connectionId") || params.getAll("connectionId").length > 1)
      throw new ControlError(400, "Choose one saved discovery connection.");
    const connectionId = params.get("connectionId"), store = new CloudInventoryStore(db);
    if (connectionId !== null && !id.test(connectionId)) throw new ControlError(400, "Choose one saved discovery connection.");
    return Response.json(connectionId === null ? await new CloudDiscoveryOperations(store).connections(actor) : await store.latest(actor, connectionId), { headers });
  } catch (e) { return failure(e); }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const db = database(), actor = await authenticate(db, credential(r)), value = await body(r);
    if (Object.keys(value).sort().join() === "connectionId,operation" && value.operation === "scan" && typeof value.connectionId === "string" && id.test(value.connectionId)) {
      return Response.json(await new CloudDiscoveryOperations(new CloudInventoryStore(db)).scan(actor, value.connectionId), { headers });
    }
    if (Object.keys(value).sort().join() !== "accountId,connectionId,operation,region"
      || value.operation !== "configure" || typeof value.connectionId !== "string" || !id.test(value.connectionId)
      || typeof value.accountId !== "string" || !/^[0-9]{12}$/.test(value.accountId)
      || typeof value.region !== "string" || !/^[a-z]{2}-[a-z]+-[1-9]$/.test(value.region))
      throw new ControlError(400, "Enter a connection name, 12-digit AWS account and supported commercial region. Discovery only saves this scope.");
    const result = await new CloudInventoryStore(db).configureConnection(actor, {
      tenantId: actor.orgId, connectionId: value.connectionId, accountId: value.accountId, region: value.region,
    });
    return Response.json(result, { headers });
  } catch (e) { return failure(e); }
}
