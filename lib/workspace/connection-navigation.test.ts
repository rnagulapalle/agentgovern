import {expect,it} from "vitest";
import {connectionDestination,connectionEntry,agentDestination} from "./connection-navigation";
const place={connectionId:"acme-aws",resourceArn:"arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/quote-agent",version:"15"};
it("legacy discovery redirects preserve the exact account, runtime and version without an external destination",()=>{
 const params=new URLSearchParams({...place,coverage:"history",next:"https://untrusted.example",scanId:"old-scan"});
 const target=connectionDestination(params);expect(target).toBe('/control-plane/connectors?'+new URLSearchParams({...place,coverage:"history"}));
 expect(connectionEntry(new URL(target,"https://owned.test").searchParams).place).toEqual(place);
 expect(agentDestination(place)).toContain("version=15");expect(target).not.toContain("next=");expect(target).not.toContain("scanId=");
});
it.each([{...place,version:"latest"},{...place,connectionId:"../foreign"},{...place,resourceArn:"https://untrusted.example"},{connectionId:"acme-aws",version:"15"}])("malformed links never become a selected deployment: %j",value=>{
 const params=new URLSearchParams(value);expect(connectionEntry(params).place).toBeNull();expect(connectionEntry(params).invalid).toBe(true);expect(connectionDestination(params)).toContain("context=invalid");
});
it("account-only links keep the account and do not select an agent",()=>{expect(connectionEntry(new URLSearchParams({connectionId:"acme-aws"}))).toEqual({place:null,connectionId:"acme-aws",coverage:false,invalid:false});});
