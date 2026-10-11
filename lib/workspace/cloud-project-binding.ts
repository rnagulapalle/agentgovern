import { projectDiscoveryScope, type ProjectDiscoveryScope } from "./cloud-project-discovery";
import { azureProjectDiscoveryBinding } from "./cloud-azure-binding";
import { googleProjectDiscoveryBinding } from "./cloud-google-binding";
// Provider bindings reuse the same scan, membership and persistence boundary.
export function cloudProjectDiscoveryBinding(input: ProjectDiscoveryScope) {
  const scope = projectDiscoveryScope(input);
  return scope.provider === "azure-foundry" ? azureProjectDiscoveryBinding(scope) : googleProjectDiscoveryBinding(scope);
}
