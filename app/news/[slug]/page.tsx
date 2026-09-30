import { permanentRedirect } from "next/navigation";

type Params = Promise<{ slug: string }>;

export default async function LegacyNewsArticle({ params }: { params: Params }) {
  const { slug } = await params;
  permanentRedirect(`/blog/${slug}`);
}
