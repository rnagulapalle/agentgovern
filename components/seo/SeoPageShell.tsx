import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AGENTGOVERN_SEO_TOOLS } from "@/lib/seo-tools";
import {
  MarketingFooter,
  MarketingHeader,
  marketingPrimaryButton,
  marketingSecondaryButton,
} from "@/components/marketing/chrome";

export type SeoStat = { value: string; label: string };

export type SeoCta = { href: string; label: string };

export function SeoPageShell({
  eyebrow,
  title,
  description,
  stats,
  primaryCta = { href: "/control-plane", label: "Explore the product tour" },
  secondaryCta = { href: "/#demo", label: "Book a demo" },
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
    <div className="marketing-surface theme-light">
      <div className="marketing-frame">
        <MarketingHeader section={eyebrow} />

      <main className="marketing-main">
        <p className="label">{eyebrow}</p>
        <h1 className="marketing-page-title">
          {title}
        </h1>
        <p className="mt-5 text-pretty text-[16px] leading-relaxed text-subtle">
          {description}
        </p>

        {stats && stats.length > 0 && (
          <div className="mt-8 grid grid-cols-3 gap-3">
            {stats.map((s) => (
              <div key={s.label} className="card px-3 py-3 text-center">
                <div className="text-[18px] font-semibold text-fg">{s.value}</div>
                <div className="mt-0.5 text-[11px] text-faint">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={primaryCta.href}
            className={marketingPrimaryButton}
          >
            {primaryCta.label} <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href={secondaryCta.href}
            className={marketingSecondaryButton}
          >
            {secondaryCta.label}
          </Link>
        </div>

        <article className="prose-seo mt-14 space-y-12">{children}</article>

        {faq && faq.length > 0 && (
          <section className="mt-16 border-t border-hairline/10 pt-12">
            <h2 className="text-[22px] font-medium tracking-[-0.03em] text-fg">Common questions</h2>
            <dl className="mt-6 space-y-6">
              {faq.map((item) => (
                <div key={item.q}>
                  <dt className="text-[15px] font-medium text-fg">{item.q}</dt>
                  <dd className="mt-2 text-[14px] leading-relaxed text-subtle">{item.a}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="card mt-16 p-8 text-center">
          <h2 className="text-[22px] font-medium tracking-[-0.03em] text-fg">
            Build the workflow. Keep authority over what runs.
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-[14px] leading-relaxed text-subtle">
            LoopLabs gives each agent a role, controls its actions, follows the
            full execution, checks outputs, and helps your team recover affected state.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link
              href="/control-plane"
              className={marketingPrimaryButton}
            >
              Explore the product tour <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/#demo"
              className={marketingSecondaryButton}
            >
              Book a demo
            </Link>
          </div>
        </section>
      </main>

      <section className="border-t border-hairline/10">
        <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
          <p className="label mb-3">More guides</p>
          <ul className="grid gap-2 sm:grid-cols-2">
            {AGENTGOVERN_SEO_TOOLS.filter((t) => t.href !== "/guides").map((t) => (
              <li key={t.href}>
                <Link
                  href={t.href}
                  className="text-[13px] text-subtle transition-colors hover:text-fg"
                >
                  {t.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>
      <MarketingFooter />
      </div>
    </div>
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
      <h2 className="text-[20px] font-medium tracking-[-0.025em] text-fg">{title}</h2>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-subtle">{children}</div>
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
          className={`border p-4 ${
            item.tone === "warn"
              ? "border-red-500/20 bg-red-50"
              : item.tone === "ok"
                ? "border-emerald-500/25 bg-emerald-50"
                : "card"
          }`}
        >
          <p className="text-[14px] font-medium text-fg">{item.title}</p>
          <p className="mt-2 text-[13px] leading-relaxed text-subtle">{item.body}</p>
        </div>
      ))}
    </div>
  );
}

export function SeoList({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-subtle marker:text-faint">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}
