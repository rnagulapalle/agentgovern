import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
const headers={Authorization:`Bearer ${process.env.TWIN_PROOF_TOKEN}`,"Content-Type":"application/json","x-looplabs-workspace-id":"local-proof","x-looplabs-record-id":"2001"};
const request=async(path,method="GET",body,extra={})=>fetch(`http://connector-twin:8018${path}`,{method,headers:{...headers,...extra},...(body?{body:JSON.stringify(body)}:{})});
const path="/crm/crm/v3/objects/contacts/2001";
for(let i=0;;i++)try{const r=await request(path);assert.equal(r.status,200);break;}catch{if(i===40)throw Error("Private container twin not ready");await new Promise(r=>setTimeout(r,250));}
assert.equal((await fetch(`http://connector-twin:8018${path}`)).status,401);
assert.equal((await request(path,"PATCH",{properties:{lifecyclestage:"customer"}},{"x-looplabs-workspace-id":"foreign"})).status,403);
if(process.env.TWIN_PROOF_RESTART==="1"){
 const contact=await (await request(path)).json();assert.equal(contact.properties.lifecyclestage,"customer");
 for(const id of process.env.TWIN_PROOF_ACTIONS.split(","))assert.equal((await request(`/proof/effects/${id}`)).status,200);
 console.log(JSON.stringify({passed:true,checks:["effect journal and target survive container SIGKILL" ]}));
}else{
 const initial=await (await request(path)).json(),crm=randomUUID(),email=randomUUID();
 const body={properties:{lifecyclestage:"customer"}},extra={"idempotency-key":`looplabs-${crm}`,"if-match":initial.updatedAt};
 assert.equal((await request(path,"PATCH",body,extra)).status,200);
 assert.equal((await request(path,"PATCH",body,extra)).status,200);
 assert.equal((await request(path,"PATCH",{properties:{lifecyclestage:"lead"}},extra)).status,409);
 const mail={from:"LoopLabs <support@looplabs.example>",to:["customer@example.test"],subject:"We received your case",text:"Your request was received. A team member will review it."};
 const emailHeaders={"idempotency-key":`looplabs-${email}`};
 const first=await request("/email/emails","POST",mail,emailHeaders);assert.equal(first.status,200);
 const reference=(await first.json()).id;
 const repeat=await request("/email/emails","POST",mail,emailHeaders);assert.equal(repeat.status,200);assert.equal((await repeat.json()).id,reference);
 assert.equal((await request(`/proof/effects/${crm}`)).status,200);assert.equal((await request(`/proof/effects/${email}`)).status,200);
 console.log(JSON.stringify({passed:true,actions:[crm,email],checks:["another container reaches private fixture","missing credential and wrong workspace refused","duplicate CRM and email retain exact effect/reference","changed request refused"]}));
}
