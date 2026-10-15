import { ConnectorsWorkspace } from "@/components/control-plane/connectors-workspace";
import { SavedWorkspace } from "@/components/control-plane/saved-workspace";
import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
export default function ConnectorsPage() { return process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile ? <SavedWorkspace section="connections" awsConnections={process.env.LOOPLABS_AWS_CONNECTIONS === "enabled"} /> : <ConnectorsWorkspace />; }
