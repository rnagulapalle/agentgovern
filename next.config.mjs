/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Opt-in fresh builds on space-constrained laptops; all release gates still run.
  ...(process.env.LOOPLABS_DISABLE_BUILD_CACHE === "1" ? {
    webpack(config) {
      config.cache = false;
      return config;
    },
  } : {}),
  // Self-contained server bundle for small Docker images (.next/standalone).
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  skipTrailingSlashRedirect: true,
  async rewrites() {
    return [
      {
        source: "/ph/static/:path*",
        destination: "https://us-assets.i.posthog.com/static/:path*",
      },
      {
        source: "/ph/:path*",
        destination: "https://us.i.posthog.com/:path*",
      },
    ];
  },
};

export default nextConfig;
