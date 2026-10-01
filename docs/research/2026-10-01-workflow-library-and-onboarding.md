# Workflow library and onboarding decision

Date: 2026-10-01

## Decision

LoopLabs should help a visitor choose and scope one narrow workflow before asking
them to configure agents, policies, or models. The product tour now includes a
workflow library with two starting paths:

1. Connect an existing n8n, Zapier, custom, or other workflow and add control
   around consequential actions.
2. Launch one bounded workflow through guided early-access implementation when
   the customer has not built it yet.

The library is guidance over prepared examples. It is not presented as a live
self-service builder or a connected production catalog.

## Who should use it

### Teaching audience

Individuals and very small teams can understand the control model through a
read-only daily brief. This is a useful activation example because it has a
familiar trigger and obvious daily result. It is not the initial paid ICP:
personal workflows usually have fewer approval boundaries, smaller failure cost,
and less need for cross-system reconciliation.

### First commercial users

The strongest design-partner user remains the owner of automation, applied AI,
RevOps, customer operations, or an agent platform at a 500–5,000 employee B2B
company. Their workflow should:

- run repeatedly and have one accountable owner;
- cross at least two tools or agents;
- send, write, pay, delete, or change a business record;
- require delegated authority or named approval; and
- create measurable cost when a write is stale, duplicated, partial, or unknown.

Real-estate teams are a useful adjacent design-partner segment when lead response
or listing updates cross forms, email, CRM, listing data, calendars, and a public
site. The strongest real-estate wedge is controlled first contact or verified
listing publication, not generic lead generation.

## Workflow set

The tour uses six examples arranged from simple to consequential:

1. Daily operations brief — read-only personal teaching example.
2. Real-estate lead qualification and first response — approval before an
   external send and CRM write.
3. Approved listing update — stale-source checks, one-time publication, and
   outcome verification before retry.
4. Renewal and account change — delegated discount authority, customer email,
   CRM update, and recovery.
5. Service recovery and credit — credit limits, output review, and billing/CRM
   reconciliation.
6. Supplier onboarding exception — separation of duties, ERP write, duplicate
   prevention, and uncertain-outcome recovery.

## Onboarding model

Every workflow follows the same five stages:

1. Define the trigger, owner, successful outcome, and consequential action.
2. Connect the minimum required access, starting read-only when possible.
3. Set automatic, approval-required, and blocked authority boundaries.
4. Exercise stale data, missing permission, rejection, timeout, and duplicate
   retry before activation.
5. Monitor completed runs, held actions, failures, uncertain effects, cost, and
   recovery decisions.

This sequence is more useful to a buyer than a blank visual canvas. It starts
with the business job and makes the operational risk visible before exposing
implementation detail.

## Dashboard model

The daily operator view should answer five questions:

1. Did the workflow complete?
2. What is waiting for a person?
3. What was blocked before effect?
4. Which external outcomes remain uncertain?
5. Is a retry safe?

Adoption, time saved, and model cost matter, but they should follow execution
health and unresolved business effects for the first LoopLabs wedge.

## Current market evidence

- Runlayer lets employees define a job and attach approved connectors, tools,
  skills, model settings, memory, and run options. It exposes run history,
  status, execution trace, findings, blocked requests, warnings, usage, cost, and
  audit events. This validates job-first creation and activity-first monitoring:
  https://www.runlayer.com/agents
- Runlayer's observability view focuses on adoption, spend, agent activity,
  policy decisions, failures, and audit across users, tools, agents, and
  workflows. LoopLabs should narrow that model around action outcomes and safe
  recovery rather than copy a broad AI-adoption dashboard:
  https://www.runlayer.com/visibility
- n8n's real-estate examples show demand for lead qualification, customer reply,
  CRM-style logging, listing research, scheduled work, and multi-tool execution.
  They also show why LoopLabs should complement rather than replace the workflow
  builder: https://n8n.io/workflows/16092-qualify-real-estate-leads-and-send-instant-replies-with-openai-gmail-and-google-sheets/
- Zapier's real-estate examples center on listing updates, approvals, agent
  notifications, calendars, documents, and lead operations, reinforcing that the
  useful template unit is a narrow business job rather than an industry-wide
  automation: https://zapier.com/automations/business-owners/real-estate-operations/listing-management

## Product boundary

Runlayer and automation builders are expanding from enablement into governed
agent creation. LoopLabs should not compete on connector count, template count,
or a generic blank canvas. Its library should lead every example toward the same
closed loop:

`trigger -> delegated authority -> proposed action -> decision -> effect -> observed outcome -> reconcile before retry`

The next engineering proof should connect one workflow template to a real test
system with server-side authority, an idempotency key, a durable action record,
and an external-state check.
