import { expect, it } from "vitest";
import { preparedRequest, requestMatches, requestForDisplay, savedRequest, sameRequestSnapshot } from "./request";
import { acknowledgementV1 } from "./content";
import type { ConnectorAction, Connector, Payload } from "./contracts";
const action = (connector:Connector="email",contactId="1001") => {
  const payload:Payload=connector==="crm" ? {lifecycle:"lead",sourceVersion:"v1"} : {template:"case_received"};
  return {connector,payload:{...payload,request:preparedRequest(connector,payload,contactId)}} as ConnectorAction;
};
it("creates isolated exact snapshots with source conditions and immutable v1 content",() => {
  const crm=preparedRequest("crm",{lifecycle:"customer",sourceVersion:"v2"},"1002");
  expect(crm).toMatchObject({version:"prepared-request-1",method:"PATCH",resource:"/crm/v3/objects/contacts/1002",sourceVersion:"v2",body:{properties:{lifecyclestage:"customer"}}});
  expect(preparedRequest("crm",{lifecycle:"lead"}).sourceVersion).toBeNull();
  const email=preparedRequest("email",{template:"case_received"}); email.body.to!.push("other@example.test");
  expect(preparedRequest("email",{template:"case_received"}).body.to).toEqual(["customer@example.test"]);
  expect(Object.isFrozen(acknowledgementV1)).toBe(true);
});
it("refuses unsupported targets, request kinds and malformed source versions",() => {
  for (const id of ["","../1001","a","1".repeat(25),42 as unknown as string]) expect(()=>preparedRequest("crm",{lifecycle:"lead"},id)).toThrow();
  for (const payload of [null,[],{lifecycle:"other"},{lifecycle:"lead",sourceVersion:""},{lifecycle:"lead",sourceVersion:42},{lifecycle:"lead",sourceVersion:"v".repeat(257)}]) expect(()=>preparedRequest("crm",payload as Payload)).toThrow();
  expect(()=>preparedRequest("email",{template:"other"} as unknown as Payload)).toThrow();
  expect(()=>preparedRequest("slack" as Connector,{template:"case_received"})).toThrow();
});
it("rejects missing, extra, changed and unsupported snapshots while ignoring JSON object key order",() => {
  for (const connector of ["crm","email"] as const) {
    const a=action(connector);
    expect(requestMatches({},a)).toBe(true);
    const s=a.payload.request!;
    a.payload.request={body:s.body,sourceVersion:s.sourceVersion,resource:s.resource,method:s.method,version:s.version};
    expect(requestMatches({},a)).toBe(true);
    for (const patch of [{version:"prepared-request-2"},{method:"DELETE"},{resource:"/other"},{body:{}},{sourceVersion:"changed"},{secret:"not-allowed"}]) {
      const changed={...a,payload:{...a.payload,request:{...s,...patch}}} as ConnectorAction;
      expect(requestMatches({},changed)).toBe(false); expect(()=>savedRequest(changed)).toThrow();
    }
    const missing={...a,payload:{...a.payload,request:undefined}};
    expect(requestMatches({},missing)).toBe(false);expect(()=>savedRequest(missing)).toThrow();
  }
  expect(requestMatches({}, {connector:"crm",payload:{lifecycle:"lead",request:preparedRequest("crm",{lifecycle:"lead"})}})).toBe(false);
  expect(requestMatches({}, {connector:"crm",payload:{lifecycle:"lead",sourceVersion:"bad",request:preparedRequest("crm",{lifecycle:"lead",sourceVersion:"v1"})}})).toBe(false);
  expect(requestMatches({}, {connector:"crm",payload:null} as unknown as ConnectorAction)).toBe(false);
});
it("retains the original request for display but separately checks the enrolled record for dispatch",() => {
  const a=action("crm","1007");
  expect(savedRequest(a).resource).toBe("/crm/v3/objects/contacts/1007");
  expect(requestMatches({contactId:"1001"},a)).toBe(false);
  const email=action();const copied=savedRequest(email);copied.body.subject="changed";
  expect(savedRequest(email).body.subject).toBe(acknowledgementV1.subject);
  expect(requestMatches({contactId:"invalid"},a)).toBe(false);
  expect(sameRequestSnapshot({b:2,a:1},{a:1,b:2})).toBe(true);
  expect(sameRequestSnapshot([1,2],[2,1])).toBe(false);
});

it("keeps malformed historical requests readable as unavailable rather than generating replacement content",() => {
  const a=action();expect(requestForDisplay(a)).toEqual(a.payload.request);
  expect(requestForDisplay({...a,payload:{template:"case_received"}})).toBeNull();
  const bad={...a,payload:{...a.payload,request:{...a.payload.request!,version:"unsupported"}}} as unknown as ConnectorAction;
  expect(requestForDisplay(bad)).toBeNull();
  const broken={...a,get payload():Payload {throw Error("unexpected failure");}};
  expect(()=>requestForDisplay(broken)).toThrow("unexpected failure");
});
