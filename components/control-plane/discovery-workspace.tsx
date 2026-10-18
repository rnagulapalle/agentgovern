"use client";
import { useState } from "react";
import { PageTitle } from "./ui";
import { ProjectDiscoveryWorkspace } from "./project-discovery-workspace";
import { AwsConnectionJourney } from "./aws-connection-journey";
import "./discovery-workspace.css";
export function DiscoveryWorkspace({ awsOnly = false }: { awsOnly?: boolean }) {
  const [provider, setProvider] = useState("aws");
  return <div className="cp-durable cp-discovery">
    <PageTitle eyebrow="CLOUD INVENTORY" title="Discover agents" description="Review saved cloud inventory before deciding which agents should enter your control plane." />
    {!awsOnly && <section className="cp-panel cp-durable-card workspace-workflow-select"><label>Cloud provider<select aria-label="Cloud provider" value={provider} onChange={e => setProvider(e.target.value)}><option value="aws">AWS AgentCore</option><option value="azure-foundry">Azure Foundry</option><option value="google-agent-engine">Google Agent Engine</option></select></label><p>A saved scope is not an enrolled agent or execution authority.</p></section>}
    {awsOnly || provider === "aws" ? <AwsConnectionJourney /> : <ProjectDiscoveryWorkspace key={provider} provider={provider === "azure-foundry" ? "azure-foundry" : "google-agent-engine"} />}
  </div>;
}
