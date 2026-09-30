import { notFound } from "next/navigation";
import { buildSeoMetadata, articleJsonLd } from "@/lib/seo-metadata";
import { listNewsSlugs, loadNewsPost, newsPath } from "@/lib/news-markdown";
import { NewsArticleShell, NewsMarkdownBody } from "@/components/news/NewsArticle";

type Params = Promise<{ slug: string }>;

export function generateStaticParams() {
  return listNewsSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Params }) {
  const { slug } = await params;
  const post = loadNewsPost(slug);
  if (!post) return {};
  return buildSeoMetadata({
    title: post.frontmatter.title,
    description: post.frontmatter.description,
    path: newsPath(slug),
    keywords: post.frontmatter.tags,
    imagePath: `${newsPath(slug)}/opengraph-image`,
  });
}

export default async function BlogArticlePage({ params }: { params: Params }) {
  const { slug } = await params;
  const post = loadNewsPost(slug);
  if (!post) notFound();

  const article = articleJsonLd({
    headline: post.frontmatter.title,
    description: post.frontmatter.description,
    path: newsPath(slug),
    datePublished: post.frontmatter.published,
    dateModified: post.frontmatter.published,
  });
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://looplabs.run" },
      { "@type": "ListItem", position: 2, name: "Blog", item: "https://looplabs.run/blog" },
      { "@type": "ListItem", position: 3, name: post.frontmatter.title, item: `https://looplabs.run${newsPath(slug)}` },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify([article, breadcrumb]) }} />
      <NewsArticleShell
        title={post.frontmatter.title}
        description={post.frontmatter.description}
        published={post.frontmatter.published}
        category={post.frontmatter.category}
        relatedGuide={post.frontmatter.relatedGuide}
      >
        <NewsMarkdownBody body={post.body} />
      </NewsArticleShell>
    </>
  );
}
