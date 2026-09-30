import Link from "next/link";
import { MarketingFooter, MarketingHeader, marketingPrimaryButton, marketingSecondaryButton, marketingTextLink } from "@/components/marketing/chrome";

/** Render simple markdown: ## headings, paragraphs, [text](url), **bold** */
export function NewsMarkdownBody({ body }: { body: string }) {
  const blocks = body.split(/\n\n+/);

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const trimmed = block.trim();
        if (!trimmed) return null;

        if (trimmed.startsWith("## ")) {
          return (
            <h2 key={i} className="pt-2 text-[20px] font-medium tracking-[-0.025em] text-fg">
              {inlineFormat(trimmed.slice(3))}
            </h2>
          );
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="pt-1 text-[17px] font-medium text-fg">
              {inlineFormat(trimmed.slice(4))}
            </h3>
          );
        }

        if (trimmed.startsWith("- ")) {
          const items = trimmed.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-subtle marker:text-faint">
              {items.map((item, j) => (
                <li key={j}>{inlineFormat(item.slice(2))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} className="text-[15px] leading-relaxed text-subtle">
            {inlineFormat(trimmed)}
          </p>
        );
      })}
    </div>
  );
}

function inlineFormat(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const token = m[0];
    if (token.startsWith("**")) {
      parts.push(
        <strong key={m.index} className="font-semibold text-fg">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      const linkMatch = token.match(/\[([^\]]+)\]\(([^)]+)\)/);
      if (linkMatch) {
        const [, label, href] = linkMatch;
        const external = href.startsWith("http");
        if (external) {
          parts.push(
            <a
              key={m.index}
              href={href}
              className={marketingTextLink}
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          );
        } else {
          parts.push(
            <Link key={m.index} href={href} className={marketingTextLink}>
              {label}
            </Link>
          );
        }
      }
    }
    last = m.index + token.length;
  }

  if (last < text.length) parts.push(text.slice(last));
  return parts.length === 1 ? parts[0] : parts;
}

export function NewsCategoryBadge({ category }: { category: string }) {
  const labels: Record<string, string> = {
    governance: "Agent controls",
    privacy: "Privacy",
    regulatory: "Regulatory",
  };
  return (
    <span className="rounded-full border border-indigo-500/20 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-indigo-700">
      {labels[category] ?? category}
    </span>
  );
}

export function NewsArticleShell({
  title,
  description,
  published,
  category,
  relatedGuide,
  children,
}: {
  title: string;
  description: string;
  published: string;
  category: string;
  relatedGuide?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="marketing-surface theme-light">
      <div className="marketing-frame">
      <MarketingHeader section="Blog" />

      <main className="marketing-main">
        <div className="flex flex-wrap items-center gap-3">
          <NewsCategoryBadge category={category} />
          <time className="text-[12px] text-faint">{published}</time>
        </div>
        <h1 className="mt-4 text-balance text-[34px] font-medium leading-[1.08] tracking-[-0.045em] text-fg sm:text-[44px]">
          {title}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-subtle">{description}</p>

        <article className="mt-12 border-t border-hairline/10 pt-10">{children}</article>

        {relatedGuide && (
          <div className="card mt-12 p-6">
            <p className="label mb-2">Related guide</p>
            <Link href={relatedGuide} className={`text-[15px] ${marketingTextLink}`}>
              {relatedGuide.replace(/^\//, "").replace(/-/g, " ")} →
            </Link>
          </div>
        )}

        <div className="card mt-8 p-6 text-center">
          <p className="text-[15px] font-medium text-fg">See the controls in the interactive product tour</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/control-plane"
              className={marketingPrimaryButton}
            >
              Explore the product tour
            </Link>
            <Link
              href="/#demo"
              className={marketingSecondaryButton}
            >
              Book a demo
            </Link>
          </div>
        </div>
      </main>

      <MarketingFooter />
      </div>
    </div>
  );
}
