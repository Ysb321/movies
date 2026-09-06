import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: { unoptimized: true }, // TMDB CDN serves pre-optimized sizes; we use direct lazy <img>
  // self-contained server bundle for desktop packaging. Skipped on
  // Cloudflare Pages (CF_PAGES is auto-set there and never on a dev PC):
  // @cloudflare/next-on-pages needs the default server output.
  output: process.env.CF_PAGES ? undefined : "standalone",
  // pin tracing root to THIS project: a stray lockfile in a parent folder
  // must not move the standalone output into a nested layout
  outputFileTracingRoot: __dirname,
  experimental: {
    // Meta's React Compiler: auto-memoizes components at build time
    reactCompiler: true,
  },
  async headers() {
    return [
      {
        source: "/api/tmdb/:path*",
        headers: [
          { key: "Cache-Control", value: "public, s-maxage=300, stale-while-revalidate=86400" },
        ],
      },
    ];
  },
  async rewrites() {
    return [{ source: "/favicon.ico", destination: "/icon.svg" }];
  },
};

export default nextConfig;
