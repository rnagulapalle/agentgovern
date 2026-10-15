import { DiscoveryWorkspace } from "@/components/control-plane/discovery-workspace";
export default function Page() { return <DiscoveryWorkspace awsOnly={process.env.LOOPLABS_DEPLOYMENT_PROFILE === "isolated-control-demo-1"} />; }
