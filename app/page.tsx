import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bot,
  Check,
  FileCheck2,
  GitBranch,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
  Undo2,
} from "lucide-react";
import { SITE } from "@/lib/site";
import {
  ControlExplorer,
  ControlWave,
  IdentityDiagram,
  LandingHeader,
  RecoveryDiagram,
} from "@/components/landing/experience";
import { LoopMark } from "@/components/brand/loop-mark";
import { MarketingFooter } from "@/components/marketing/chrome";
import { ExecutionIntegrityDashboard } from "@/components/landing/execution-integrity";
import "./landing.css";

export const metadata: Metadata = {
  title: { absolute: SITE.title },
  description: SITE.description,
  alternates: { canonical: "/" },
};

const CAL_URL = "https://cal.com/rajnagulapalle";
const FAQ = [
  {
    q: "What if we do not have any agents today?",
    a: "That is a good place to start. Bring us a frequent process your team already runs, such as accounts payable, customer operations, or CRM updates. We can map the work with you, build the agent workflow, and add the right approvals and controls before it reaches production.",
  },
  {
    q: "What does LoopLabs control?",
    a: "LoopLabs controls consequential actions across a workflow: who has authority, which tools and records an agent may use, when work must wait for approval, what evidence is recorded, and whether retry is safe after an uncertain result.",
  },
  {
    q: "What is the difference between an action and an execution?",
    a: "An action is one proposed operation, such as sending an email or updating a CRM record. An execution is the whole run: the steps, tool calls, and handoffs between agents. You can approve a specific action while keeping the rest of the run on hold.",
  },
  {
    q: "What happens when an agent goes off course?",
    a: "Suspend the agent, stop pending work, and review the affected records. The recovery workflow compares the current record with the reviewed state before restoring permitted fields as a new version. Changes that cannot be reversed, such as an email already sent, need manual handling.",
  },
  {
    q: "What if an action times out and we do not know whether it worked?",
    a: "Do not retry it blindly. The recovery path checks the external system and the current record version first. It can then confirm the result, permit a safe retry, prepare a compensating change, or send the decision to a person. The current tour demonstrates this pattern with sample browser data; production connectors are part of an early-access implementation.",
  },
  {
    q: "How does the model gateway fit in?",
    a: "The model gateway controls which models agents may call and how much they may spend. The control plane ties those limits to each agent's identity, workflow, actions, running execution, and outputs. The interactive tour uses representative data; a production deployment connects these controls to your gateway and tools.",
  },
  {
    q: "What can I try today?",
    a: "The interactive product tour includes agent onboarding, workflow controls, approvals, execution traces, output checks, and recovery previews. It uses sample data saved in your browser and does not change external systems. Book a demo to map LoopLabs to one of your production workflows.",
  },
];

const workflowExamples = [
  {
    number: "01",
    label: "REVENUE OPERATIONS",
    title: "Renewal and account change",
    body: "Gather account state, enforce discount authority, approve customer communication, and verify the CRM result before retry.",
  },
  {
    number: "02",
    label: "CUSTOMER OPERATIONS",
    title: "Service recovery and credits",
    body: "Prepare a response or credit, hold higher-risk actions, and record what happened across support, billing, and CRM.",
  },
  {
    number: "03",
    label: "FINANCE OPERATIONS",
    title: "Supplier and invoice exceptions",
    body: "Verify vendor data, preserve separation of duties, route approval, and reconcile ERP state after an uncertain write.",
  },
  {
    number: "04",
    label: "ALREADY AUTOMATING",
    title: "Your existing workflow",
    body: "Keep your orchestrator. Add a control boundary where agents cross systems, take consequential action, or need recovery.",
  },
];

const layers = [
  {
    title: "Launch one workflow",
    sub: "A bounded process with a real owner",
    icon: GitBranch,
  },
  {
    title: "Control actions",
    sub: "Permissions, policy, and approval",
    icon: SlidersHorizontal,
  },
  {
    title: "Reconcile outcomes",
    sub: "Verify effects before retry",
    icon: Undo2,
  },
];

function JsonLd() {
  const schema = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "SoftwareApplication",
        "@id": `${SITE.url}/#app`,
        name: SITE.name,
        url: SITE.url,
        description: SITE.description,
        applicationCategory: "BusinessApplication",
        operatingSystem: "Web",
        featureList: [
          "Agent identity and permissions",
          "Action controls",
          "Execution controls",
          "Output controls",
          "State recovery",
        ],
      },
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#org`,
        name: SITE.name,
        url: SITE.url,
        email: SITE.email,
        founder: [
          { "@type": "Person", name: "Raj Nagulapalle" },
          { "@type": "Person", name: "Pratibha Sharma" },
        ],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        name: SITE.name,
        url: SITE.url,
        publisher: { "@id": `${SITE.url}/#org` },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map(({ q, a }) => ({
          "@type": "Question",
          name: q,
          acceptedAnswer: { "@type": "Answer", text: a },
        })),
      },
    ],
  };
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }}
    />
  );
}

export default function LandingPage() {
  return (
    <div className="ll-landing theme-light">
      <JsonLd />
      <a className="ll-skip" href="#main-content">
        Skip to content
      </a>
      <div className="ll-frame">
        <LandingHeader bookingUrl={CAL_URL} />
        <main id="main-content">
          <section className="ll-hero" aria-labelledby="hero-title">
            <div className="ll-hero-copy">
              <span className="ll-eyebrow">
                CONTROL + RECOVERY FOR AGENT-RUN WORKFLOWS
              </span>
              <h1 id="hero-title">
                Put agent workflows
                <br />
                into production.
                <br />
                Keep control.
              </h1>
              <p>
                Verify delegated authority, control consequential actions,
                preserve execution evidence, and reconcile uncertain outcomes
                before an unsafe retry.
              </p>
              <div className="ll-hero-actions">
                <a
                  className="ll-button"
                  href={CAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Bring us one workflow <ArrowUpRight size={16} />
                </a>
                <Link className="ll-text-link" href="/control-plane">
                  Explore the product tour <ArrowRight size={17} />
                </Link>
              </div>
            </div>
            <ControlWave />
          </section>

          <div className="ll-layer-strip" aria-label="Three layers of control">
            {layers.map(({ title, sub, icon: Icon }, i) => (
              <a
                href={i === 0 ? "#automation" : i === 2 ? "#recovery" : "#controls"}
                key={title}
              >
                <span className="ll-layer-number">0{i + 1}</span>
                <Icon size={29} strokeWidth={1.2} />
                <span>
                  <strong>{title}</strong>
                  <small>{sub}</small>
                </span>
                <ArrowUpRight size={16} className="ll-layer-arrow" />
              </a>
            ))}
          </div>

          <section
            id="automation"
            className="ll-automation ll-section"
            aria-labelledby="automation-title"
          >
            <div className="ll-automation-intro">
              <div>
                <span className="ll-eyebrow">ONE WORKFLOW TO START</span>
                <h2 id="automation-title">
                  Bring us one
                  <br />
                  consequential workflow.
                </h2>
              </div>
              <div className="ll-automation-summary">
                <p>
                  Start with a process that writes to a business system, sends
                  an external message, changes a commercial term, or creates a
                  costly duplicate when the outcome is unclear. We map its
                  owners, authority, approvals, effects, and recovery path.
                </p>
                <p className="ll-small-copy">
                  No workflow yet? Early access includes guided implementation
                  of one bounded workflow. Already using n8n or another runtime?
                  Keep it and add LoopLabs around the consequential actions.
                </p>
                <a
                  className="ll-text-link"
                  href={CAL_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Bring us one workflow <ArrowUpRight size={16} />
                </a>
              </div>
            </div>
            <div className="ll-workflow-grid">
              {workflowExamples.map((workflow) => (
                <article key={workflow.number}>
                  <span className="ll-workflow-number">{workflow.number}</span>
                  <span className="ll-eyebrow">{workflow.label}</span>
                  <h3>{workflow.title}</h3>
                  <p>{workflow.body}</p>
                </article>
              ))}
            </div>
          </section>

          <section
            id="controls"
            className="ll-section"
            aria-labelledby="controls-title"
          >
            <div className="ll-section-heading">
              <span className="ll-eyebrow">THREE POINTS OF CONTROL</span>
              <h2 id="controls-title">
                Control actions,
                <br />
                execution, and outputs.
              </h2>
              <p>
                Decide what may happen, follow the work, and inspect the result.
              </p>
            </div>
            <ControlExplorer />
          </section>

          <section
            id="execution-integrity"
            className="ll-integrity ll-section"
            aria-labelledby="integrity-title"
          >
            <div className="ll-integrity-intro">
              <div>
                <span className="ll-eyebrow">EXECUTION INTEGRITY</span>
                <h2 id="integrity-title">
                  Know what agents changed.
                  <br />
                  Know what needs attention.
                </h2>
              </div>
              <p>
                Connect every consequential action to an agent, accountable
                owner, policy, business system, and observed outcome. See what
                was allowed, held, blocked, or left uncertain—and reconcile
                state before retrying.
              </p>
            </div>

            <ExecutionIntegrityDashboard />
          </section>

          <section
            id="how-it-works"
            className="ll-identity-section ll-section"
            aria-labelledby="identity-title"
          >
            <div className="ll-feature-copy">
              <span className="ll-eyebrow">START WITH IDENTITY & ACCESS</span>
              <h2 id="identity-title">
                Every agent needs
                <br />a job description.
              </h2>
              <p>
                An owner. A role. A clear set of permissions. Give agents access
                to the tools and models they need, with limits that follow the
                work.
              </p>
              <ul className="ll-check-list">
                <li>
                  <Check size={16} /> Assign an accountable owner and role
                </li>
                <li>
                  <Check size={16} /> Choose permitted tools and model tiers
                </li>
                <li>
                  <Check size={16} /> Set budgets and scope delegated work
                </li>
              </ul>
              <Link className="ll-text-link" href="/control-plane/agents">
                Explore agent identities <ArrowUpRight size={16} />
              </Link>
            </div>
            <IdentityDiagram />
          </section>

          <section
            className="ll-lifecycle ll-section"
            aria-labelledby="lifecycle-title"
          >
            <div className="ll-section-heading">
              <span className="ll-eyebrow">THE CROSS-SYSTEM CONTROL BOUNDARY</span>
              <h2 id="lifecycle-title">
                One execution record
                <br />
                across agents and systems.
              </h2>
            </div>
            <div className="ll-system-flow">
              <div className="ll-system-node">
                <Bot size={30} strokeWidth={1.2} />
                <h3>Your agents</h3>
                <p>
                  One agent or a team
                  <br />
                  working together
                </p>
              </div>
              <ArrowRight className="ll-flow-arrow" size={23} strokeWidth={1} />
              <div className="ll-system-boundary">
                <div>
                  <LoopMark />
                  <strong>LoopLabs</strong>
                  <span className="ll-micro">CONTROL LAYER</span>
                </div>
                <ul>
                  <li>
                    <Check size={14} /> Verify delegated authority
                  </li>
                  <li>
                    <Check size={14} /> Control the proposed action
                  </li>
                  <li>
                    <Check size={14} /> Hold for named approval
                  </li>
                  <li>
                    <Check size={14} /> Record and reconcile the result
                  </li>
                </ul>
              </div>
              <ArrowRight className="ll-flow-arrow" size={23} strokeWidth={1} />
              <div className="ll-system-node">
                <FileCheck2 size={30} strokeWidth={1.2} />
                <h3>Business systems</h3>
                <p>
                  CRM, billing, email,
                  <br />
                  support, and ERP
                </p>
              </div>
            </div>
            <div className="ll-flow-footnote">
              <GitBranch size={15} />
              <span>
                Connect the initiating human, agent authority, policy version,
                action request, external effect, and recovery decision.
              </span>
            </div>
          </section>

          <section
            id="recovery"
            className="ll-recovery-section ll-section"
            aria-labelledby="recovery-title"
          >
            <RecoveryDiagram />
            <div className="ll-feature-copy">
              <span className="ll-eyebrow">WHEN THE OUTCOME IS UNCERTAIN</span>
              <h2 id="recovery-title">
                Do not retry
                <br />
                an unknown outcome.
                <br />
                Reconcile it first.
              </h2>
              <p>
                A timeout does not prove that an action failed. Check the
                external system, compare the current record version, and then
                confirm, retry, compensate, or send the decision to a person.
              </p>
              <p className="ll-small-copy">
                The product tour demonstrates version-aware recovery over
                sample state. Production connectors are configured during
                early access.
              </p>
              <Link
                className="ll-text-link"
                href="/control-plane/reconciliation"
              >
                Try the recovery workflow <ArrowUpRight size={16} />
              </Link>
            </div>
          </section>

          <section
            className="ll-scenarios ll-section"
            aria-labelledby="scenarios-title"
          >
            <div className="ll-section-heading ll-heading-row">
              <div>
                <span className="ll-eyebrow">SEE THE DECISIONS</span>
                <h2 id="scenarios-title">
                  See the controls
                  <br />
                  on a real task.
                </h2>
              </div>
              <Link className="ll-text-link" href="/control-plane">
                Explore the product tour <ArrowUpRight size={16} />
              </Link>
            </div>
            <div className="ll-scenario-grid">
              <Link href="/control-plane/approvals">
                <span className="ll-scenario-icon">
                  <CircleApproval />
                </span>
                <span className="ll-eyebrow">ACTION / HOLD</span>
                <h3>
                  A discount beyond
                  <br />
                  the agent&apos;s authority.
                </h3>
                <p>The email waits for approval before it can be sent.</p>
                <span className="ll-scenario-link">
                  Review the request <ArrowUpRight size={17} />
                </span>
              </Link>
              <Link href="/control-plane/outputs">
                <span className="ll-scenario-icon">
                  <FileCheck2 size={42} strokeWidth={1} />
                </span>
                <span className="ll-eyebrow">OUTPUT / REDACT</span>
                <h3>
                  Private data in
                  <br />a customer summary.
                </h3>
                <p>
                  The output check removes an email address from the result.
                </p>
                <span className="ll-scenario-link">
                  Inspect the output <ArrowUpRight size={17} />
                </span>
              </Link>
              <Link href="/control-plane/reconciliation">
                <span className="ll-scenario-icon">
                  <Undo2 size={42} strokeWidth={1} />
                </span>
                <span className="ll-eyebrow">RECOVERY / RESTORE</span>
                <h3>
                  An action timed out
                  <br />
                  after the external write.
                </h3>
                <p>
                  LoopLabs checks the external state before permitting a retry.
                </p>
                <span className="ll-scenario-link">
                  Review the recovery <ArrowUpRight size={17} />
                </span>
              </Link>
            </div>
            <p className="ll-sandbox-note">
              The product tour uses sample browser data and a prepared renewal
              workflow. Policy evaluation and state transitions run locally;
              model calls, external actions, and production recovery are simulated.
            </p>
          </section>

          <section
            id="faq"
            className="ll-faq ll-section"
            aria-labelledby="faq-title"
          >
            <div>
              <span className="ll-eyebrow">A FEW DETAILS</span>
              <h2 id="faq-title">Good questions.</h2>
              <a
                className="ll-text-link"
                href={CAL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Talk through your use case <ArrowUpRight size={16} />
              </a>
            </div>
            <div className="ll-faq-list">
              {FAQ.map(({ q, a }) => (
                <details key={q}>
                  <summary>
                    {q}
                    <Plus size={18} />
                  </summary>
                  <p>{a}</p>
                </details>
              ))}
            </div>
          </section>

          <section id="demo" className="ll-closing ll-section">
            <div>
              <span className="ll-eyebrow">SEE LOOPLABS IN ACTION</span>
              <h2>
                Bring one workflow.
                <br />
                We&apos;ll map its authority,
                <br />
                actions, and recovery path.
              </h2>
            </div>
            <div className="ll-closing-action">
              <ShieldCheck size={48} strokeWidth={0.9} />
              <p>
                See where an action is allowed, what evidence is preserved,
                and how an uncertain outcome is reconciled.
              </p>
              <a
                className="ll-button"
                href={CAL_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Bring us one workflow <ArrowUpRight size={16} />
              </a>
              <Link className="ll-text-link" href="/control-plane">
                Or explore the product tour <ArrowRight size={16} />
              </Link>
              <Link className="ll-text-link" href="/blog/2026-10-02-ai-crm-workflow-pilot">
                What a CRM workflow pilot involves <ArrowRight size={16} />
              </Link>
            </div>
          </section>
        </main>

        <MarketingFooter />
      </div>
    </div>
  );
}

function CircleApproval() {
  return (
    <svg
      width="42"
      height="42"
      viewBox="0 0 42 42"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="21" cy="21" r="17" stroke="currentColor" />
      <path d="M17 14v14m8-14v14" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  );
}
