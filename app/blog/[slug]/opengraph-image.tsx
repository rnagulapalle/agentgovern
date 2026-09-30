import { ImageResponse } from "next/og";
import { notFound } from "next/navigation";
import { listNewsSlugs, loadNewsPost } from "@/lib/news-markdown";

export const alt = "LoopLabs article";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export function generateStaticParams() {
  return listNewsSlugs().map((slug) => ({ slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = loadNewsPost(slug);
  if (!post) notFound();

  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: "#f5f5f4", color: "#1c1917", padding: "66px 72px", border: "1px solid #d6d3d1", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, fontSize: 26, fontWeight: 700 }}>
        <div style={{ width: 36, height: 36, border: "2px solid #78716c", transform: "rotate(45deg)", display: "flex" }} />
        LoopLabs
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 1020 }}>
        <div style={{ fontSize: 19, letterSpacing: "0.16em", color: "#78716c", textTransform: "uppercase" }}>Agent workflows · actions · execution · recovery</div>
        <div style={{ fontSize: 60, lineHeight: 1.05, letterSpacing: "-0.045em", fontWeight: 700 }}>{post.frontmatter.title}</div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 20, color: "#78716c" }}>
        <span>looplabs.run</span><span>{post.frontmatter.published}</span>
      </div>
    </div>,
    size,
  );
}
