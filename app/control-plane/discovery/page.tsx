import { DiscoveryWorkspace } from "@/components/control-plane/discovery-workspace";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
import { workspaceContext, WorkspaceGate } from "@/components/control-plane/workspace-gate";
import { redirect } from "next/navigation";
import { connectionDestination } from "@/lib/workspace/connection-navigation";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}) {
  if(process.env.LOOPLABS_DEPLOYMENT_PROFILE!==scriptDemoProfile)return <DiscoveryWorkspace/>;
  if(!await workspaceContext())return <WorkspaceGate/>;
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(await searchParams))if(typeof value==="string")params.set(key,value);
  redirect(connectionDestination(params));
}
