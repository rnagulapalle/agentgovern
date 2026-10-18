import { WorkspaceOverview } from "@/components/control-plane/workspace-overview";
import { ControlCenter } from "@/components/control-plane/control-center";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
export default function OverviewPage(){return process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile ? <ControlCenter page="overview" awsEnabled={process.env.LOOPLABS_AWS_CONNECTIONS === "enabled"} /> : <WorkspaceOverview />;}
