"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import Card from "@/components/Card";
import { useTmdbSnapshot } from "@/components/SWRProvider";
import { img, titleOf, type Media } from "@/lib/tmdb";

function SearchResults() {
  const params = useSearchParams();
  const q = (params.get("q") ?? "").trim();

  const { data, isLoading } = useTmdbSnapshot<any>(
    q ? `search/multi?query=${encodeURIComponent(q)}&include_adult=false&page=1` : "trending/all/day?page=1"
  );

  const { titles, people } = useMemo(() => {
    const results: Media[] = data?.results ?? [];
    return {
      titles: results.filter(
        (r) => (r.media_type === "movie" || r.media_type === "tv") && (r.poster_path || r.backdrop_path)
      ),
      people: results.filter((r) => r.media_type === "person" && r.profile_path),
    };
  }, [data]);

  if (!q) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-2xl font-semibold text-neutral-200">Find something to watch</p>
        <p className="text-sm text-neutral-500">Search across thousands of movies, TV shows, anime and people.</p>
      </div>
    );
  }

  if (isLoading && titles.length === 0 && people.length === 0) {
    return (
      <div className="grid grid-cols-3 gap-x-2.5 gap-y-14 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
        {Array.from({ length: 14 }).map((_, i) => (
          <div key={i} className="skeleton aspect-[2/3]" />
        ))}
      </div>
    );
  }

  if (titles.length === 0 && people.length === 0) {
    return (
      <div className="flex h-[60vh] flex-col items-center justify-center gap-2 text-center">
        <p className="text-lg text-neutral-300">
          Your search for &ldquo;{q}&rdquo; did not have any matches.
        </p>
        <p className="text-sm text-neutral-500">Suggestions: try different keywords, or a movie title.</p>
      </div>
    );
  }

  return (
    <>
      {titles.length > 0 && (
        <>
          <p className="mb-4 text-sm text-neutral-400">
            {q ? <>Titles related to <span className="font-semibold text-white">&ldquo;{q}&rdquo;</span></> : "Trending today"}
          </p>
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-14 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
            {titles.map((m) => (
              <Card key={`${m.media_type}-${m.id}`} item={m} variant="poster" className="w-full" />
            ))}
          </div>
        </>
      )}

      {people.length > 0 && (
        <>
          <p className="mb-4 mt-12 text-sm text-neutral-400">People</p>
          <div className="flex flex-wrap gap-5">
            {people.slice(0, 12).map((p) => (
              <div key={p.id} className="w-28">
                <Link href={`/search?q=${encodeURIComponent(p.name ?? "")}`} className="block">
                  <img
                    src={img(p.profile_path, "w185")!}
                    alt={p.name ?? ""}
                    loading="lazy"
                    decoding="async"
                    className="h-28 w-28 rounded-full object-cover ring-1 ring-white/15 transition hover:ring-white/60"
                  />
                  <p className="mt-2 truncate text-center text-[12.5px] font-medium text-neutral-200">{p.name}</p>
                  <p className="truncate text-center text-[11px] text-neutral-500">
                    {(p.known_for ?? []).slice(0, 2).map(titleOf).join(", ")}
                  </p>
                </Link>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}

export default function SearchPage() {
  return (
    <main className="min-h-screen bg-ink">
      <Navbar />
      <div className="px-[4vw] pb-10 pt-24 md:pt-28">
        <Suspense
          fallback={
            <div className="grid grid-cols-3 gap-x-2.5 gap-y-14 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
              {Array.from({ length: 14 }).map((_, i) => (
                <div key={i} className="skeleton aspect-[2/3]" />
              ))}
            </div>
          }
        >
          <SearchResults />
        </Suspense>
      </div>
      <Footer />
    </main>
  );
}
