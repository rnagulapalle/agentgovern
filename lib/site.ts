/**
 * Single source of truth for marketing copy + SEO.
 * Positioning: SMB/traditional orgs (50–1,000 employees) adopting business AI tools —
 * not AI-native builders. Business language first; technical detail second.
 */
export const SITE = {
  name: "AgentGovernance",
  url: "https://agentgovern.ai",
  twitter: "@agentgovern",
  title: "AgentGovernance — AI governance for business AI tools",
  tagline: "Enterprise AI controls",
  description:
    "Employees use Copilot, ChatGPT, and Gemini to act on company systems. AgentGovernance adds human approval, access control, and a full AI audit trail.",
};

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
  headline: "For organizations adopting AI — not building it",
  body: "Healthcare, financial services, law, logistics, manufacturing, retail, education, real estate, consulting — teams of 50 to 1,000 people rolling out Copilot, ChatGPT Enterprise, Gemini, Salesforce Agentforce, and similar assistants.",
  tools: [
    "Microsoft Copilot",
    "ChatGPT Enterprise",
    "Google Gemini",
    "Salesforce Agentforce",
  ],
};

/** Use cases by department (homepage). */
export const USE_CASES = [
  {
    dept: "HR",
    body: "Onboarding, offer letters, and employee records — AI assists, but anything sent or changed waits for approval.",
  },
  {
    dept: "Finance",
    body: "Invoices, refunds, and payments — anything above your limit needs a human sign-off before it happens.",
  },
  {
    dept: "Customer Support",
    body: "Tickets and refunds resolved fast, inside the limits you set, with every action logged for review.",
  },
  {
    dept: "Sales",
    body: "Follow-ups and CRM updates — discounts or external emails above policy route to a manager first.",
  },
  {
    dept: "IT & Security",
    body: "AI reaches only the systems and documents each role is allowed to, with a full access trail.",
  },
];

export const STEPS = [
  {
    n: "01",
    title: "Intercept",
    body: "When AI tries to email a customer, update a record, or access sensitive data, AgentGovernance captures the request before it runs in your systems.",
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
    q: "What is AgentGovernance?",
    a: "AgentGovernance is an AI governance layer that sits between your business AI tools and company systems. When an employee's AI assistant tries to send an email, update a CRM record, or access confidential documents, AgentGovernance checks it against your policies, routes risky actions for human approval, and records everything in an audit trail.",
  },
  {
    q: "We aren't building AI — we just let employees use Copilot and ChatGPT. Is this for us?",
    a: "Yes. The trigger isn't that you're building AI — it's that employees are using AI to access company systems and take real business actions. AgentGovernance gives security, compliance, and operations leaders visibility and control without slowing down adoption.",
  },
  {
    q: "Can AI send emails or change records without approval?",
    a: "Not if your policies say otherwise. You set thresholds — for example, emails above a certain discount or changes to customer records — and AgentGovernance holds those actions until the right person approves, or blocks them entirely.",
  },
  {
    q: "How does this help with compliance and audit?",
    a: "Every AI action attempt produces a record: what was requested, which policy applied, whether it was allowed or blocked, and who approved it. That AI audit trail supports internal review and external compliance requirements — without asking employees to manually document what AI did.",
  },
  {
    q: "Does this replace Copilot, ChatGPT, or our CRM?",
    a: "No. AgentGovernance doesn't replace the AI tools your teams already use. It governs the moment AI tries to act on your systems — so you can roll out AI assistants with enterprise controls leadership can trust.",
  },
  {
    q: "How are business policies set up?",
    a: "You define rules in plain business terms: who can do what, which actions need approval, spending limits, and data access boundaries. AgentGovernance enforces those rules consistently, regardless of which AI assistant initiated the action.",
  },
  {
    q: "Is the demo real?",
    a: "Yes. The interactive demo shows a real approval workflow — for example, a discount above policy blocked and routed to a manager — using the same decision logic we deploy for customers. Sample data only; your policies would be your own.",
  },
  {
    q: "When can we get started?",
    a: "AgentGovernance is in early access for organizations rolling out AI across teams. Join the waitlist and we'll reach out as we onboard the next cohort.",
  },
];
