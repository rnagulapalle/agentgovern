import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { CloudInventoryStore } from "@/lib/workspace/cloud-inventory";
import { projectDiscoveryScope } from "@/lib/workspace/cloud-project-discovery";
import { CloudDiscoveryOperations } from "@/lib/workspace/cloud-operations";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const id = /^[a-zA-Z0-9_-]{1,64}$/;
export async function GET(r: NextRequest) {
  try {
    const db = database(), actor = await authenticate(db, credential(r));
    const params = r.nextUrl.searchParams;
    if ([...params.keys()].some(k => !["connectionId", "kind"].includes(k)) || params.getAll("connectionId").length > 1 || params.getAll("kind").length > 1 || (params.has("kind") && params.get("kind") !== "project"))
      throw new ControlError(400, "Choose one saved discovery connection.");
    const connectionId = params.get("connectionId"), store = new CloudInventoryStore(db);
    if (connectionId !== null && !id.test(connectionId)) throw new ControlError(400, "Choose one saved discovery connection.");
    if (params.get("kind") === "project") return Response.json(connectionId === null ? await store.projectConnections(actor) : await store.latestProject(actor, connectionId), { headers });
    return Response.json(connectionId === null ? await new CloudDiscoveryOperations(store).connections(actor) : await store.latest(actor, connectionId), { headers });
  } catch (e) { return failure(e); }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const db = database(), actor = await authenticate(db, credential(r)), value = await body(r);
    if (value.operation === "configure-project") {
      const keys = Object.keys(value).sort().join();
      if (!(value.provider === "azure-foundry" && keys === "connectionId,directoryId,endpoint,operation,provider"
        || value.provider === "google-agent-engine" && keys === "connectionId,location,operation,projectId,projectNumber,provider")
        || typeof value.connectionId !== "string" || !id.test(value.connectionId)
        || (value.provider === "azure-foundry" ? ["directoryId", "endpoint"] : ["projectId", "projectNumber", "location"]).some(k => typeof value[k] !== "string")) throw new ControlError(400, "Enter only the reviewed project scope. Credentials and execution authority are not accepted.");
      let scope;
      try { scope = projectDiscoveryScope(value.provider === "azure-foundry"
        ? { provider: "azure-foundry", tenantId: actor.orgId, connectionId: value.connectionId, directoryId: value.directoryId as string, endpoint: value.endpoint as string }
        : { provider: "google-agent-engine", tenantId: actor.orgId, connectionId: value.connectionId, projectId: value.projectId as string, projectNumber: value.projectNumber as string, location: value.location as string }); }
      catch { throw new ControlError(400, "Enter a valid reviewed Azure or Google project scope."); }
      return Response.json(await new CloudInventoryStore(db).configureProjectConnection(actor, scope), { headers });
    }
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
