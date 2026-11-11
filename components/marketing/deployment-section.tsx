import { Check } from "lucide-react";
import copy from "@/lib/marketing-deployment-copy.json";
import { DeploymentArchitecture } from "./deployment-architecture";

export function DeploymentSection() {
  return <section className="clarity-section clarity-deployment" aria-labelledby="deployment-title">
    <div><h2 id="deployment-title">{copy.title}</h2><p>{copy.body}</p><ul className="clarity-deployment-points">{copy.points.map(point=><li key={point}><Check size={16} aria-hidden="true"/>{point}</li>)}</ul></div>
    <DeploymentArchitecture title={copy.diagramTitle} note={copy.diagramNote}/>
  </section>;
}
