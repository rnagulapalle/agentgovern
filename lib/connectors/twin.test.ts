import { preparedRequest } from "./request";
import { afterEach, describe, it, expect, vi } from "vitest";
import { FetchSandboxConnectors } from "./twin";
import type { ConnectorAction } from "./contracts";
const token = "a".repeat(40);
const a = (connector: "crm" | "email" = "crm") =>
  ({
    id: "proof-id",
    org_id: "local-proof",
    connector,
    payload: { ...(connector === "crm" ? { lifecycle: "customer", sourceVersion:"v1" } : { template: "case_received" }), request: preparedRequest(connector,connector === "crm" ? {lifecycle:"customer",sourceVersion:"v1"} : {template:"case_received"}), binding: new FetchSandboxConnectors("http://127.0.0.1:8018", token).bindingId },
  }) as ConnectorAction;
afterEach(() => vi.restoreAllMocks());
describe("Private connector adapter", () => {
  it("refuses live, arbitrary, missing and malformed provider credentials", () => {
    for (const [base, key] of [
      ["https://api.hubapi.com", token],
      ["http://localhost:8018", token],
      ["", token],
      ["http://127.0.0.1:8018", "bad"],
    ])
      expect(() => new FetchSandboxConnectors(base, key)).toThrow();
    expect(
      new FetchSandboxConnectors("http://connector-twin:8018", token)
        .workspaceId,
    ).toBe("local-proof");
  });
  it("uses bounded requests, stable identity and exact server-owned payload", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => new Response("{}"));
    vi.spyOn(p, "inspect").mockResolvedValue({
      outcome: "verified",
      detail: "checked",
    });
    await p.write(a(), true);
    let [url, init] = fetch.mock.calls[0];
    expect(url).toContain("/crm/crm/v3/objects/contacts/1001");
    expect(init?.method).toBe("PATCH");
    expect(init?.headers).toMatchObject({
      "Idempotency-Key": "looplabs-proof-id",
      "X-LoopLabs-Lose-Response": "true",
    });
    expect(init?.redirect).toBe("error");
    expect(init?.signal).toBeTruthy();
    await p.write(a("email"), false);
    [url, init] = fetch.mock.calls[1];
    expect(url).toContain("/email/emails");
    expect(init?.method).toBe("POST");
    expect(init?.body).toContain("customer@example.test");
    expect(init?.headers).not.toHaveProperty("X-LoopLabs-Lose-Response");
    fetch.mockResolvedValue(new Response("{}", { status: 429 }));
    await expect(p.request("/x")).rejects.toMatchObject({ status: 503 });
  });
  it("verifies exact CRM read-back including fixture record version", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const effect = {
      actionId: "proof-id",
      connector: "crm",
      body: p.body(a()),
      reference: "1001",
      observedVersion: "v1",
    };
    const request = vi
      .spyOn(p, "request")
      .mockResolvedValueOnce(effect)
      .mockResolvedValueOnce({
        id: "1001",
        properties: { lifecyclestage: "customer" },
        updatedAt: "v1",
      });
    expect((await p.inspect(a())).outcome).toBe("verified");
    expect(request.mock.calls[1][0]).toContain("/1001");
    for (const r of [
      {
        id: "1002",
        properties: { lifecyclestage: "customer" },
        updatedAt: "v1",
      },
      { id: "1001", properties: { lifecyclestage: "lead" }, updatedAt: "v1" },
      {
        id: "1001",
        properties: { lifecyclestage: "customer" },
        updatedAt: "v2",
      },
      { id: "1001" },
    ]) {
      request.mockResolvedValueOnce(effect).mockResolvedValueOnce(r);
      expect((await p.inspect(a())).outcome).toBe("conflict");
    }
  });
  it("rejects mismatched or incomplete action evidence", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const effect = {
      actionId: "proof-id",
      connector: "crm",
      body: p.body(a()),
      reference: "1001",
      observedVersion: "v1",
    };
    const request = vi.spyOn(p, "request");
    for (const e of [
      { ...effect, actionId: "other" },
      { ...effect, connector: "email" },
      { ...effect, body: {} },
      { ...effect, reference: null },
    ]) {
      request.mockResolvedValueOnce(e);
      expect((await p.inspect(a())).outcome).toBe("conflict");
    }
  });
  it("requires trusted source evidence for CRM and no source read for email", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const request = vi.spyOn(p, "request");
    expect(await p.source("email")).toBeNull();
    expect(request).not.toHaveBeenCalled();
    request.mockResolvedValueOnce({ id: "1001", updatedAt: "v1" });
    expect(await p.source("crm")).toBe("v1");
    for (const r of [
      { id: "other", updatedAt: "v1" },
      { id: "1001" },
      { id: "1001", updatedAt: "" },
    ]) {
      request.mockResolvedValueOnce(r);
      await expect(p.source("crm")).rejects.toMatchObject({ status: 503 });
    }
  });
  it("separates email acceptance from real delivery and checks exact message fields", async () => {
    const p = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
    const action = a("email"),
      effect = {
        actionId: action.id,
        connector: "email",
        body: p.body(action),
        reference: "email-1",
      };
    const accepted = { ...p.body(action), id: "email-1", last_event: "sent" };
    const request = vi
      .spyOn(p, "request")
      .mockResolvedValueOnce(effect)
      .mockResolvedValueOnce(accepted);
    expect(await p.inspect(action)).toMatchObject({
      outcome: "verified",
      detail: expect.stringContaining("not proof of real delivery"),
    });
    for (const r of [
      { ...accepted, id: "wrong" },
      { ...accepted, subject: "wrong" },
      { ...accepted, to: "wrong" },
      { ...accepted, to: ["customer@example.test", "other@test"] },
      { ...accepted, to: ["other@test"] },
      { ...accepted, from: "other@test" },
      { ...accepted, text: "private" },
      { ...accepted, last_event: "bounced" },
    ]) {
      request.mockResolvedValueOnce(effect).mockResolvedValueOnce(r);
      expect((await p.inspect(action)).outcome).toBe(
        r.last_event === "bounced" ? "unknown" : "conflict",
      );
    }
  });
});

it("treats approved private transport aliases as one fixture identity and refuses another fixture key", async () => {
  const local = new FetchSandboxConnectors("http://127.0.0.1:8018", token);
  const docker = new FetchSandboxConnectors("http://connector-twin:8018", token);
  expect(local.bindingId).toBe(docker.bindingId);
  const other = new FetchSandboxConnectors("http://127.0.0.1:8018", "b".repeat(40));
  const request = vi.spyOn(globalThis, "fetch");
  await expect(other.write(a(), false)).rejects.toThrow("destination changed");
  await expect(other.inspect(a())).rejects.toThrow("destination changed");
  await expect(local.write({ ...a(), org_id: "other" }, false)).rejects.toThrow();
  await expect(local.write({ ...a(), payload: { lifecycle: "customer" } }, false)).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});

it("refuses changed saved requests before any provider HTTP call",async () => {
  const p=new FetchSandboxConnectors("http://127.0.0.1:8018",token),original=a("email");
  const fetch=vi.spyOn(globalThis,"fetch");
  for (const patch of [{method:"DELETE"},{resource:"/other"},{version:"unsupported"},{body:{subject:"Changed"}}]) {
    const changed={...original,payload:{...original.payload,request:{...original.payload.request!,...patch}}} as ConnectorAction;
    await expect(p.write(changed,false)).rejects.toMatchObject({status:409});
    await expect(p.inspect(changed)).rejects.toMatchObject({status:409});
  }
  expect(fetch).not.toHaveBeenCalled();
});

it("copies explicit test scopes, keeps v1 stable and refuses wrong record/workspace before HTTP",async()=>{
 const scope={version:"record-scope-1" as const,workspaceId:"one",contactId:"2001",recipient:"alice@example.test"};
 const p=new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,scope);
 const local=new FetchSandboxConnectors("http://connector-twin:8018",token,1500,scope);
 expect(p.bindingId).toBe(local.bindingId);scope.recipient="changed@example.test";expect(p.recipient).toBe("alice@example.test");
 const payload={template:"case_received" as const};const action={...a("email"),org_id:"one",payload:{...payload,binding:p.bindingId,request:preparedRequest("email",payload,"2001",p.recordScope)}};
 const fetchMock=vi.fn();vi.spyOn(globalThis,"fetch").mockImplementation(fetchMock);
 await expect(new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,{...p.recordScope!,contactId:"2002"}).write(action,false)).rejects.toThrow("changed");
 await expect(p.write({...action,org_id:"two"},false)).rejects.toThrow("changed");expect(fetchMock).not.toHaveBeenCalled();
});
it("refuses a scoped recipient changed in the trusted record before sending",async()=>{
 const p=new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,{version:"record-scope-1",workspaceId:"one",contactId:"2001",recipient:"alice@example.test"});
 const payload={template:"case_received" as const},action={...a("email"),org_id:"one",payload:{...payload,binding:p.bindingId,request:preparedRequest("email",payload,p.contactId,p.recordScope)}};
 const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:"2001",updatedAt:"v1",properties:{email:"other@example.test"}}),{status:200}));vi.spyOn(globalThis,"fetch").mockImplementation(fetchMock);
 await expect(p.write(action,false)).rejects.toThrow("version");expect(fetchMock).toHaveBeenCalledTimes(1);
});
it("sends scoped snapshots with enrolled record headers and checks scoped readback",async()=>{
 const p=new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,{version:"record-scope-1",workspaceId:"one",contactId:"2001",recipient:"alice@example.test"});
 for(const connector of ["crm","email"] as const){
  const payload=connector==="crm"?{lifecycle:"customer" as const,sourceVersion:"v1"}:{template:"case_received" as const};
  const action={...a(connector),org_id:"one",payload:{...payload,binding:p.bindingId,request:preparedRequest(connector,payload,p.contactId,p.recordScope)}};
  const record={id:p.contactId,updatedAt:"v1",properties:{email:p.recipient,lifecyclestage:"customer"}};
  const reference=connector==="crm"?p.contactId:"email-1";
  const effect={actionId:action.id,connector,recordId:p.contactId,resource:action.payload.request.resource,body:action.payload.request.body,reference,observedVersion:"v1"};
  const request=vi.spyOn(p,"request").mockImplementation(async(path,init)=>{
   if(init?.method)return {id:reference};
   if(path.startsWith("/proof/"))return effect;
   if(path.startsWith("/crm/"))return record;
   return {id:reference,...action.payload.request.body,last_event:"sent"};
  });
  expect((await p.write(action,false)).outcome).toBe("verified");
  const write=request.mock.calls.find(([,init])=>init?.method)![1]!;
  expect(write.headers).toMatchObject({"X-LoopLabs-Record-ID":"2001","X-LoopLabs-Workspace-ID":"one"});
  if(connector==="crm")expect(write.headers).toMatchObject({"If-Match":"v1"});
  effect.recordId="2002";expect((await p.inspect(action)).outcome).toBe("conflict");
  effect.recordId=p.contactId;effect.resource="/other";expect((await p.inspect(action)).outcome).toBe("conflict");
  effect.resource=action.payload.request.resource;
  if(connector==="crm"){record.properties.email="changed@example.test";expect((await p.inspect(action)).outcome).toBe("conflict");}
  request.mockRestore();
 }
});
