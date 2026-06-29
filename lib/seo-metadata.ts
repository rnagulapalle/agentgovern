import type { Metadata } from "next";
import { SITE } from "@/lib/site";

export function buildSeoMetadata(opts: {
  title: string;
  description: string;
  path: string;
  keywords?: string[];
  socialTitle?: string;
  socialDescription?: string;
}): Metadata {
  const ogTitle = opts.socialTitle ?? opts.title;
  const ogDescription = opts.socialDescription ?? opts.description;

  return {
    title: opts.title,
    description: opts.description,
    keywords: opts.keywords,
    alternates: { canonical: opts.path },
    openGraph: {
      type: "article",
      url: `${SITE.url}${opts.path}`,
      siteName: SITE.name,
      title: ogTitle,
      description: ogDescription,
      images: [{ url: "/media/og.jpg", width: 1200, height: 630, alt: SITE.name }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription,
      images: ["/media/og.jpg"],
      creator: SITE.twitter,
    },
  };
}

export type FaqItem = { q: string; a: string };

export function faqJsonLd(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: { "@type": "Answer", text: item.a },
    })),
  };
}

export function articleJsonLd(opts: {
  headline: string;
  description: string;
  path: string;
  datePublished?: string;
  dateModified?: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: opts.headline,
    description: opts.description,
    url: `${SITE.url}${opts.path}`,
    datePublished: opts.datePublished ?? "2026-06-28",
    dateModified: opts.dateModified ?? "2026-06-28",
    author: { "@type": "Organization", name: SITE.name, url: SITE.url },
    publisher: { "@type": "Organization", name: SITE.name, url: SITE.url },
  };
}
