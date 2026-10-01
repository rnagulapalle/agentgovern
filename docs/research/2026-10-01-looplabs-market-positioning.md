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

## Service-led entry without becoming an automation agency

LoopLabs should support two customer starting points:

1. **No workflow exists:** offer a bounded early-access launch program that selects, designs, and implements one governed agent workflow. Use the right execution substrate, including n8n when appropriate, and design ownership, permissions, approval, evidence, and recovery into the workflow from the start.
2. **A workflow already exists:** map its agents, tools, actions, authority, failure states, and external effects, then add the control and reconciliation boundary that the existing architecture lacks.

Both paths must lead to the LoopLabs control plane. Do not sell open-ended workflow development or compete on the number of connectors and canvas features.

Recommended language:

> Put your first governed agent workflow into production.

> No workflow yet? We help design and build one. Already running agents? We add action controls, approvals, evidence, and recovery.

Recommended CTA: **Bring us one workflow.**

## n8n competitive boundary

n8n is a serious competitor, implementation ecosystem, and possible substrate. It now markets workflow-local RBAC, human approval, input and output guardrails, evaluations, logging, self-hosting, and production governance. Its expert directory includes partners that analyze processes and build production-grade agentic workflows. LoopLabs cannot differentiate with “we build secure workflows” alone.

The strongest LoopLabs cases span multiple agents, runtimes, teams, or systems; require separation of duties outside the builder; or can leave an uncertain external effect that must be reconciled before retry. If a customer's complete workflow lives in n8n and n8n's native controls satisfy the requirement, LoopLabs should use or complement n8n rather than force replacement.

## Market evidence reviewed

- [Microsoft: Why an enterprise needs Agent 365](https://learn.microsoft.com/en-us/microsoft-agent-365/guidance/why-agent-365-for-enterprise)
- [Microsoft: Connect existing agents to Agent 365](https://learn.microsoft.com/en-us/microsoft-agent-365/connect-existing-agents)
- [AWS: Secure AI agents with Policy in AgentCore](https://aws.amazon.com/blogs/machine-learning/secure-ai-agents-with-policy-in-amazon-bedrock-agentcore/)
- [AWS: Temporal policies in AgentCore](https://aws.amazon.com/blogs/machine-learning/securing-ai-agents-with-temporal-policies-in-amazon-bedrock-agentcore/)
- [Google Cloud: Agent identity, gateway, governance, and runtime defense](https://cloud.google.com/blog/products/identity-security/whats-new-in-iam-security-governance-and-runtime-defense)
- [Runlayer](https://www.runlayer.com/)
- [Agent Identity](https://www.agent-identity.dev/)
- [n8n: AI agent governance](https://blog.n8n.io/ai-agent-governance/)
- [n8n service partner directory](https://experts.n8n.io/)

## What changes operationally

- Score candidate work on buyer pain, product proof, differentiation, conversion fit, and measurement before producing it.
- Prefer action-specific and recovery-specific pages over broad AI-governance commentary.
- Treat the prototype's scope disclosure as part of the sales story.
- Build the next production proof around one real action broker, one reversible system write, durable evidence, and version-safe recovery.
- Use the LoopLabs learning log and funnel data to revise the ICP. Do not inherit the ICP from an older AgentGovern skill.
