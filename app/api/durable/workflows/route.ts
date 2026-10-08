import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { ConnectorControl } from "@/lib/connectors/service";
import { savedProvider } from "@/lib/connectors/routing";
import { connectorProvider } from "@/lib/connectors/hosted";
import { WorkflowControl } from "@/lib/workflows/service";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function context(r: NextRequest,id?:string|null,p?:Record<string,unknown>) {
  const db = database(),actor=await authenticate(db, credential(r));
  if(p){const keys=p.operation==="create"?["operation","runId","crmAgent","emailAgent"]:(p.operation==="pause"||p.operation==="verify")?["operation","runId"]:null;if(!keys || Object.keys(p).sort().join()!==keys.sort().join() || keys.some(k=>typeof p[k]!=="string"))throw new ControlError(400,"Choose a supported workflow operation.");}
  return {
    actor,
    service: new WorkflowControl(
      db,
      new ConnectorControl(db, id?await savedProvider(db,actor,"run",id):connectorProvider()),
    ),
  };
}
export async function GET(r: NextRequest) {
  try {
    const id = r.nextUrl.searchParams.get("run");
    const { actor, service } = await context(r,id);
    return Response.json(
      id ? await service.read(actor, id) : await service.list(actor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const p = await body(r);
    const { actor, service } = await context(r,p.operation!=="create" && typeof p.runId==="string"?p.runId:undefined,p);
    let result;
    if (
      p.operation === "create" &&
      Object.keys(p).length === 4 &&
      typeof p.crmAgent === "string" &&
      typeof p.emailAgent === "string" &&
      typeof p.runId === "string"
    )
      result = {
        id: await service.create(actor, p.crmAgent, p.emailAgent, p.runId),
      };
    else if (
      Object.keys(p).length === 2 &&
      typeof p.runId === "string" &&
      (p.operation === "pause" || p.operation === "verify")
    )
      result =
        p.operation === "pause"
          ? await service.pause(actor, p.runId)
          : await service.verify(actor, p.runId);
    else throw new ControlError(400, "Choose a supported workflow operation.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
