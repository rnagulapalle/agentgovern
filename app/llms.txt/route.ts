import { listNewsPosts, newsPath } from "@/lib/news-markdown";
import { SITE, PRODUCT_PILLARS } from "@/lib/site";

export const dynamic = "force-static";

export function GET() {
  const posts = listNewsPosts()
    .map((post) => `- [${post.frontmatter.title}](${SITE.url}${newsPath(post.slug)}): ${post.frontmatter.description}`)
    .join("\n");
  const pillars = PRODUCT_PILLARS.map((pillar) => `- ${pillar.title}: ${pillar.body}`).join("\n");

  return new Response(`# LoopLabs\n\n> ${SITE.description}\n\nLoopLabs is an early-stage agent control-plane prototype with founder-led workflow design and implementation. Invited users have a private workspace with saved agent identities, discount approval and recovery controls on a sample record, and a prepared refund workflow against a simulated payment provider. Other prepared examples use deterministic browser-local simulations. No real money moves and no model runs. It does not connect to production business systems, execute live third-party actions, provide a durable audit service, or offer a self-service visual workflow builder.\n\n## Product direction\n\n${pillars}\n\n## Primary pages\n\n- [Homepage](${SITE.url})\n- [Product overview](${SITE.url}/platform)\n- [Contact sales](${SITE.url}/contact-sales)\n- [Implementation guides](${SITE.url}/guides)\n- [Blog](${SITE.url}/blog)\n\n## Writing\n\n${posts}\n\n## Contact\n\n- ${SITE.email}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  });
}
