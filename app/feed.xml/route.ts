import { listNewsPosts, newsPath } from "@/lib/news-markdown";
import { SITE } from "@/lib/site";

export const dynamic = "force-static";

function xml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function GET() {
  const posts = listNewsPosts();
  const latestPublished = posts.reduce(
    (latest, post) => post.frontmatter.published > latest ? post.frontmatter.published : latest,
    "2026-09-30",
  );
  const items = posts
    .map((post) => {
      const url = `${SITE.url}${newsPath(post.slug)}`;
      return `<item><title>${xml(post.frontmatter.title)}</title><link>${url}</link><guid isPermaLink="true">${url}</guid><description>${xml(post.frontmatter.description)}</description><pubDate>${new Date(`${post.frontmatter.published}T12:00:00Z`).toUTCString()}</pubDate><category>${xml(post.frontmatter.category)}</category></item>`;
    })
    .join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xml(SITE.name)} Blog</title><link>${SITE.url}/blog</link><description>${xml(SITE.description)}</description><language>en-us</language><lastBuildDate>${new Date(`${latestPublished}T12:00:00Z`).toUTCString()}</lastBuildDate>${items}</channel></rss>`,
    { headers: { "Content-Type": "application/rss+xml; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
