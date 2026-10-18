import { ControlError, type Actor } from "../durable/contracts";
import { transaction } from "../durable/database";
import { reviewedMessageV2 } from "../connectors/content";
import { enquiryMembershipCurrent } from "../workspace/membership-authority";
import { validId } from "./contracts";
import { EnquiryControl } from "./service";

// Deliberately explicit typed refinement, not arbitrary natural-language interpretation.
// The UI may offer this command seam; no transcript or execution permission is saved.
export class EnquiryRefinement {
  constructor(readonly enquiries: EnquiryControl) {}
  async respond(actor: Actor, revisionId: string, parentId: string, parentHash: string, typed: unknown) {
    validId(revisionId); validId(parentId);
    const lifecycle = await transaction(this.enquiries.db,actor.orgId,async c=>{
      await this.enquiries.policies(c,actor);
      const parent=(await c.query("SELECT created_by,plan,plan_hash FROM ll_enquiry_plans WHERE org_id=$1 AND id=$2",[actor.orgId,parentId])).rows[0];
      if (!parent || parent.created_by !== actor.subject || parent.plan_hash !== parentHash || !(await enquiryMembershipCurrent(c,actor.orgId,parentId))) throw new ControlError(409,"Open your current reviewed plan before refining its message.");
      if (!["lead","customer"].includes(parent.plan?.crm?.lifecycle)) throw new ControlError(409,"The original record stage is unsupported.");
      return parent.plan.crm.lifecycle as "lead"|"customer";
    });
    if (typeof typed !== "string" || typed.length > 960) throw new ControlError(400,"Type only Subject: and Message: for one bounded acknowledgement.");
    const match=/^Subject: ([^\r\n]+)\nMessage: ([\s\S]+)$/.exec(typed);
    if (!match) throw new ControlError(400,"Type only Subject: and Message:. Other workflow changes are unsupported.");
    const message=reviewedMessageV2({version:"reviewed-acknowledgement-2",subject:match[1],text:match[2]});
    return this.enquiries.revise(actor,revisionId,{parentId,parentHash,lifecycle,message});
  }
}
