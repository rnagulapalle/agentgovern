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
  LifeBuoy,
  TrendingUp,
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
  HR: Users,
  Finance: Banknote,
  "Customer Support": LifeBuoy,
  Sales: TrendingUp,
  "IT & Security": Lock,
};

function Mark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden>
      <path
        d="M12 2.5 4.5 5.5v6c0 4.4 3.1 8.2 7.5 9.5 4.4-1.3 7.5-5.1 7.5-9.5v-6L12 2.5Z"
        stroke="#818cf8"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="m8.8 12 2.2 2.2 4.2-4.4"
        stroke="#818cf8"
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

export default function LandingPage() {
  return (
    <>
      <JsonLd />

      {/* ── Nav ─────────────────────────────────────────────── */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
              <Mark className="h-4 w-4" />
            </span>
            <span className="text-[15px] font-semibold tracking-tight text-white">
              Agent<span className="text-white/55">Governance</span>
            </span>
          </Link>

          <nav className="ml-6 hidden items-center gap-6 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-[14px] text-white/55 transition-colors hover:text-white"
              >
                {n.label}
              </a>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-2.5">
            <Link
              href="/agent-governance-demo"
              className="hidden rounded-lg border border-white/[0.09] bg-white/[0.02] px-3.5 py-2 text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.05] sm:inline-flex"
            >
              Live demo
            </Link>
            <a
              href="#join"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-indigo-500"
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
            <span className="inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-3 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-white/50">
              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400" />
              {SITE.tagline}
            </span>

            <h1 className="mt-6 text-balance text-[34px] font-semibold leading-[1.1] tracking-tight text-white sm:text-[52px]">
              Control what your company&apos;s AI is allowed to do.
            </h1>

            <p className="mx-auto mt-5 max-w-2xl text-pretty text-[16px] leading-relaxed text-white/55 sm:text-[17px]">
              Your team is using Microsoft Copilot, ChatGPT, and Gemini to send emails,
              update records, and open confidential documents. AgentGovernance is the{" "}
              <span className="text-white/80">control layer between your AI tools and your systems</span>{" "}
              — with human approval, access control, and a complete audit trail.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3">
              <WaitlistForm id="join" />
              <Link
                href="/agent-governance-demo"
                className="inline-flex items-center gap-1.5 text-[13px] font-medium text-white/55 transition-colors hover:text-white"
              >
                See an approval workflow in the demo <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-4xl">
            <DemoPlayer />
            <p className="mt-3 text-center text-[12px] text-white/35">
              Watch a discount above policy get blocked and routed to a manager for approval.
            </p>
          </div>

          {/* five-second reinforcement */}
          <div className="mx-auto mt-12 grid max-w-4xl grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2">
            {PRINCIPLES.map((p) => (
              <div key={p} className="flex items-start gap-2.5">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" strokeWidth={2.4} />
                <span className="text-[15px] text-white/75">{p}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── 2. What business problem do we solve? ───────────── */}
        <section id="problem" className="scroll-mt-20 border-t border-white/[0.06] py-20">
          <div className="mx-auto max-w-2xl text-center">
            <div className="label mb-3">The problem</div>
            <h2 className="text-balance text-[26px] font-semibold leading-tight tracking-tight text-white sm:text-[30px]">
              Your employees are using AI to do real work. Who makes sure it&apos;s safe?
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/55">
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
                className="flex items-start gap-2.5 rounded-lg border border-white/[0.06] bg-white/[0.02] px-4 py-3.5 text-[14px] text-white/70"
              >
                <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400/80" />
                {q}
              </li>
            ))}
          </ul>

          {/* before / after */}
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-red-500/15 bg-red-500/[0.03] p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-red-200">
                <ShieldX className="h-4 w-4" /> Without AI governance
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                A rep asks AI to email a 25% discount — policy allows 10%. It sends
                immediately. No review, no record, no way to prove who authorized it.
              </p>
            </div>
            <div className="rounded-xl border border-emerald-500/15 bg-emerald-500/[0.03] p-4">
              <div className="flex items-center gap-2 text-[13px] font-medium text-emerald-200">
                <FileCheck2 className="h-4 w-4" /> With AgentGovernance
              </div>
              <p className="mt-2 text-[13px] leading-relaxed text-white/50">
                The action is held. Policy checked — 25% exceeds the limit. A manager
                approves or denies. The full audit trail is saved for compliance.
              </p>
            </div>
          </div>
        </section>

        {/* ── 3. How it works ─────────────────────────────────── */}
        <section id="how" className="scroll-mt-20 border-t border-white/[0.06] py-20">
          <div className="mb-10 max-w-2xl">
            <div className="label mb-3">How it works</div>
            <h2 className="text-balance text-[26px] font-semibold tracking-tight text-white sm:text-[30px]">
              Sits between your AI tools and your systems.
            </h2>
            <p className="mt-4 text-[15px] leading-relaxed text-white/55">
              AgentGovernance watches the moment AI tries to act on email, CRM, finance, or
              documents — and applies your rules before anything happens.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="card p-5">
                <div className="text-[12px] font-medium text-indigo-300">{s.n}</div>
                <h3 className="mt-2 text-[16px] font-semibold tracking-tight text-white">
                  {s.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/50">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 4. Use cases ────────────────────────────────────── */}
        <section id="use-cases" className="scroll-mt-20 border-t border-white/[0.06] py-20">
          <div className="mb-10 max-w-2xl">
            <div className="label mb-3">Use cases</div>
            <h2 className="text-balance text-[26px] font-semibold tracking-tight text-white sm:text-[30px]">
              Safer AI in every department.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {USE_CASES.map((u) => {
              const Icon = DEPT_ICON[u.dept] ?? Users;
              return (
                <div key={u.dept} className="card p-5">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.03]">
                      <Icon className="h-4 w-4 text-indigo-300" strokeWidth={1.9} />
                    </span>
                    <h3 className="text-[15px] font-semibold tracking-tight text-white">
                      {u.dept}
                    </h3>
                  </div>
                  <p className="mt-3 text-[14px] leading-relaxed text-white/50">{u.body}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 5. Supported AI tools ───────────────────────────── */}
        <section className="border-t border-white/[0.06] py-20">
          <div className="card mx-auto max-w-3xl p-8 text-center sm:p-10">
            <div className="label mb-3">Supported AI tools</div>
            <h2 className="text-balance text-[22px] font-semibold tracking-tight text-white sm:text-[26px]">
              {WHO_ITS_FOR.headline}
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-white/55">
              {WHO_ITS_FOR.body}
            </p>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
              {WHO_ITS_FOR.tools.map((tool) => (
                <span
                  key={tool}
                  className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[13px] text-white/70"
                >
                  {tool}
                </span>
              ))}
              <span className="rounded-full border border-white/[0.06] px-3.5 py-1.5 text-[13px] text-white/40">
                and more
              </span>
            </div>
          </div>
        </section>

        {/* ── 6. Security & Compliance ────────────────────────── */}
        <section id="security" className="scroll-mt-20 border-t border-white/[0.06] py-20">
          <div className="mb-10 max-w-2xl">
            <div className="label mb-3">Security &amp; compliance</div>
            <h2 className="text-balance text-[26px] font-semibold tracking-tight text-white sm:text-[30px]">
              AI security, approvals, and audit — built for how you operate.
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="card p-5">
                <h3 className="text-[15px] font-semibold tracking-tight text-white">
                  {f.title}
                </h3>
                <p className="mt-2 text-[14px] leading-relaxed text-white/50">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── 7. FAQ ──────────────────────────────────────────── */}
        <section id="faq" className="scroll-mt-20 border-t border-white/[0.06] py-20">
          <div className="mb-8 text-center">
            <div className="label mb-3">FAQ</div>
            <h2 className="text-[26px] font-semibold tracking-tight text-white sm:text-[30px]">
              Questions, answered.
            </h2>
          </div>
          <Faq />
        </section>

        {/* ── 8. Join waitlist ────────────────────────────────── */}
        <section className="border-t border-white/[0.06] py-20">
          <div className="card relative overflow-hidden p-8 text-center sm:p-12">
            <div className="pointer-events-none absolute right-0 top-0 h-px w-1/2 bg-gradient-to-l from-indigo-500/30 to-transparent" />
            <h2 className="mx-auto max-w-2xl text-balance text-[26px] font-semibold leading-tight tracking-tight text-white sm:text-[32px]">
              Let employees use AI — with controls leadership can trust.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-[15px] text-white/50">
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
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 py-12 sm:grid-cols-4 sm:px-8">
          <div className="col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
                <Mark className="h-4 w-4" />
              </span>
              <span className="text-[15px] font-semibold tracking-tight text-white">
                AgentGovernance
              </span>
            </div>
            <p className="mt-3 max-w-xs text-[13px] leading-relaxed text-white/40">
              The control layer between business AI tools and your company systems.
            </p>
          </div>

          <div>
            <div className="label mb-3">Product</div>
            <ul className="space-y-2 text-[13px] text-white/50">
              <li><Link href="/agent-governance-demo" className="hover:text-white">Live demo</Link></li>
              <li><a href="#how" className="hover:text-white">How it works</a></li>
              <li><a href="#use-cases" className="hover:text-white">Use cases</a></li>
              <li><a href="#security" className="hover:text-white">Security &amp; compliance</a></li>
            </ul>
          </div>

          <div>
            <div className="label mb-3">Company</div>
            <ul className="space-y-2 text-[13px] text-white/50">
              <li><a href="#join" className="hover:text-white">Waitlist</a></li>
              <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              <li><span className="text-white/30">AI governance for enterprise teams</span></li>
            </ul>
          </div>

          <div>
            <div className="label mb-3">Connect</div>
            <ul className="space-y-2 text-[13px] text-white/50">
              <li>
                <a href={`https://twitter.com/${SITE.twitter.replace("@", "")}`} className="hover:text-white">
                  {SITE.twitter}
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/[0.06]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 text-[11px] text-white/30 sm:px-8">
            <span>© 2026 AgentGovernance</span>
            <span>Demo uses sample data · your policies in production</span>
          </div>
        </div>
      </footer>
    </>
  );
}
