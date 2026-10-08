import { expect,it } from "vitest";
import { recordScope, type RecordScope } from "./record-scope";
import { preparedRequest, requestMatches, savedRequest } from "./request";
const scope:RecordScope={version:"record-scope-1",workspaceId:"one",contactId:"2001",recipient:"alice@example.test"};
it("copies and freezes server-enrolled test scope and binds both CRM and message snapshots",()=>{
 const s=recordScope(scope);expect(Object.isFrozen(s)).toBe(true);expect(s).not.toBe(scope);
 for(const connector of ["crm","email"] as const){
  const payload=connector==="crm"?{lifecycle:"lead" as const,sourceVersion:"v1"}:{template:"case_received" as const};
  const request=preparedRequest(connector,payload,s.contactId,s),action={connector,payload:{...payload,request}};
  expect(requestMatches({contactId:s.contactId,recordScope:s},action)).toBe(true);
  expect(requestMatches({contactId:s.contactId},action)).toBe(false);
  expect(savedRequest(action)).toEqual(request);
  expect(requestMatches({contactId:"2002",recordScope:{...s,contactId:"2002"}},action)).toBe(false);
  expect(requestMatches({contactId:s.contactId,recordScope:{...s,workspaceId:"two"}},action)).toBe(false);
  if(connector==="email")expect(request.body.to).toEqual(["alice@example.test"]);
 }
 expect(()=>preparedRequest("email",{template:"case_received"},"2002",s)).toThrow("differs");
 const a={connector:"email" as const,payload:{template:"case_received" as const,request:{...preparedRequest("email",{template:"case_received"},s.contactId,s),scope:undefined}}};
 expect(()=>savedRequest(a)).toThrow("unavailable");
});
it("default denies malformed, live, extra-field and legacy-record enrollments",()=>{
 for(const value of [null,[],{}, {...scope,version:"future"},{...scope,workspaceId:""},{...scope,workspaceId:4},{...scope,workspaceId:"../one"},{...scope,workspaceId:"x".repeat(65)}, {...scope,contactId:4},{...scope,contactId:"1001"},{...scope,contactId:"../2001"},{...scope,contactId:"2".repeat(25)},{...scope,recipient:null},{...scope,recipient:"alice@gmail.com"},{...scope,recipient:"alice@example.test\n"},{...scope,recipient:"alice@example.test,bob@example.test"},{...scope,recipient:"a".repeat(255)+"@example.test"},{...scope,extra:"no"}])expect(()=>recordScope(value)).toThrow();
});
