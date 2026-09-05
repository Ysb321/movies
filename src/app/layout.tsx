import type { Metadata, Viewport } from "next";
import "./globals.css";
import SWRProvider from "@/components/SWRProvider";

export const metadata: Metadata = {
  title: { default: "NetOut — Watch Movies, TV Shows, Animes & Dramas", template: "%s · NetOut" },
  description:
    "Watch movies, TV shows, anime and dramas online. Trending, Bollywood, Hollywood, Korean, Chinese and more — powered by TMDB.",
  applicationName: "NetOut",
};

export const viewport: Viewport = {
  themeColor: "#0b0b0f",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-ink text-white antialiased">
        <SWRProvider>{children}</SWRProvider>
      </body>
    </html>
  );
}
