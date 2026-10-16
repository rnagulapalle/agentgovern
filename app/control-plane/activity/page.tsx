import { ControlCenter } from "@/components/control-plane/control-center";
export default function ActivityPage() {
  return <ControlCenter page="activity" awsEnabled={process.env.LOOPLABS_AWS_CONNECTIONS === "enabled"}/>;
}
