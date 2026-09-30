import Link from "next/link";
import { buildSeoMetadata } from "@/lib/seo-metadata";
import { listNewsPosts, newsPath } from "@/lib/news-markdown";
import { NewsCategoryBadge } from "@/components/news/NewsArticle";
import { MarketingFooter, MarketingHeader, marketingTextLink } from "@/components/marketing/chrome";

export const metadata = buildSeoMetadata({
  title: "Agent Control Plane Guides",
  description:
    "Practical writing on AI agent permissions, action controls, execution supervision, output checks, approvals, audit trails, and state recovery.",
  path: "/blog",
  keywords: [
    "agent control plane",
    "AI agent guardrails",
    "agent governance",
    "agent permissions",
    "agent execution monitoring",
  ],
});

export default function BlogIndexPage() {
  const posts = listNewsPosts();

  return (
    <div className="marketing-surface theme-light">
      <div className="marketing-frame">
      <MarketingHeader section="Blog" />

      <main className="marketing-main">
        <p className="label">FIELD NOTES</p>
        <h1 className="marketing-page-title">
          Controlling agents in production
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-subtle">
          Clear guidance for teams building agent workflows and connecting them
          to real tools, data, and business systems. Learn how to control actions,
          supervise execution, inspect outputs, and recover when work goes off course.
        </p>

        <ul className="mt-12 space-y-4">
          {posts.map((post) => (
            <li key={post.slug}>
              <Link
                href={newsPath(post.slug)}
                className="card block p-5 transition-colors hover:border-hairline/20"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <NewsCategoryBadge category={post.frontmatter.category} />
                  <time className="text-[12px] text-faint">
                    {post.frontmatter.published}
                  </time>
                </div>
                <h2 className="mt-2 text-[18px] font-medium tracking-[-0.025em] text-fg">
                  {post.frontmatter.title}
                </h2>
                <p className="mt-2 text-[14px] leading-relaxed text-subtle">
                  {post.frontmatter.description}
                </p>
              </Link>
            </li>
          ))}
        </ul>

        <p className="mt-10 text-[14px] text-subtle">
          Looking for implementation patterns?{" "}
          <Link href="/guides" className={marketingTextLink}>
            Browse the guides
          </Link>
          .
        </p>
      </main>
      <MarketingFooter />
      </div>
    </div>
  );
}
