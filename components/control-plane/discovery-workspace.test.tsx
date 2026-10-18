import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DiscoveryWorkspace } from "./discovery-workspace";
it("does not present configured scopes as connected enforcement or ask for secrets", () => {
  const html = renderToStaticMarkup(<DiscoveryWorkspace />);
  expect(html).toContain("LoopLabs generates the connection reference");
  expect(html).toContain("Discovery saves identity references");
  expect(html).toContain("Your workflow stays in AWS");
  expect(html).toContain("Enter no passwords, access keys or tokens");
  expect(html).not.toContain('type="password"'); expect(html).not.toContain("<pre");
  expect(html).toContain('name="accountId"'); expect(html).toContain('name="region"');
  expect(html).toContain('disabled=""');
});

import { ProjectDiscoveryWorkspace } from "./project-discovery-workspace";
it("Azure and Google forms request only project scope and require reviewed bindings before scanning", () => {
  for (const provider of ["azure-foundry", "google-agent-engine"] as const) {
    const html = renderToStaticMarkup(<ProjectDiscoveryWorkspace provider={provider} />);
    expect(html).toContain(provider === "azure-foundry" ? "Azure scanning requires an administrator-reviewed directory and server binding" : "Google scanning requires an administrator-reviewed server binding");
    expect(html).toContain("Configured access is not a verified scan");
    expect(html).not.toContain("Scan project inventory");
    expect(html).toContain("Enter no passwords, access keys or tokens");
    expect(html).not.toContain('type="password"'); expect(html).not.toContain("<pre");
    expect(html).toContain(provider === "azure-foundry" ? 'name="directoryId"' : 'name="projectNumber"');
    expect(html).toContain('disabled=""');
  }
});

it("AWS-only installation does not offer unsupported cloud project selectors", () => {
  const html = renderToStaticMarkup(<DiscoveryWorkspace awsOnly />);
  expect(html).not.toContain("Azure Foundry"); expect(html).not.toContain("Google Agent Engine");
  expect(html).toContain("Connect an AWS account");
});
