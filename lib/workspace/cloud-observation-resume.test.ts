import { expect, it, vi } from "vitest";
import { CloudObservationOperations } from "./cloud-observation-operations";
import { ControlError, type Actor } from "../durable/contracts";
import type { CloudObservationStore } from "./cloud-observation-store";
import type { CloudInventoryStore } from "./cloud-inventory";
import type { CloudOwnerReviewStore } from "./cloud-owner-review";
const request={operation:"enrollment",connectionId:"aws",scanId:"11111111-1111-4111-8111-111111111111",resourceArn:"arn:aws:bedrock-agentcore:us-west-2:342206308838:runtime/assistant-1234567890",version:"10"};
const actor={} as Actor;
function fixture(error?:Error){
 const saved={displayName:"Pricing agent",owner:"owner@example.test",logGroup:"/company/events"};
 const enrollment=error?vi.fn().mockRejectedValue(error):vi.fn().mockResolvedValue(saved);
 const access=vi.fn().mockRejectedValue(Error("AWS temporarily unavailable"));
 const store={context:vi.fn().mockResolvedValue({}),admit:vi.fn().mockResolvedValue(true),enrollment} as unknown as CloudObservationStore;
 return {saved,enrollment,access,store,run:new CloudObservationOperations(store,{} as CloudInventoryStore,{} as CloudOwnerReviewStore,access)};
}
it("resumes saved onboarding from authenticated storage even when AWS is unavailable",async()=>{
 const f=fixture();expect(await f.run.perform(actor,request)).toEqual({enrollment:f.saved});expect(f.access).not.toHaveBeenCalled();expect(f.enrollment).toHaveBeenCalledWith(actor,{connectionId:request.connectionId,scanId:request.scanId,resourceArn:request.resourceArn,version:request.version});
});
it("only an explicitly absent enrollment becomes the first-time onboarding state",async()=>{
 const f=fixture(new ControlError(409,"Onboard this agent for observation before opening its history."));expect(await f.run.perform(actor,request)).toEqual({enrollment:null});
});
it.each([new ControlError(403,"Member access revoked"),new ControlError(409,"Review the agent owner and observation source again after access or recovery changes."),new Error("Storage unavailable")])("does not hide revoked, recovery-invalidated or unavailable enrollment",async error=>{
 const f=fixture(error);await expect(f.run.perform(actor,request)).rejects.toBe(error);expect(f.access).not.toHaveBeenCalled();
});
it("rejects malformed agent references before reading enrollment",async()=>{
 const f=fixture();await expect(f.run.perform(actor,{...request,resourceArn:"not-an-arn"})).rejects.toThrow();expect(f.enrollment).not.toHaveBeenCalled();
});

it("saved onboarding does not consume or depend on the live AWS request allowance",async()=>{
 const f=fixture();vi.mocked(f.store.admit).mockResolvedValue(false);
 for(let n=0;n<20;n++)expect(await f.run.perform(actor,request)).toEqual({enrollment:f.saved});
 expect(f.store.context).toHaveBeenCalledTimes(20);expect(f.enrollment).toHaveBeenCalledTimes(20);
 expect(f.store.admit).not.toHaveBeenCalled();expect(f.access).not.toHaveBeenCalled();
});
it("live AWS operations still refuse an exhausted observation allowance before provider access",async()=>{
 const f=fixture();vi.mocked(f.store.admit).mockResolvedValue(false);
 await expect(f.run.perform(actor,{operation:"sources",connectionId:request.connectionId})).rejects.toMatchObject({status:429});
 expect(f.store.admit).toHaveBeenCalledWith(actor,request.connectionId);expect(f.access).not.toHaveBeenCalled();
});
it("saved onboarding still requires current connection authority before reading storage",async()=>{
 const f=fixture(),error=new ControlError(403,"Member access revoked");vi.mocked(f.store.context).mockRejectedValue(error);
 await expect(f.run.perform(actor,request)).rejects.toBe(error);
 expect(f.enrollment).not.toHaveBeenCalled();expect(f.store.admit).not.toHaveBeenCalled();expect(f.access).not.toHaveBeenCalled();
});
