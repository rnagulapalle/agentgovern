import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { ConnectorControl } from "@/lib/connectors/service";
import { connectorProvider, HostedFetchSandboxConnectors } from "@/lib/connectors/hosted";
import { WorkflowControl } from "@/lib/workflows/service";
import { EnquiryControl } from "@/lib/enquiries/service";
import { fixtures, checkContact } from "@/lib/enquiries/contracts";
import { EnquiryChat } from "@/lib/enquiries/chat";
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
  return { actor, enquiries, twin, db };
}
export async function GET(r: NextRequest) {
  try {
    const { actor, enquiries, twin, db } = await context(r);
    const plans = await enquiries.list(actor);
    const status = (await db.query("SELECT last_tick, last_tick>now()-interval '30 seconds' AS healthy FROM ll_enquiry_worker_status WHERE org_id=$1", [actor.orgId])).rows[0];
    return Response.json({ connections: { mode: twin instanceof HostedFetchSandboxConnectors ? "hosted" : "private", crmAtomicVersion: !(twin instanceof HostedFetchSandboxConnectors), realDelivery: false, workerHealthy: Boolean(status?.healthy), lastTick: status?.last_tick || null }, fixtures, plans }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const { actor, enquiries, twin } = await context(r);
    const p = await body(r);
    let result;
    if (p.operation === "checkConnections" && Object.keys(p).length === 1) {
      await enquiries.list(actor); // Authorize the workspace before making a provider read.
      const contact = await enquiries.contact(); checkContact(contact);
      result = { checkedAt: new Date().toISOString(), crmReadable: true, sampleCustomer: contact.email, atomicVersion: !(twin instanceof HostedFetchSandboxConnectors), realDelivery: false };
    }
    else if (p.operation === "prepare" && Object.keys(p).length === 3 && typeof p.id === "string" && typeof p.fixtureId === "string")
      result = await enquiries.prepare(actor, p.id, p.fixtureId);
    else if (p.operation === "chat" && Object.keys(p).length === 3 && typeof p.id === "string")
      result = await new EnquiryChat(enquiries).respond(actor, p.id, p.turns);
    else if (p.operation === "rehearse" && Object.keys(p).length === 3 && typeof p.id === "string" && typeof p.planHash === "string")
      { if (twin instanceof HostedFetchSandboxConnectors) throw new ControlError(409, "Hosted CRM requires atomic approval-version enforcement before rehearsal. No actions were submitted."); result = await enquiries.rehearse(actor, p.id, p.planHash); }
    else if (p.operation === "start" && Object.keys(p).length === 5 && typeof p.id === "string" && typeof p.planHash === "string" && typeof p.crmAgent === "string" && typeof p.emailAgent === "string")
      result = await enquiries.start(actor, p.id, p.planHash, p.crmAgent, p.emailAgent);
    else throw new ControlError(400, "Choose a supported enquiry operation.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
