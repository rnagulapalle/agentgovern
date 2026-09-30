import { listNewsPosts, newsPath } from "@/lib/news-markdown";
import { SITE, PRODUCT_PILLARS } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const posts = listNewsPosts()
    .map((post) => `- [${post.frontmatter.title}](${SITE.url}${newsPath(post.slug)}): ${post.frontmatter.description}`)
    .join("\n");
  const pillars = PRODUCT_PILLARS.map((pillar) => `- ${pillar.title}: ${pillar.body}`).join("\n");

  return new Response(`# LoopLabs\n\n> ${SITE.description}\n\nLoopLabs is the workflow and control layer for teams running AI agents in production.\n\n## Product\n\n${pillars}\n\n## Primary pages\n\n- [Homepage](${SITE.url})\n- [Interactive product tour](${SITE.url}/control-plane)\n- [Implementation guides](${SITE.url}/guides)\n- [Blog](${SITE.url}/blog)\n\n## Writing\n\n${posts}\n\n## Contact\n\n- ${SITE.email}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
