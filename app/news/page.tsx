import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo-metadata";
import { listNewsPosts } from "@/lib/news-markdown";
import { NewsCategoryBadge } from "@/components/news/NewsArticle";

export const metadata = buildSeoMetadata({
  title: "AI Governance & Privacy News",
  description:
    "Governance and privacy updates for teams rolling out Copilot, ChatGPT Enterprise, and business AI — regulatory changes, compliance guidance, and practical controls.",
  path: "/news",
  keywords: [
    "AI governance news",
    "AI privacy compliance",
    "Copilot privacy",
    "enterprise AI regulation",
  ],
});

export default function NewsIndexPage() {
  const posts = listNewsPosts();

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-2 px-5 sm:px-8">
          <Link href="/" className="text-[14px] font-semibold text-white">
            Agent<span className="text-white/55">Governance</span>
          </Link>
          <span className="ml-4 text-[13px] text-white/50">News</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 pb-20 pt-12 sm:px-8">
        <p className="label">News</p>
        <h1 className="mt-3 text-[32px] font-semibold tracking-tight text-white">
          AI governance & privacy
        </h1>
        <p className="mt-4 text-[16px] leading-relaxed text-white/55">
          Regulatory updates, privacy developments, and practical guidance for
          mid-size organizations adopting business AI tools — published on{" "}
          <strong className="text-white/75">agentgovern.ai</strong> first.
        </p>

        <ul className="mt-12 space-y-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={`/news/${post.slug}`}
                className="card block p-5 transition-colors hover:border-white/[0.12]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <NewsCategoryBadge category={post.frontmatter.category} />
                  <time className="text-[12px] text-white/35">{post.frontmatter.published}</time>
                </div>
                <h2 className="mt-2 text-[18px] font-semibold text-white/90">
                  {post.frontmatter.title}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-white/50">
                  {post.frontmatter.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-[14px] text-white/40">
          Industry guides:{" "}
          <Link href="/guides" className="text-indigo-300 hover:text-indigo-200">
            /guides
          </Link>
        </p>
      </main>
    </>
  );
}
