import type {ActivityReference} from './cloud-activity';
import type {WorkflowTelemetryEvent} from './workflow-telemetry';
/** A source label alone is never enough: require one reported version and a saved reference. */
export function executionReference(events:WorkflowTelemetryEvent[],references:ActivityReference[]):ActivityReference|null {
 if(new Set(references.map(r=>JSON.stringify([r.connectionId,r.resourceArn]))).size!==1)return null;
 const versions=[...new Set(events.map(e=>e.reportedDeploymentVersion))];
 if(versions.length!==1||!/^\d+$/.test(versions[0]))return null;
 const matches=references.filter(r=>r.version===versions[0]);
 return matches.length===1?matches[0]:null;
}
