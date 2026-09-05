import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: { unoptimized: true }, // TMDB CDN serves pre-optimized sizes; we use direct lazy <img>
  experimental: {
    // tree-shake barrel imports → smaller client bundles
    optimizePackageImports: ["framer-motion", "lenis"],
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
