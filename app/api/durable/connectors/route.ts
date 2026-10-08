import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { ConnectorControl } from "@/lib/connectors/service";
import { savedProvider } from "@/lib/connectors/routing";
import { connectorProvider } from "@/lib/connectors/hosted";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function context(request: NextRequest,id?:string,proposal=false,operation?:unknown) {
  const db = database();
  const actor = await authenticate(db, credential(request));
  if(operation!==undefined && (typeof operation!=="string" || !["propose","contain","enable","approve","reject","execute","reconcile"].includes(operation)))throw new ControlError(400,"Unknown action.");
  return {
    actor,
    service: new ConnectorControl(db, id?await savedProvider(db,actor,proposal?"proposal":"action",id):connectorProvider()),
  };
}
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("action");
    const { actor, service } = await context(request,id||undefined);
    return Response.json(
      id ? await service.read(actor, id) : await service.snapshot(actor),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    sameOrigin(request);
    const { operation, ...p } = await body(request);
    const { actor, service } = await context(request,typeof p.actionId==="string"?p.actionId:undefined,operation==="propose",operation);
    let result;
    if (operation === "propose") result = await service.propose(actor, p);
    else if (operation === "contain" || operation === "enable") {
      if (Object.keys(p).length !== 1 || typeof p.connector !== "string")
        throw new ControlError(400, "Choose one connector to contain.");
      result =
        operation === "contain"
          ? await service.contain(actor, p.connector)
          : await service.enable(actor, p.connector);
    } else {
      const allowed =
        operation === "approve" || operation === "reject"
          ? ["actionId", "payloadHash"]
          : operation === "execute"
            ? ["actionId", "lostResponse"]
            : ["actionId"];
      if (
        Object.keys(p).some((k) => !allowed.includes(k)) ||
        typeof p.actionId !== "string" ||
        !/^[0-9a-f-]{36}$/i.test(p.actionId)
      )
        throw new ControlError(400, "A valid action ID is required.");
      if (operation === "approve" || operation === "reject") {
        if (typeof p.payloadHash !== "string")
          throw new ControlError(400, "Exact request hash required.");
        result = await service.review(
          actor,
          p.actionId,
          p.payloadHash,
          operation === "approve",
        );
      } else if (operation === "execute") {
        if (p.lostResponse !== undefined && typeof p.lostResponse !== "boolean")
          throw new ControlError(400, "Invalid simulation option.");
        result = await service.execute(
          actor,
          p.actionId,
          p.lostResponse === true,
        );
      } else if (operation === "reconcile")
        result = await service.reconcile(actor, p.actionId);
      else throw new ControlError(400, "Unknown action.");
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return failure(e);
  }
}
