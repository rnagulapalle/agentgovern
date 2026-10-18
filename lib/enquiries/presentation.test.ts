import {expect,it} from "vitest";
import {savedMessage,runProgress} from "./presentation";
it("renders the exact saved recipient and content without a template fallback",()=>{
 expect(savedMessage({to:["alice@example.test"],subject:"Original subject",text:"Original message"})).toEqual({recipient:"alice@example.test",subject:"Original subject",text:"Original message"});
 for(const body of [null,{},[],{to:[],subject:"S",text:"T"},{to:["a","b"],subject:"S",text:"T"},{to:[1],subject:"S",text:"T"},{to:[""],subject:"S",text:"T"},{to:["a"],subject:1,text:"T"},{to:["a"],subject:"",text:"T"},{to:["a"],subject:"S",text:null},{to:["a"],subject:"S",text:""}])expect(savedMessage(body)).toBeNull();
});
const pair=[{ordinal:1,connector:"crm",action_id:"crm-action",state:"succeeded",evidence:{outcome:"verified"}},{ordinal:2,connector:"email",action_id:"email-action",state:"succeeded",evidence:{outcome:"verified"}}];
it("shows a verification receipt only for a completed exact pair with verified effects",()=>{
 expect(runProgress("completed",pair)).toMatchObject({title:"Acknowledgement verified",receipt:true});
 for(const steps of [[],[pair[0]],pair.map(s=>({...s,evidence:undefined})),pair.map(s=>({...s,state:"held"})),[pair[0],{...pair[1],evidence:{outcome:"unknown"}}],[pair[0],{...pair[1],action_id:pair[0].action_id}],[pair[0],{...pair[1],connector:"crm"}],[pair[0],{...pair[1],ordinal:1}]])expect(runProgress("completed",steps)).toMatchObject({title:"Saved outcome needs review",receipt:false,incomplete:false});
});
it("keeps incomplete submission distinct from approval and verified completion",()=>{
 const p=runProgress("active",pair.map(s=>({...s,state:null})));expect(p).toMatchObject({title:"Submission incomplete",receipt:false,incomplete:true});expect(p.text).toContain("not all actions were submitted");
 expect(runProgress("active",[pair[0],{...pair[1],state:null}])).toMatchObject({incomplete:true,receipt:false});
 expect(runProgress("active",pair.map(s=>({...s,state:"held"})))).toMatchObject({title:"Customer acknowledgement",incomplete:false,receipt:false});
 expect(runProgress("active",pair.map(s=>({...s,state:"ready"})))).toMatchObject({title:"Approved work queued",receipt:false});
 expect(runProgress("active",pair)).toMatchObject({title:"Final verification pending",receipt:false});
});
it("contains paused, conflicting, uncertain and unknown presentation without unsafe completion claims",()=>{
 expect(runProgress("paused",pair)).toMatchObject({title:"Work paused",receipt:false,incomplete:false});
 for(const state of ["uncertain","executing"])expect(runProgress("active",[{...pair[0],state},{...pair[1],state:null}])).toMatchObject({title:"Checking the outcome",receipt:false,incomplete:true});
 for(const state of ["conflict","rejected","cancelled"])expect(runProgress("active",[{...pair[0],state},pair[1]])).toMatchObject({title:"Work needs a decision",receipt:false,incomplete:false});
 expect(runProgress("active",[{...pair[0],state:"invented"},pair[1]])).toMatchObject({title:"Saved state needs review",receipt:false});
 expect(runProgress("invented",pair)).toMatchObject({title:"Saved state needs review",receipt:false});expect(runProgress("active",[]).receipt).toBe(false);
});
