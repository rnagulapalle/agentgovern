import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { SITE } from "@/lib/site";
import { AGENTGOVERN_SEO_TOOLS } from "@/lib/seo-tools";

function Mark({ className = "h-4 w-4" }: { className?: string }) {
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

export type SeoStat = { value: string; label: string };

export type SeoCta = { href: string; label: string };

export function SeoPageShell({
  eyebrow,
  title,
  description,
  stats,
  primaryCta = { href: "/agent-governance-demo", label: "See the live demo" },
  secondaryCta = { href: "/#join", label: "Join waitlist" },
  faq,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  stats?: SeoStat[];
  primaryCta?: SeoCta;
  secondaryCta?: SeoCta;
  faq?: { q: string; a: string }[];
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md border border-white/10 bg-white/[0.03]">
              <Mark />
            </span>
            <span className="text-[14px] font-semibold tracking-tight text-white">
              Agent<span className="text-white/55">Governance</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/guides"
              className="hidden text-[13px] text-white/50 hover:text-white sm:inline"
            >
              Guides
            </Link>
            <Link
              href={primaryCta.href}
              className="inline-flex items-center gap-1 rounded-lg border border-indigo-500/40 bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500"
            >
              {primaryCta.label}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8">
        <p className="label">{eyebrow}</p>
        <h1 className="mt-3 text-balance text-[30px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[38px]">
          {title}
        </h1>
        <p className="mt-5 text-pretty text-[16px] leading-relaxed text-white/55">
          {description}
        </p>

        {stats && stats.length > 0 && (
          <div className="mt-8 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="card px-3 py-3 text-center">
                <div className="text-[18px] font-semibold text-white">{s.value}</div>
                <div className="mt-0.5 text-[11px] text-white/40">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={primaryCta.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-indigo-500"
          >
            {primaryCta.label} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={secondaryCta.href}
            className="inline-flex items-center rounded-lg border border-white/[0.09] bg-white/[0.02] px-4 py-2.5 text-[14px] font-medium text-white/75 hover:bg-white/[0.05]"
          >
            {secondaryCta.label}
          </Link>
        </div>

        <article className="prose-seo mt-14 space-y-12">{children}</article>

        {faq && faq.length > 0 && (
          <section className="mt-16 border-t border-white/[0.06] pt-12">
            <h2 className="text-[22px] font-semibold text-white">Common questions</h2>
            <dl className="mt-6 space-y-6">
              {faq.map((item) => (
                <div key={item.q}>
                  <dt className="text-[15px] font-medium text-white/90">{item.q}</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-white/55">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="card mt-16 p-8 text-center">
          <h2 className="text-[22px] font-semibold text-white">
            Let employees use AI — with controls your team can run
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-white/50">
            No AI platform team required. AgentGovernance sits between Copilot, ChatGPT
            Enterprise, and the systems they reach — approvals, access control, and audit
            trails in plain business terms.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/agent-governance-demo"
              className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/40 bg-indigo-600 px-4 py-2.5 text-[14px] font-semibold text-white hover:bg-indigo-500"
            >
              Try the demo <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/#join"
              className="inline-flex rounded-lg border border-white/[0.09] px-4 py-2.5 text-[14px] font-medium text-white/75 hover:bg-white/[0.05]"
            >
              Join waitlist
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
          <p className="label mb-3">More guides</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {AGENTGOVERN_SEO_TOOLS.filter((t) => t.href !== "/guides").map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="text-[13px] text-white/50 transition-colors hover:text-white"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[12px] text-white/30">
            © 2026 {SITE.name} · {SITE.url.replace("https://", "")}
          </p>
        </div>
      </footer>
    </>
  );
}

export function SeoSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-[20px] font-semibold tracking-tight text-white">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-white/55">{children}</div>
    </section>
  );
}

export function SeoCards({
  items,
}: {
  items: { title: string; body: string; tone?: "default" | "warn" | "ok" }[];
}) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item.title}
          className={`rounded-xl border p-4 ${
            item.tone === "warn"
              ? "border-red-500/15 bg-red-500/[0.03]"
              : item.tone === "ok"
                ? "border-emerald-500/15 bg-emerald-500/[0.03]"
                : "card"
          }`}
        >
          <p className="text-[14px] font-semibold text-white/90">{item.title}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-white/50">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

export function SeoList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/55">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
