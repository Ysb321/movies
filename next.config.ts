import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: { unoptimized: true }, // TMDB CDN serves pre-optimized sizes; we use direct lazy <img>
  // always emit the self-contained server bundle (used by desktop packaging;
  // harmless for dev / next start / Vercel)
  output: "standalone",
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
