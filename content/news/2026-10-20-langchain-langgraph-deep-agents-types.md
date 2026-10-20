---
title: "LangChain vs LangGraph vs Deep Agents: Agent Types Explained"
description: "Understand agents, workflows, subagents, skills and managed hosting through a cancellation approval example, with a checklist for testing what actually ran."
published: "2026-10-20"
category: "governance"
tags: "LangChain vs LangGraph, Deep Agents, Managed Deep Agents, AI agent types, multi-agent workflows, agent approval testing"
relatedGuide: "/refund-ticket-agent-above-limit"
---
**LangChain helps developers build tool-using agents. LangGraph gives them explicit control over state and execution flow. Deep Agents adds a more assembled harness for complex work. Managed Deep Agents runs that harness on LangSmith infrastructure.** These describe different layers of an application, rather than four mutually exclusive types of intelligence.

By the LoopLabs editorial team. Technical sources and the internal rehearsal summary were reviewed on October 20, 2026. This guide is for customer-operations and engineering teams evaluating who may authorize a cancellation or refund.

A support workflow might contain a coordinator, a policy specialist, an approval pause and a refund tool. Calling all four “agents” hides the distinction that matters: which component made a decision, who authorized the business action, and what evidence confirms the result?

## LangChain, LangGraph and Deep Agents compared

### LangChain: build the agent loop

A LangChain agent combines a model with instructions, tools and middleware. It can select a tool, inspect the result and continue. For customer support, that might mean looking up an account before deciding what information is still missing. The model provider is one attribute of the agent; it is not the agent's business identity. See the [official LangChain agent documentation](https://docs.langchain.com/oss/python/langchain/agents).

### LangGraph: define state and execution flow

LangGraph represents work through state, nodes and edges. A node can be ordinary code, a model call or a complete agent. Edges connect the steps and can branch based on state. A workflow can therefore keep cancellation eligibility checks in code while using an agent to investigate a customer's explanation. A node count is not an agent count. See [LangGraph graph concepts](https://docs.langchain.com/oss/python/langgraph/graph-api).

### Deep Agents: equip an agent for extended work

Deep Agents is an agent harness with filesystem capabilities, context management, subagent delegation and memory, with additional planning and skills available. Think of an assistant investigating a complicated support case across documents and tools. “Deep” describes the harness capabilities; it does not establish human-level seniority, correctness or permission to issue refunds. See the [Deep Agents overview](https://docs.langchain.com/oss/python/deepagents/overview).

### Managed Deep Agents: operate the harness as a service

With Managed Deep Agents, the developer supplies the model configuration, instructions, skills and tools while LangSmith operates the harness and runtime. With the open-source library, the application operator supplies the surrounding deployment components. “Managed” describes that operational responsibility. It does not mean a human manager reviews every action. See [Managed Deep Agents](https://docs.langchain.com/langsmith/python/managed-deep-agents-overview).

## Agent, workflow, tool, role and skill: what is the difference?

Use separate labels for separate responsibilities:

- **Business workflow:** the end-to-end process, such as reviewing and fulfilling a cancellation request.
- **Agent:** a model-driven component that chooses actions within its configured loop.
- **Declared role:** an application label such as policy researcher. The label alone does not prove an independent agent implementation.
- **Tool:** a callable operation such as reading a subscription or requesting a refund.
- **Workflow step:** a unit of execution, which may contain code, a person, a tool or an agent.
- **Skill:** specialized instructions and resources loaded when relevant. Several skills can belong to one agent.
- **Runtime:** the deployed execution environment. One runtime can contain multiple logical roles.

This is a practical inventory convention, not an official universal enumeration of agent species. LangChain describes skills as on-demand specializations; loading another skill does not necessarily create another agent. See [skills architecture](https://docs.langchain.com/oss/python/langchain/multi-agent/skills).

## Which multi-agent pattern fits customer support?

A **supervisor with subagents** delegates investigations to specialists and combines the results. A billing specialist can return findings to the coordinator without taking over the customer conversation. Record parent and child execution identifiers to distinguish an actual delegation from a role name printed in a log. See [subagent architecture](https://docs.langchain.com/oss/python/langchain/multi-agent/subagents).

A **handoff** changes the active agent or its configuration as the conversation progresses. A support assistant might transition into a billing stage after collecting the subscription identifier. Handoffs can occur between separate agents or within one agent whose prompt and tools change. See [handoff architecture](https://docs.langchain.com/oss/python/langchain/multi-agent/handoffs).

A **router** classifies an incoming request and directs it to relevant specialists. A **skills-based agent** retains one controlling agent while loading domain instructions. A **custom workflow** combines these patterns with code and human steps. Start with the simplest structure that handles the process; multiple agents are not a requirement for a complex task. See [LangChain's multi-agent patterns](https://docs.langchain.com/oss/python/langchain/multi-agent).

## Example: cancellation approval without confusing actors and steps

Consider this illustrative process: receive a cancellation request, investigate eligibility, check the exception rule, obtain approval if required, cancel the reviewed subscription, then handle the permitted refund path.

The policy researcher may supply findings. Code may evaluate the threshold. A named human may authorize an exception. A tool may apply the cancellation. None of those facts should be collapsed into “the agent approved and completed the refund.”

For each consequential action, retain the proposed resource and change, the applicable rule version, the authorized reviewer's identity, the decision, and the provider result. Keep a support acknowledgment separate from the final decision. Keep approval separate from execution success.

LangChain provides human-review middleware that can interrupt configured tool calls before execution. The application still needs to establish the reviewer's authority and bind the decision to the action being reviewed. A pause alone is not an authorization model. See [human-in-the-loop tool review](https://docs.langchain.com/oss/python/langchain/human-in-the-loop).

## What we observed in one LoopLabs rehearsal

In an internal test-mode cancellation rehearsal, the LoopLabs timeline displayed **17 steps, four source-reported role labels and 13 steps using a generic actor fallback**. The before-and-after comparison retained the same step sequence and 23 unique cancellation source events. Adding role labels changed attribution presentation, not the underlying execution sequence.

The four role labels were ticket context, policy research, gift card desk and case decision. They are reported logical roles, not proof of four independent models or autonomous agents. Steps without explicit actor metadata stayed generic; we did not infer their actor from a neighboring event.

A continuation exercised one original-payment refund path. An independent Stripe test-mode readback showed one successful $5 refund. No real money moved. This observation does not establish the gift-card path, simultaneous review behavior, general LangChain integration or production reliability.

The [sanitized rehearsal summary](/evidence/2026-10-20-cancellation-agent-attribution.json) provides counts, method and limitations. Private source logs and customer-facing messages are not published. This is an internally observed example, not an independently audited benchmark or evidence that LoopLabs currently supports every framework discussed here.

## How to test an agent workflow before trusting its labels

For a cancellation approval, use acceptance checks that distinguish architecture from business correctness:

- **Actor attribution:** correlate each reported role with its execution and source events. Missing or contradictory actor information stays unknown.
- **Delegation and handoff:** verify the parent/child relationship or active-actor transition. A changed display label is insufficient.
- **Approval binding:** reject a decision from an unauthorized reviewer or one that applies to a different proposal or version.
- **Outcome verification:** read back the affected subscription or payment state. A “completed” log line is not independent confirmation.
- **Retry behavior:** repeat the same intended action in a controlled test and verify that no second cancellation or refund effect appears.
- **Uncertain result:** simulate a lost response after an effect, then reconcile before retrying. Do not treat a timeout as proof that nothing happened.

These are recommended acceptance criteria, not a claim that this one rehearsal passed every failure case. A declared pattern, a successful sample run and a tested action boundary are three different levels of evidence.

## Frequently asked questions

### Is every LangGraph node an agent?

No. Nodes are functions and can contain deterministic code, model calls or entire agents. Count actual agent implementations separately from graph nodes and business steps.

### Is a deep agent the same as a supervisor?

No. A supervisor is a coordination role. A deep-agent harness supports delegation alongside other capabilities, and can also perform work without delegating.

### Is a shallow agent a formal LangChain category?

The cited current guides do not define shallow agents as the formal opposite of Deep Agents. Describe the actual tools, decision loop, memory and delegation instead of assuming the label conveys authority or quality.

### Does managed hosting guarantee safe approvals?

Managed hosting supplies operational components. The application still needs a reviewed authorization design and tests for its exact action, reviewer and integration. Hosting does not by itself prove those tests passed.

## Bring one cancellation approval boundary

Start with the point where a support workflow can cancel a subscription or request a refund. Name its owner, identify the exact approval requirement, and decide what evidence must exist before another attempt.

LoopLabs offers founder-led scoping of bounded workflows. The documented internal rehearsal and prepared demos have specific limits; they are not universal production enforcement or self-service framework onboarding. [Review the product and current scope](/platform), read the [refund approval example](/refund-ticket-agent-above-limit), or [discuss one workflow with the founders](/contact-sales).
