import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter/wght.css";
import "@fontsource/anton/latin-400.css";
import "@fontsource/bebas-neue/latin-400.css";
import "./globals.css";
import SWRProvider from "@/components/SWRProvider";
import ServiceWorker from "@/components/ServiceWorker";

export const metadata: Metadata = {
  title: { default: "Yetflix — by Yashraj · Watch Movies, TV Shows, Animes & Dramas", template: "%s · Yetflix" },
  description:
    "Watch movies, TV shows, anime and dramas online. Trending, Bollywood, Hollywood, Korean, Chinese and more — powered by TMDB.",
  applicationName: "Yetflix",
  authors: [{ name: "Yashraj" }],
  creator: "Yashraj",
};

/* Cloudflare Pages (next-on-pages) requires the Edge runtime on all routes */
export const runtime = "edge";

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* warm up TMDB connections early — faster first images & API calls */}
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://api.themoviedb.org" />
        <link rel="dns-prefetch" href="https://www.youtube.com" />
      </head>
      <body className="min-h-screen bg-ink text-white antialiased">
        <SWRProvider>{children}</SWRProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
