import { AgentsWorkspace } from "@/components/control-plane/agents-workspace";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
export default function AgentsPage() {
  return <AgentsWorkspace scriptDemo={process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile} />;
}
