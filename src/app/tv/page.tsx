"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BrowseGrid from "@/components/BrowseGrid";

export default function TvPage() {
  return (
    <main className="min-h-screen bg-ink">
      <Navbar />
      <BrowseGrid options={{ type: "tv", heading: "TV Shows" }} />
      <Footer />
    </main>
  );
}
