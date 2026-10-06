import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { ConnectorControl } from "@/lib/connectors/service";
import { connectorProvider } from "@/lib/connectors/hosted";
import { WorkflowControl } from "@/lib/workflows/service";
import { EnquiryControl } from "@/lib/enquiries/service";
import { fixtures } from "@/lib/enquiries/contracts";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function context(r: NextRequest) {
  const db = database();
  const actor = await authenticate(db, credential(r));
  const twin = connectorProvider();
  const workflows = new WorkflowControl(db, new ConnectorControl(db, twin));
  const enquiries = new EnquiryControl(db, workflows, async () => {
    const record = await twin.contact();
    return { id: record.id, email: record.properties?.email, version: record.updatedAt, lifecycle: record.properties?.lifecyclestage };
  });
  return { actor, enquiries };
}
export async function GET(r: NextRequest) {
  try {
    const { actor, enquiries } = await context(r);
    return Response.json({ fixtures, plans: await enquiries.list(actor) }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const { actor, enquiries } = await context(r);
    const p = await body(r);
    let result;
    if (p.operation === "prepare" && Object.keys(p).length === 3 && typeof p.id === "string" && typeof p.fixtureId === "string")
      result = await enquiries.prepare(actor, p.id, p.fixtureId);
    else if (p.operation === "start" && Object.keys(p).length === 5 && typeof p.id === "string" && typeof p.planHash === "string" && typeof p.crmAgent === "string" && typeof p.emailAgent === "string")
      result = await enquiries.start(actor, p.id, p.planHash, p.crmAgent, p.emailAgent);
    else throw new ControlError(400, "Choose a supported enquiry operation.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
