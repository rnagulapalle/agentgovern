/**
 * Single source of truth for marketing copy + SEO.
 * Positioning: the control layer for agent actions, execution, and outputs.
 * Business language first; explain technical terms through concrete actions.
 */
export const SITE = {
  name: "LoopLabs",
  url: "https://looplabs.run",
  title: "LoopLabs — Build agent workflows. Keep control.",
  tagline: "Build workflows. Control actions. Recover execution.",
  description:
    "Build multi-agent workflows and control what they do in production. Set permissions, supervise execution, check outputs, approve risky actions, and recover failed state.",
  email: "founders@looplabs.run",
};

export const PRODUCT_PILLARS = [
  {
    title: "Build workflows",
    body: "Design one-agent and multi-agent workflows, connect approved models and tools, and assign every agent an owner and role.",
  },
  {
    title: "Control actions",
    body: "Check permissions and business rules before an agent sends, writes, pays, deletes, or calls another tool.",
  },
  {
    title: "Recover execution",
    body: "Follow every run, stop work that goes off course, inspect outputs, and reconcile affected state with a reviewable recovery plan.",
  },
] as const;

/** Five-second clarity — what leadership needs to know. */
export const PRINCIPLES = [
  "See what AI is trying to do before it happens.",
  "Business policies apply — not just what someone typed in a chat.",
  "Risky actions stop for human approval.",
  "Every outcome is logged for compliance and audit.",
];

/** Questions buyers ask when AI touches production systems (homepage). */
export const CUSTOMER_QUESTIONS = [
  "How do we know what AI is doing?",
  "Can AI send emails without approval?",
  "Can AI change customer records?",
  "Can AI access confidential documents?",
  "How do we enforce company policies?",
  "How do we satisfy compliance and audit requirements?",
  "How do we safely allow employees to use AI?",
];

export const WHO_ITS_FOR = {
  headline: "Built for regulated, high-stakes organizations",
  body: "Healthcare, financial services, higher education, public sector, insurance, and legal — where AI now touches PHI, PII, financial systems, and systems of record, and every action has to be seen, approved, and audited. Governs Copilot, ChatGPT Enterprise, Gemini, Agentforce, and the agents your teams are building.",
  tools: [
    "Microsoft Copilot",
    "ChatGPT Enterprise",
    "Google Gemini",
    "Salesforce Agentforce",
  ],
};

/** Use cases by risk surface (homepage) — governance-team framing. */
export const USE_CASES = [
  {
    dept: "Regulated data",
    body: "Exports and queries touching PHI, PII, or student records are scoped, checked, and held for a data steward — before anything leaves.",
  },
  {
    dept: "Financial actions",
    body: "Refunds, payments, and adjustments above policy stop for human sign-off, with the approval recorded for audit.",
  },
  {
    dept: "Systems of record",
    body: "Writes to CRM, EHR, or ERP run only on fresh, verified data — actions on stale source-of-truth are blocked.",
  },
  {
    dept: "External communications",
    body: "Anything AI sends to a customer, vendor, or regulator routes for approval when it exceeds delegated authority.",
  },
  {
    dept: "Access & identity",
    body: "Agents reach only the systems and data each role is cleared for — with a full, replayable access trail.",
  },
];

export const STEPS = [
  {
    n: "01",
    title: "Intercept",
    body: "When AI tries to email a customer, update a record, or access sensitive data, LoopLabs captures the request before it runs in your systems.",
  },
  {
    n: "02",
    title: "Enforce",
    body: "Your business policies, access rules, and approval thresholds are checked automatically — on every action, every time.",
  },
  {
    n: "03",
    title: "Audit",
    body: "Allowed, blocked, or sent for approval — each outcome is recorded in an AI audit trail you can review and share with compliance.",
  },
];

export const FEATURES = [
  {
    title: "AI access control",
    body: "Define what AI can touch — which systems, records, and actions — so confidential data stays within policy.",
  },
  {
    title: "Human approval workflows",
    body: "Discounts over limit, refunds, contract changes, and other high-risk moves pause until the right person approves.",
  },
  {
    title: "AI audit trail",
    body: "Who requested what, which policy applied, who approved it, and what changed — logged for internal review and external audit.",
  },
  {
    title: "Business policy enforcement",
    body: "Turn company rules into enforceable controls. A chat instruction is not permission; your policies are.",
  },
  {
    title: "AI compliance & risk management",
    body: "Block actions on stale or unverified data, cap financial exposure, and reduce blast radius when AI moves fast.",
  },
  {
    title: "Works across AI assistants",
    body: "One governance layer whether employees use Copilot, ChatGPT Enterprise, Gemini, Agentforce, or other business AI tools.",
  },
];

export const FAQ = [
  {
    q: "What is LoopLabs?",
    a: "LoopLabs is an AI governance layer that sits between your business AI tools and company systems. When an employee's AI assistant tries to send an email, update a CRM record, or access confidential documents, LoopLabs checks it against your policies, routes risky actions for human approval, and records everything in an audit trail.",
  },
  {
    q: "We aren't building AI — we just let employees use Copilot and ChatGPT. Is this for us?",
    a: "Yes. The trigger isn't that you're building AI — it's that employees are using AI to access company systems and take real business actions. LoopLabs gives security, compliance, and operations leaders visibility and control without slowing down adoption.",
  },
  {
    q: "Can AI send emails or change records without approval?",
    a: "Not if your policies say otherwise. You set thresholds — for example, emails above a certain discount or changes to customer records — and LoopLabs holds those actions until the right person approves, or blocks them entirely.",
  },
  {
    q: "How does this help with compliance and audit?",
    a: "Every AI action attempt produces a record: what was requested, which policy applied, whether it was allowed or blocked, and who approved it. That AI audit trail supports internal review and external compliance requirements — without asking employees to manually document what AI did.",
  },
  {
    q: "Does this replace Copilot, ChatGPT, or our CRM?",
    a: "No. LoopLabs doesn't replace the AI tools your teams already use. It governs the moment AI tries to act on your systems — so you can roll out AI assistants with enterprise controls leadership can trust.",
  },
  {
    q: "How are business policies set up?",
    a: "You define rules in plain business terms: who can do what, which actions need approval, spending limits, and data access boundaries. LoopLabs enforces those rules consistently, regardless of which AI assistant initiated the action.",
  },
  {
    q: "Is the demo real?",
    a: "Yes. The interactive demo shows a real approval workflow — for example, a discount above policy blocked and routed to a manager — using the same decision logic we deploy for customers. Sample data only; your policies would be your own.",
  },
  {
    q: "When can we get started?",
    a: "LoopLabs is in early access for organizations rolling out AI across teams. Join the waitlist and we'll reach out as we onboard the next cohort.",
  },
];
