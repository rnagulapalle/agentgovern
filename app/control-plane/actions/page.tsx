import { scriptDemoProfile } from "@/lib/workspace/deployment-capabilities";
import { Suspense } from "react";
import { ActionsWorkspace } from "@/components/control-plane/actions-workspace";
export default function ActionsPage() {
  return (
    <Suspense fallback={<p>Loading actions…</p>}>
      <ActionsWorkspace scriptDemo={process.env.LOOPLABS_DEPLOYMENT_PROFILE === scriptDemoProfile} />
    </Suspense>
  );
}
