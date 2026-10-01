# LoopLabs market positioning decision

Date: 2026-10-01

## Decision

Keep **agent control plane** as the category term. Lead with **execution integrity and recovery for consequential multi-agent workflows** as the LoopLabs wedge.

The clearest product promise is:

> Build an agent workflow with LoopLabs' guided help, control consequential actions before and during execution, and reconcile affected state when an outcome is uncertain.

“Build workflows” currently means founder-led design and implementation for early-access customers. The shipped product does not yet demonstrate a self-serve workflow builder.

## Why

The control-plane category is now validated by Microsoft Agent 365, Amazon Bedrock AgentCore, Google Cloud Agent Identity and Agent Gateway, and Runlayer. Their public positioning already covers agent inventory, identity, access, observability, policy enforcement, gateways, lifecycle management, and runtime security. Agent Identity also offers per-agent identity, secrets, communications, endpoints, and access controls.

LoopLabs should use those concepts when buyers need category context, but it cannot differentiate through a generic “govern every agent” claim. The current prototype makes a narrower sequence tangible: owner and delegated authority, action decision, approval or containment, supervised execution, output decision, receipt, and state reconciliation.

The recovery step is strategically useful because an allowed or approved action can still finish with an unknown outcome. Preventing a retry until the external state is checked connects security controls with workflow reliability and operational loss.

## Provisional first customer

Start with teams operating a real agent workflow that changes a system of record and crosses tools or agents. The first champion is likely an applied-AI, agent-platform, automation, security-engineering, RevOps, or customer-operations leader. The first design-partner workflow should be bounded and reversible.

Use RevOps and customer operations as the provisional proof wedge. The shipped renewal scenario already supports delegated discount authority, CRM freshness, external-send approval, run termination, output checks, and sample-state recovery. Change the wedge when buyer interviews, qualified conversations, search behavior, or product engagement produce stronger evidence elsewhere.

## Market evidence reviewed

- [Microsoft: Why an enterprise needs Agent 365](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/why-agent-365-for-enterprise)
- [Microsoft: Connect existing agents to Agent 365](https://learn.microsoft.com/en-us/microsoft-agent-365/connect-existing-agents)
- [AWS: Secure AI agents with Policy in AgentCore](https://aws.amazon.com/blogs/machine-learning/secure-ai-agents-with-policy-in-amazon-bedrock-agentcore/)
- [AWS: Temporal policies in AgentCore](https://aws.amazon.com/blogs/machine-learning/securing-ai-agents-with-temporal-policies-in-amazon-bedrock-agentcore/)
- [Google Cloud: Agent identity, gateway, governance, and runtime defense](https://cloud.google.com/blog/products/identity-security/whats-new-in-iam-security-governance-and-runtime-defense)
- [Runlayer](https://www.runlayer.com/)
- [Agent Identity](https://www.agent-identity.dev/)

## What changes operationally

- Score candidate work on buyer pain, product proof, differentiation, conversion fit, and measurement before producing it.
- Prefer action-specific and recovery-specific pages over broad AI-governance commentary.
- Treat the prototype's scope disclosure as part of the sales story.
- Build the next production proof around one real action broker, one reversible system write, durable evidence, and version-safe recovery.
- Use the LoopLabs learning log and funnel data to revise the ICP. Do not inherit the ICP from an older AgentGovern skill.
