import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SITE } from "@/lib/site";
import "./globals.css";

// Matches the FetchSandbox product brand: Inter for UI, JetBrains Mono for technical metadata.
const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: {
    default: SITE.title,
    template: "%s · AgentGovernance",
  },
  description: SITE.description,
  keywords: [
    "AI governance",
    "enterprise AI controls",
    "AI security",
    "AI approvals",
    "AI access control",
    "AI audit trail",
    "AI compliance",
    "AI risk management",
    "human approval AI",
    "Copilot governance",
    "ChatGPT Enterprise security",
  ],
  authors: [{ name: SITE.name, url: SITE.url }],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: SITE.url,
    siteName: SITE.name,
    title: SITE.title,
    description: SITE.description,
    images: [
      {
        url: "/media/og.png",
        width: 1200,
        height: 630,
        alt: "AgentGovernance — control what your company's AI is allowed to do",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE.title,
    description: SITE.description,
    images: ["/media/og.png"],
    creator: SITE.twitter,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body>{children}</body>
    </html>
  );
}
