// Render only the actual saved request; never replace it with the current template.
export function savedMessage(value:unknown):{recipient:string;subject:string;text:string}|null{
 const b=value as {to?:unknown;subject?:unknown;text?:unknown};
 if(!b || typeof b!=="object" || !Array.isArray(b.to) || b.to.length!==1 || typeof b.to[0]!=="string" || !b.to[0] || typeof b.subject!=="string" || !b.subject || typeof b.text!=="string" || !b.text)return null;
 return {recipient:b.to[0],subject:b.subject,text:b.text};
}
// Presentation only: never grants approval, dispatch, retries or execution ownership.
export function runProgress(state:string,steps:{state:string|null;ordinal?:number;connector?:string;action_id?:string;evidence?:{outcome:string}}[]){
 const exactPair=steps.length===2&&steps[0].ordinal===1&&steps[0].connector==="crm"&&steps[1].ordinal===2&&steps[1].connector==="email"&&typeof steps[0].action_id==="string"&&Boolean(steps[0].action_id)&&typeof steps[1].action_id==="string"&&Boolean(steps[1].action_id)&&steps[0].action_id!==steps[1].action_id;
 const verified=state==="completed"&&exactPair&&steps.every(s=>s.state==="succeeded"&&s.evidence?.outcome==="verified");
 if(verified)return {title:"Acknowledgement verified",text:"The CRM update and acknowledgement were read back from the provider twins.",receipt:true,incomplete:false};
 if(state==="completed")return {title:"Saved outcome needs review",text:"The completion status lacks both verified action results. Inspect the saved evidence before treating this work as complete.",receipt:false,incomplete:false};
 if(state==="paused")return {title:"Work paused",text:"New dispatch is paused. An action already sent may still have taken effect; inspect its saved outcome before deciding what to do next.",receipt:false,incomplete:false};
 if(state!=="active"||steps.length!==2)return {title:"Saved state needs review",text:"The workflow state is unavailable or incomplete. Refresh and inspect saved work before making a decision.",receipt:false,incomplete:false};
 if(steps.some(s=>s.state==="uncertain"||s.state==="executing"))return {title:"Checking the outcome",text:"An action may have taken effect. Follow its verification result before retrying or sending a downstream message.",receipt:false,incomplete:steps.some(s=>s.state===null)};
 if(steps.some(s=>["conflict","rejected","cancelled"].includes(s.state||"")))return {title:"Work needs a decision",text:"An action was stopped or its outcome conflicts with the reviewed plan. Inspect the saved result; do not assume a retry is safe.",receipt:false,incomplete:false};
 if(steps.some(s=>s.state===null))return {title:"Submission incomplete",text:"Your work is saved, but not all actions were submitted. Inspect any existing action results and ask your workspace administrator to review agent access and allowance before confirming the saved submission.",receipt:false,incomplete:true};
 if(steps.some(s=>!["held","ready","succeeded"].includes(s.state||"")))return {title:"Saved state needs review",text:"An action state is unrecognized. Refresh and inspect saved work before making a decision.",receipt:false,incomplete:false};
 if(steps.every(s=>s.state==="succeeded"))return {title:"Final verification pending",text:"Both action results are saved, but full-run completion is not confirmed. Wait for the saved verification receipt.",receipt:false,incomplete:false};
 if(steps.every(s=>s.state!=="held"))return {title:"Approved work queued",text:"The saved actions have approval. Follow background execution and effect verification here; scheduling is not a verified outcome.",receipt:false,incomplete:false};
 return {title:"Customer acknowledgement",text:"A different named member approves the exact actions. The background runner handles execution and verification; you can close this tab.",receipt:false,incomplete:false};
}
