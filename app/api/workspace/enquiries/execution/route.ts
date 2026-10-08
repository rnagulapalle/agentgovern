import { NextRequest } from "next/server";
import { database, transaction } from "@/lib/durable/database";
import { authenticate, authorize } from "@/lib/durable/service";
import { body, credential, failure, sameOrigin } from "@/lib/durable/http";
import { ControlError } from "@/lib/durable/contracts";
import { validId } from "@/lib/enquiries/contracts";
import { ConnectorControl } from "@/lib/connectors/service";
import { savedProvider } from "@/lib/connectors/routing";
import { HostedFetchSandboxConnectors } from "@/lib/connectors/hosted";
import { WorkflowControl } from "@/lib/workflows/service";
import { TemporalOutbox } from "@/runtime/temporal/outbox";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function context(r: NextRequest, id: unknown) {
  const db = database(), actor = await authenticate(db, credential(r));
  await transaction(db, actor.orgId, c => authorize(c, actor, ["operator"]));
  validId(id);
  const provider = await savedProvider(db,actor,"run",id);
  const run = await new WorkflowControl(db, new ConnectorControl(db, provider)).read(actor, id);
  return { db, actor, run, id, provider };
}
const enabled = () => process.env.LOOPLABS_TEMPORAL_WORKSPACE === "staging";
export async function GET(r: NextRequest) {
  try {
    const { db, actor, run, id, provider } = await context(r, r.nextUrl.searchParams.get("run"));
    if (!enabled()) return Response.json({ available: false }, { headers: { "Cache-Control": "no-store" } });
    const saved = (await db.query("SELECT d.state FROM ll_temporal_dispatch d JOIN ll_enquiry_plans p ON p.org_id=d.org_id AND p.id=d.plan_id WHERE p.org_id=$1 AND p.run_id=$2", [actor.orgId, id])).rows[0];
    const compatible=!provider.recordScope || (typeof process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID==="string" && /^ack-[a-f0-9]{64}$/.test(process.env.LOOPLABS_TEMPORAL_RECORD_BUILD_ID));
    const canTransfer = compatible && !(provider instanceof HostedFetchSandboxConnectors) && run.created_by === actor.subject && run.state === "active" && run.steps.length === 2 && run.steps.every((s: { state: string | null }) => ["held", "ready"].includes(s.state || ""));
    return Response.json({ available: true, owned: Boolean(saved), dispatch: saved?.state || null, canTransfer: !saved && canTransfer }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
export async function POST(r: NextRequest) {
  try {
    sameOrigin(r);
    const p = await body(r);
    if (p.operation !== "transfer" || Object.keys(p).length !== 2) throw new ControlError(400, "Choose a supported execution operation.");
    const { db, actor, id, provider } = await context(r, p.runId);
    if (!enabled()) throw new ControlError(409, "Durable scheduling is not enabled in this workspace.");
    if (provider instanceof HostedFetchSandboxConnectors) throw new ControlError(409, "Hosted CRM requires atomic source-version enforcement. Nothing was transferred.");
    await new TemporalOutbox(db).transfer(actor, id);
    return Response.json({ owned: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) { return failure(e); }
}
