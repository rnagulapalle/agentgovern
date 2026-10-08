import { NextRequest } from "next/server";
import { database } from "@/lib/durable/database";
import { authenticate } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { ConnectorControl } from "@/lib/connectors/service";
import { HostedFetchSandboxConnectors } from "@/lib/connectors/hosted";
import { WorkflowControl } from "@/lib/workflows/service";
import { EnquiryControl } from "@/lib/enquiries/service";
import { fixtures, checkContact } from "@/lib/enquiries/contracts";
import { savedProvider,selectedProvider } from "@/lib/connectors/routing";
import { submitScoped } from "@/lib/enquiries/submission";
import { EnquiryChat } from "@/lib/enquiries/chat";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function context(r: NextRequest,p?:Record<string,unknown>) {
  const db = database();
  const actor = await authenticate(db, credential(r));
  if(p){
    const shapes:Record<string,string[]>={checkConnections:["operation"],prepare:["operation","id","fixtureId"],chat:["operation","id","turns"],rehearse:["operation","id","planHash"],start:["operation","id","planHash","crmAgent","emailAgent"],submit:["operation","id","planHash","crmAgent","emailAgent"],resume:["operation","id","planHash"]};
    const keys=typeof p.operation==="string"?shapes[p.operation]:undefined;
    if(keys?.includes("planHash") && (typeof p.planHash!=="string" || !/^[a-f0-9]{64}$/.test(p.planHash)))throw new ControlError(400,"Review the exact saved plan first.");
    if(!keys || Object.keys(p).sort().join()!==[...keys].sort().join() || keys.some(k=>k!=="turns" && typeof p[k]!=="string"))throw new ControlError(400,"Choose a supported enquiry operation.");
  }
  const selected=r.nextUrl.searchParams.get("scope");
  const twin = p && typeof p.id === "string" ? await savedProvider(db,actor,"plan",p.id,selected,p.operation === "chat" || p.operation === "prepare") : await selectedProvider(db,actor,selected);
  if(twin.recordScope && (p?.operation==="start" || p?.operation==="rehearse"))throw new ControlError(409,"Use reviewed record submission with explicitly granted agents and a compatible durable runner. No new work was submitted.");
  const workflows = new WorkflowControl(db, new ConnectorControl(db, twin));
  const enquiries = new EnquiryControl(db, workflows, async () => {
    const record = await twin.contact();
    return { id: record.id, email: record.properties?.email, version: record.updatedAt, lifecycle: record.properties?.lifecyclestage };
  }, twin.contactId || "1001");
  return { actor, enquiries, twin, db };
}
export async function GET(r: NextRequest) {
  try {
    const { actor, enquiries, twin, db } = await context(r);
    const plans = await enquiries.list(actor);
    const recordDurableAvailable=Boolean(twin.recordScope && process.env.LOOPLABS_TEMPORAL_WORKSPACE==="staging" && /^ack-[a-f0-9]{64}$/.test(process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID||"") && (await db.query("SELECT to_regclass('ll_temporal_record_routes') AS present")).rows[0].present);
    const status = (await db.query("SELECT last_tick, last_tick>now()-interval '30 seconds' AS healthy FROM ll_enquiry_worker_status WHERE org_id=$1", [actor.orgId])).rows[0];
    return Response.json({ connections: { mode: twin instanceof HostedFetchSandboxConnectors ? "hosted" : "private", crmAtomicVersion: !(twin instanceof HostedFetchSandboxConnectors), realDelivery: false,recordDurableAvailable,selectedRecipient:twin.recordScope?.recipient||"customer@example.test", workerHealthy: Boolean(status?.healthy), lastTick: status?.last_tick || null }, fixtures, plans }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const p = await body(r);
    const { actor, enquiries, twin } = await context(r,p);
    let result;
    if (p.operation === "checkConnections" && Object.keys(p).length === 1) {
      await enquiries.list(actor); // Authorize the workspace before making a provider read.
      const contact = await enquiries.contact(); checkContact(contact, enquiries.contactId,twin.recordScope?.recipient);
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
    else if ((p.operation === "submit" && Object.keys(p).length === 5 && typeof p.crmAgent === "string" && typeof p.emailAgent === "string") || (p.operation === "resume" && Object.keys(p).length === 3)) {
      if(typeof p.id!=="string" || typeof p.planHash!=="string")throw new ControlError(400,"Choose exact saved work.");
      if(process.env.LOOPLABS_TEMPORAL_WORKSPACE!=="staging")throw new ControlError(409,"Durable scheduling is not enabled in this workspace. No new work was submitted.");
      let crm=p.crmAgent as string,email=p.emailAgent as string;
      if(p.operation==="resume"){const run=await enquiries.workflows.read(actor,p.id);crm=run.steps[0].agent_id;email=run.steps[1].agent_id;}
      result=await submitScoped(enquiries,actor,p.id,p.planHash,crm,email);
    }
    else throw new ControlError(400, "Choose a supported enquiry operation.");
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
