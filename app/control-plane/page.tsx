import { WorkspaceOverview } from "@/components/control-plane/workspace-overview";
import { SavedWorkspace } from "@/components/control-plane/saved-workspace";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
export default function OverviewPage(){return process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile ? <SavedWorkspace section="overview" awsConnections={process.env.LOOPLABS_AWS_CONNECTIONS === "enabled"} /> : <WorkspaceOverview />;}
