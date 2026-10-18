import {afterEach,expect,it,vi} from "vitest";
const {context}=vi.hoisted(()=>({context:vi.fn(async()=>({}))}));
vi.mock("@/components/control-plane/workspace-gate",()=>({workspaceContext:context,WorkspaceGate:function PrivateGate(){return null;}}));
vi.mock("next/navigation",()=>({redirect:(path:string)=>{throw Error("REDIRECT "+path);}}));
import Page from "./page";
afterEach(()=>{vi.unstubAllEnvs();context.mockResolvedValue({});});
it("installed company Discovery URL redirects into Connections with the exact reviewed version",async()=>{
 vi.stubEnv("LOOPLABS_DEPLOYMENT_PROFILE","isolated-control-demo-1");
 const params={connectionId:"aws-test",resourceArn:"arn:aws:bedrock-agentcore:us-west-2:123456789012:runtime/quote-agent",version:"15",coverage:"history"};
 await expect(Page({searchParams:Promise.resolve(params)})).rejects.toThrow('REDIRECT /control-plane/connectors?'+new URLSearchParams(params));
});
it("malformed legacy context is not forwarded as an agent selection",async()=>{
 vi.stubEnv("LOOPLABS_DEPLOYMENT_PROFILE","isolated-control-demo-1");
 await expect(Page({searchParams:Promise.resolve({connectionId:"../other",resourceArn:"https://other",version:"latest"})})).rejects.toThrow('REDIRECT /control-plane/connectors?context=invalid');
});
it("other installation profiles retain their existing provider-specific discovery workspace",async()=>{
 vi.stubEnv("LOOPLABS_DEPLOYMENT_PROFILE","");
 const page=await Page({searchParams:Promise.resolve({})});expect(page.type.name).toBe("DiscoveryWorkspace");
});

it("anonymous legacy Discovery requests retain the private workspace gate instead of redirecting",async()=>{
 vi.stubEnv("LOOPLABS_DEPLOYMENT_PROFILE","isolated-control-demo-1");context.mockResolvedValueOnce(null as never);
 const result=await Page({searchParams:Promise.resolve({})});expect(result.type.name).toBe("PrivateGate");
});
