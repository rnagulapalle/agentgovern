import { AgentsWorkspace } from "@/components/control-plane/agents-workspace";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
import { ControlCenter } from "@/components/control-plane/control-center";
export default function AgentsPage() {
  return process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile ? <ControlCenter page="agents" awsEnabled={process.env.LOOPLABS_AWS_CONNECTIONS === "enabled"}/> : <AgentsWorkspace />;
}
