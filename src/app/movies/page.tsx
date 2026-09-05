"use client";

import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import BrowseGrid from "@/components/BrowseGrid";

export default function MoviesPage() {
  return (
    <main className="min-h-screen bg-ink">
      <Navbar />
      <BrowseGrid options={{ type: "movie", heading: "Movies" }} />
      <Footer />
    </main>
  );
}
