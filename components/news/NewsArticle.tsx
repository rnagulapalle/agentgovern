import Link from "next/link";
import { SITE } from "@/lib/site";

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
            <h2 key={i} className="pt-2 text-[20px] font-semibold tracking-tight text-white">
              {inlineFormat(trimmed.slice(3))}
            </h2>
          );
        }

        if (trimmed.startsWith("### ")) {
          return (
            <h3 key={i} className="pt-1 text-[17px] font-semibold text-white/90">
              {inlineFormat(trimmed.slice(4))}
            </h3>
          );
        }

        if (trimmed.startsWith("- ")) {
          const items = trimmed.split("\n").filter((l) => l.startsWith("- "));
          return (
            <ul key={i} className="list-disc space-y-2 pl-5 text-[15px] leading-relaxed text-white/55">
              {items.map((item, j) => (
                <li key={j}>{inlineFormat(item.slice(2))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={i} className="text-[15px] leading-relaxed text-white/55">
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
        <strong key={m.index} className="font-medium text-white/80">
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
              className="text-indigo-300 hover:text-indigo-200"
              target="_blank"
              rel="noopener noreferrer"
            >
              {label}
            </a>
          );
        } else {
          parts.push(
            <Link key={m.index} href={href} className="text-indigo-300 hover:text-indigo-200">
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
    governance: "AI governance",
    privacy: "Privacy",
    regulatory: "Regulatory",
  };
  return (
    <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-white/45">
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
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-5 sm:px-8">
          <Link href="/" className="text-[14px] font-semibold text-white">
            Agent<span className="text-white/55">Governance</span>
          </Link>
          <Link href="/news" className="ml-4 text-[13px] text-white/50 hover:text-white">
            News
          </Link>
          <Link
            href="/agent-governance-demo"
            className="ml-auto rounded-lg border border-indigo-500/40 bg-indigo-600 px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-indigo-500"
          >
            Demo
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <NewsCategoryBadge category={category} />
          <time className="text-[12px] text-white/35">{published}</time>
        </div>
        <h1 className="mt-4 text-balance text-[30px] font-semibold leading-[1.15] tracking-tight text-white sm:text-[38px]">
          {title}
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-white/55">{description}</p>

        <article className="mt-12 border-t border-white/[0.06] pt-10">{children}</article>

        {relatedGuide && (
          <div className="card mt-12 p-6">
            <p className="label mb-2">Related guide</p>
            <Link href={relatedGuide} className="text-[15px] font-medium text-indigo-300 hover:text-indigo-200">
              {relatedGuide.replace(/^\//, "").replace(/-/g, " ")} →
            </Link>
          </div>
        )}

        <div className="card mt-8 p-6 text-center">
          <p className="text-[15px] font-medium text-white/90">See approval workflows in the demo</p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link
              href="/agent-governance-demo"
              className="rounded-lg border border-indigo-500/40 bg-indigo-600 px-4 py-2 text-[14px] font-semibold text-white hover:bg-indigo-500"
            >
              Live demo
            </Link>
            <Link
              href="/#join"
              className="rounded-lg border border-white/[0.09] px-4 py-2 text-[14px] font-medium text-white/75 hover:bg-white/[0.05]"
            >
              Join waitlist
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-white/[0.06] py-8 text-center text-[12px] text-white/30">
        © 2026 {SITE.name}
      </footer>
    </>
  );
}
