import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscoveryWorkspace } from "./discovery-workspace";
it("does not present configured scopes as connected enforcement or ask for secrets", () => {
  const html = renderToStaticMarkup(<DiscoveryWorkspace />);
  expect(html).toContain("Scanning requires a reviewed server binding");
  expect(html).toContain("Saving a scope does not contact AWS or import agents");
  expect(html).toContain("Azure and Google project scopes can be saved separately");
  expect(html).toContain("Enter no passwords, access keys or tokens");
  expect(html).not.toContain('type="password"'); expect(html).not.toContain("<pre");
  expect(html).toContain('name="accountId"'); expect(html).toContain('name="region"');
  expect(html).toContain('disabled=""');
});

import { ProjectDiscoveryWorkspace } from "./project-discovery-workspace";
it("Azure and Google forms request only project scope and label unconnected scanning explicitly", () => {
  for (const provider of ["azure-foundry", "google-agent-engine"] as const) {
    const html = renderToStaticMarkup(<ProjectDiscoveryWorkspace provider={provider} />);
    expect(html).toContain("Native scanning is not connected");
    expect(html).toContain("Enter no passwords, access keys or tokens");
    expect(html).not.toContain('type="password"'); expect(html).not.toContain("<pre");
    expect(html).toContain(provider === "azure-foundry" ? 'name="directoryId"' : 'name="projectNumber"');
    expect(html).toContain('disabled=""');
  }
});
