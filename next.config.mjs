/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Self-contained server bundle for small Docker images (.next/standalone).
  output: "standalone",
};

export default nextConfig;
