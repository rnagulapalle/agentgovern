import {test,expect} from "vitest";
import {mkdtemp,realpath,readFile,stat,rm,symlink,chmod} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {FetchSandboxConnectors} from "../lib/connectors/twin";
import {recordScope} from "../lib/connectors/record-scope";
import {checkContact} from "../lib/enquiries/contracts";
import {publishTemporalProofRecord,temporalProofRecord} from "./temporal-proof-record";
const token="x".repeat(43);
test("owned offline enrollment matches strict provider and enquiry contracts; legacy1001 remains refused",async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"ll-load-record-")));
 try {
  const scope=await publishTemporalProofRecord(root);
  expect(JSON.parse(await readFile(join(root,"connector-twin-records.json"),"utf8"))).toEqual({records:[scope]});
  expect((await stat(join(root,"connector-twin-records.json"))).mode&0o777).toBe(0o600);
  const provider=new FetchSandboxConnectors("http://127.0.0.1:8018",token,1500,scope);
  expect(provider.contactId).toBe("2001");expect(provider.recipient).toBe("customer@example.test");expect(provider.workspaceId).toBe("local-proof");
  checkContact({id:scope.contactId,email:scope.recipient,version:"enrolled-2001",lifecycle:"lead"},scope.contactId,scope.recipient);
  expect(()=>recordScope({...scope,contactId:"1001"})).toThrow("server-enrolled");
  expect(()=>checkContact({id:"1001",email:scope.recipient,version:"enrolled-2001",lifecycle:"lead"},scope.contactId,scope.recipient)).toThrow();
  expect(Object.isFrozen(scope)).toBe(true);
  const original=await readFile(join(root,"connector-twin-records.json"));await expect(publishTemporalProofRecord(root)).rejects.toThrow();expect(await readFile(join(root,"connector-twin-records.json"))).toEqual(original);
 }finally{await rm(root,{recursive:true,force:true});}
});
test("nonprivate or symbolic generation refuses without publishing",async()=>{
 const root=await realpath(await mkdtemp(join(tmpdir(),"ll-load-record-"))),alias=root+"-alias";
 try{await symlink(root,alias);await expect(publishTemporalProofRecord(alias)).rejects.toThrow("refused");await chmod(root,0o755);await expect(publishTemporalProofRecord(root)).rejects.toThrow("refused");await expect(stat(join(root,"connector-twin-records.json"))).rejects.toThrow();expect(temporalProofRecord.contactId).not.toBe("1001");}
 finally{await rm(alias,{force:true});await rm(root,{recursive:true,force:true});}
});
