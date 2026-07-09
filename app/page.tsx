import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  ShieldX,
  FileCheck2,
  HelpCircle,
  Users,
  Banknote,
  Database,
  Mail,
  Lock,
  type LucideIcon,
} from "lucide-react";
import {
  SITE,
  PRINCIPLES,
  STEPS,
  FEATURES,
  FAQ,
  CUSTOMER_QUESTIONS,
  WHO_ITS_FOR,
  USE_CASES,
} from "@/lib/site";
import { WaitlistForm, DemoPlayer, Faq } from "@/components/landing/interactive";

export const metadata: Metadata = {
  title: SITE.title,
  description: SITE.description,
  alternates: { canonical: "/" },
};

const DEPT_ICON: Record<string, LucideIcon> = {
  "Regulated data": Database,
  "Financial actions": Banknote,
  "Systems of record": FileCheck2,
  "External communications": Mail,
  "Access & identity": Lock,
};

function Mark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M12 2.5 4.5 5.5v6c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5v-6L12 2.5Z"
        stroke="#4f46e5"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 12 2.2 2.2 4.2-4.4"
        stroke="#4f46e5"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

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
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "USD",
          description: "Early access — join the waitlist",
        },
        featureList: FEATURES.map((f) => f.title),
      },
      {
        "@type": "Organization",
        "@id": `${SITE.url}/#org`,
        name: SITE.name,
        url: SITE.url,
        sameAs: [`https://twitter.com/${SITE.twitter.replace("@", "")}`],
      },
      {
        "@type": "WebSite",
        "@id": `${SITE.url}/#website`,
        url: SITE.url,
        name: SITE.name,
        publisher: { "@id": `${SITE.url}/#org` },
      },
      {
        "@type": "FAQPage",
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
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

const NAV = [
  { href: "#problem", label: "The problem" },
  { href: "#how", label: "How it works" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#security", label: "Security" },
  { href: "#faq", label: "FAQ" },
];

// Confident, TRUE product guarantees — not fabricated customer metrics.
const STATS = [
  {
    n: "0",
    label: "Blind actions",
    body: "Nothing runs without a signed receipt of what, why, and who approved it.",
  },
  {
    n: "3",
    label: "Governed outcomes",
    body: "Allow within authority, hold for a human, or block — decided by policy, every time.",
  },
  {
    n: "100%",
    label: "Actions on the record",
    body: "Allowed, held, or blocked — every attempt lands on an immutable audit trail.",
  },
];

// Proof pillars — describe the real engine, no invented social proof.
const PROOF_POINTS = [
  {
    title: "Grounded in real failures",
    body: "Built from agent-governance incidents teams hit in production — stale-data sends, over-authority actions, unapproved exports.",
  },
  {
    title: "Deterministic, not vibes",
    body: "Same inputs, same decision, every time — and every decision is replayable from its receipt.",
  },
  {
    title: "Evidence before action",
    body: "No external action runs without provenance, data freshness, and the permitting policy attached.",
  },
];

export default function LandingPage() {
  return (
    <div className="theme-light min-h-screen bg-bg">
      <JsonLd />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-hairline/10 bg-bg/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline/15 bg-surface">
              <Mark className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-fg">
              Agent<span className="text-subtle">Governance</span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-[14px] text-subtle transition-colors hover:text-fg"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <Link
              href="/agent-governance-demo"
              className="hidden rounded-lg border border-hairline/15 bg-surface px-3.5 py-2 text-[13px] font-medium text-muted transition-colors hover:border-hairline/25 sm:inline-flex"
            >
              Live demo
            </Link>
            <a
              href="#join"
              className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
            >
              Join waitlist
            </a>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 sm:px-8">
        {/* ── 1. Hero ─────────────────────────────────────────── */}
        <section className="py-16 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-hairline/10 bg-surface px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-subtle">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
              {SITE.tagline}
            </span>

            <h1 className="mt-6 text-balance text-[40px] font-bold leading-[1.04] tracking-tight text-fg sm:text-[60px]">
              Govern every action{" "}
              <span className="text-subtle">your AI agents take.</span>
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-pretty text-[16px] leading-relaxed text-subtle sm:text-[17px]">
              Security, compliance, and data teams get{" "}
              <span className="font-medium text-fg">one control plane</span> to see, approve,
              and audit every action AI takes on company systems — before it happens.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3">
              <WaitlistForm id="join" />
              <Link
                href="/agent-governance-demo"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-subtle transition-colors hover:text-fg"
              >
                See an approval workflow in the demo <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-4xl">
            <DemoPlayer />
            <p className="mt-3 text-center text-[12px] text-faint">
              Watch a bulk export of regulated data get held and routed to a data steward for approval.
            </p>
          </div>

          {/* five-second reinforcement */}
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600" strokeWidth={2.4} />
                <span className="text-[15px] text-muted">{p}</span>
              </div>
            ))}
          </div>

          {/* stat band — confident, true product guarantees */}
          <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-8 sm:grid-cols-3">
            {STATS.map((s) => (
              <div key={s.n} className="relative pl-5">
                <span className="absolute inset-y-1 left-0 w-px bg-indigo-500/40" />
                <div className="text-[40px] font-bold leading-none tracking-tight text-fg">
                  {s.n}
                </div>
                <div className="mt-2.5 text-[13px] font-semibold text-indigo-600">{s.label}</div>
                <p className="mt-1.5 text-[13px] leading-relaxed text-subtle">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. What business problem do we solve? ───────────── */}
        <section id="problem" className="scroll-mt-20 border-t border-hairline/10 py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="label mb-3">The problem</div>
            <h2 className="text-balance text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-[30px]">
              Your employees are using AI to do real work. Who makes sure it&apos;s safe?
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-subtle">
              AI assistants can now act inside your business — not just chat. They send
              emails, change customer records, and open confidential files on your staff&apos;s
              behalf. Most companies can&apos;t see it, approve it, or prove what happened.
            </p>
          </div>

          {/* buyer questions */}
          <ul className="mx-auto mt-10 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            {CUSTOMER_QUESTIONS.map((q) => (
              <li
                key={q}
                className="flex items-start gap-2.5 rounded-lg border border-hairline/10 bg-surface px-4 py-3.5 text-[14px] text-muted"
              >
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-600/80" />
                {q}
              </li>
            ))}
          </ul>

          {/* before / after */}
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-red-500/20 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-red-700">
                <ShieldX className="h-4 w-4" /> Without AI governance
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-subtle">
                An analytics agent exports 3,000 student records to a dashboard. It runs
                instantly — no data-steward sign-off, no record of what left or why.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-50 p-4">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
                <FileCheck2 className="h-4 w-4" /> With AgentGovernance
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-subtle">
                The export is held. Policy checked — it exceeds the limit for regulated
                data. A data steward approves or denies, and a signed receipt is saved for audit.
              </p>
            </div>
          </div>
        </section>

        {/* ── Proof (real engine, honest grounding — no invented logos) ─ */}
        <section className="scroll-mt-20 border-t border-hairline/10 py-20">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <div className="label mb-3">Proof, not slideware</div>
              <h2 className="text-balance text-[26px] font-semibold tracking-tight text-fg sm:text-[30px]">
                Don&apos;t take our word for it — run the engine yourself.
              </h2>
              <p className="mt-4 text-[15px] leading-relaxed text-subtle">
                The demo isn&apos;t a video mockup. It runs the same deterministic
                policy engine we deploy — live in your browser. Push a discount above
                policy, age a record until it&apos;s stale, size an export past the
                limit, and watch the decision, the approval, and the signed receipt
                happen in real time.
              </p>
              <div className="mt-6">
                <Link
                  href="/agent-governance-demo"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-indigo-500"
                >
                  Open the live demo <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <div className="grid gap-3">
              {PROOF_POINTS.map((p) => (
                <div key={p.title} className="card p-5">
                  <div className="flex items-center gap-2.5">
                    <Check className="h-4 w-4 shrink-0 text-indigo-600" strokeWidth={2.6} />
                    <h3 className="text-[15px] font-semibold tracking-tight text-fg">
                      {p.title}
                    </h3>
                  </div>
                  <p className="mt-2 pl-[26px] text-[14px] leading-relaxed text-subtle">{p.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── 3. How it works ─────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 border-t border-hairline/10 py-20">
          <div className="mb-10 max-w-2xl">
            <div className="label mb-3">How it works</div>
            <h2 className="text-balance text-[26px] font-semibold tracking-tight text-fg sm:text-[30px]">
              Sits between your AI tools and your systems.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-subtle">
              AgentGovernance watches the moment AI tries to act on email, CRM, finance, or
              documents — and applies your rules before anything happens.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-5">
                <div className="text-[12px] font-semibold text-indigo-600">{s.n}</div>
                <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-fg">
                  {s.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-subtle">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Use cases ────────────────────────────────────── */}
        <section id="use-cases" className="scroll-mt-20 border-t border-hairline/10 py-20">
          <div className="mb-10 max-w-2xl">
            <div className="label mb-3">Use cases</div>
            <h2 className="text-balance text-[26px] font-semibold tracking-tight text-fg sm:text-[30px]">
              Govern AI wherever it touches your systems.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u) => {
              const Icon = DEPT_ICON[u.dept] ?? Users;
              return (
                <div key={u.dept} className="card p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-hairline/10 bg-surface">
                      <Icon className="h-4 w-4 text-indigo-600" strokeWidth={1.9} />
                    </span>
                    <h3 className="text-[15px] font-semibold tracking-tight text-fg">
                      {u.dept}
                    </h3>
                  </div>
                  <p className="mt-3 text-[14px] leading-relaxed text-subtle">{u.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 5. Supported AI tools ───────────────────────────── */}
        <section className="border-t border-hairline/10 py-20">
          <div className="card mx-auto max-w-3xl p-8 text-center sm:p-10">
            <div className="label mb-3">Supported AI tools</div>
            <h2 className="text-balance text-[22px] font-semibold tracking-tight text-fg sm:text-[26px]">
              {WHO_ITS_FOR.headline}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-subtle">
              {WHO_ITS_FOR.body}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {WHO_ITS_FOR.tools.map((tool) => (
                <span
                  key={tool}
                  className="rounded-full border border-hairline/10 bg-surface px-3.5 py-1.5 text-[13px] text-muted"
                >
                  {tool}
                </span>
              ))}
              <span className="rounded-full border border-hairline/10 px-3.5 py-1.5 text-[13px] text-faint">
                and more
              </span>
            </div>
          </div>
        </section>

        {/* ── 6. Security & Compliance ────────────────────────── */}
        <section id="security" className="scroll-mt-20 border-t border-hairline/10 py-20">
          <div className="mb-10 max-w-2xl">
            <div className="label mb-3">Security &amp; compliance</div>
            <h2 className="text-balance text-[26px] font-semibold tracking-tight text-fg sm:text-[30px]">
              AI security, approvals, and audit — built for how you operate.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <h3 className="text-[15px] font-semibold tracking-tight text-fg">
                  {f.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-subtle">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 border-t border-hairline/10 py-20">
          <div className="mb-8 text-center">
            <div className="label mb-3">FAQ</div>
            <h2 className="text-[26px] font-semibold tracking-tight text-fg sm:text-[30px]">
              Questions, answered.
            </h2>
          </div>
          <Faq />
        </section>

        {/* ── 8. Join waitlist ────────────────────────────────── */}
        <section className="border-t border-hairline/10 py-20">
          <div className="card relative overflow-hidden p-8 text-center sm:p-12">
            <div className="pointer-events-none absolute right-0 top-0 h-px w-1/2 bg-gradient-to-l from-indigo-500/40 to-transparent" />
            <h2 className="mx-auto max-w-2xl text-balance text-[26px] font-semibold leading-tight tracking-tight text-fg sm:text-[32px]">
              Let employees use AI — with controls leadership can trust.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] text-subtle">
              Early access for organizations rolling out Copilot, ChatGPT Enterprise, and
              other business AI tools. Join the waitlist.
            </p>
            <div className="mt-7 flex justify-center">
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ──────────────────────────────────────────── */}
      <footer className="border-t border-hairline/10">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-12 sm:grid-cols-4 sm:px-8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-hairline/15 bg-surface">
                <Mark className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-fg">
                AgentGovernance
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-faint">
              The control layer between business AI tools and your company systems.
            </p>
          </div>

          <div>
            <div className="label mb-3">Product</div>
            <ul className="space-y-2 text-[13px] text-subtle">
              <li><Link href="/agent-governance-demo" className="hover:text-fg">Live demo</Link></li>
              <li><a href="#how" className="hover:text-fg">How it works</a></li>
              <li><a href="#use-cases" className="hover:text-fg">Use cases</a></li>
              <li><a href="#security" className="hover:text-fg">Security &amp; compliance</a></li>
            </ul>
          </div>

          <div>
            <div className="label mb-3">Company</div>
            <ul className="space-y-2 text-[13px] text-subtle">
              <li><a href="#join" className="hover:text-fg">Waitlist</a></li>
              <li><a href="#faq" className="hover:text-fg">FAQ</a></li>
              <li><span className="text-faint">AI governance for enterprise teams</span></li>
            </ul>
          </div>

          <div>
            <div className="label mb-3">Connect</div>
            <ul className="space-y-2 text-[13px] text-subtle">
              <li>
                <a href="https://x.com/rnagulapalle" target="_blank" rel="noopener noreferrer" className="hover:text-fg">
                  @rnagulapalle
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-hairline/10">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 text-[11px] text-faint sm:px-8">
            <span>© 2026 AgentGovernance</span>
            <span>Demo uses sample data · your policies in production</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
