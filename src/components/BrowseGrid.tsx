"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import { motion } from "framer-motion";
import Card from "./Card";
import { swrFetcher, type Media } from "@/lib/tmdb";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/rows";
import clsx from "clsx";

export type BrowseOptions = {
  type: "movie" | "tv";
  genre?: number; // optional genre filter
  heading: string;
};

/** Infinite poster grid — discover/search pages share this. Pages stream in
 *  via useSWRInfinite; a sentinel triggers the next page before you reach the
 *  bottom, so scrolling never stalls. */
export default function BrowseGrid({ options }: { options: BrowseOptions }) {
  const { type, genre, heading } = options;
  const [activeGenre, setActiveGenre] = useState<number | undefined>(genre);
  const genres = type === "movie" ? MOVIE_GENRES : TV_GENRES;

  useEffect(() => setActiveGenre(genre), [genre]);

  const params = useMemo(() => {
    const p = new URLSearchParams({
      sort_by: "popularity.desc",
      include_adult: "false",
      "vote_count.gte": type === "movie" ? "80" : "25",
    });
    if (type === "tv") p.set("with_origin_country", ""); // all regions
    if (activeGenre) p.set("with_genres", String(activeGenre));
    return p;
  }, [type, activeGenre]);

  const getKey = (index: number) => `discover/${type}?${params.toString()}&page=${index + 1}`;
  const { data, size, setSize, isLoading, error } = useSWRInfinite<any>(getKey, swrFetcher, {
    revalidateFirstPage: false,
    revalidateAll: false,
    keepPreviousData: true,
    initialSize: 2,
  });

  const items = useMemo(() => {
    const seen = new Set<number>();
    const out: Media[] = [];
    for (const page of data ?? [])
      for (const r of page?.results ?? []) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          out.push({ ...r, media_type: type });
        }
      }
    return out;
  }, [data, type]);

  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          const total = data?.[0]?.total_pages ?? 1;
          if (size < Math.min(total, 50)) setSize(size + 1);
        }
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [size, setSize, data]);

  return (
    <div className="px-[4vw] pb-10">
      <div className="mb-5 flex flex-wrap items-center gap-2 pt-24 md:pt-28">
        <h1 className="mr-3 text-2xl font-bold md:text-3xl">{heading}</h1>
        <div className="flex flex-wrap gap-1.5">
          <Chip active={activeGenre === undefined} onClick={() => setActiveGenre(undefined)}>
            All
          </Chip>
          {Object.entries(genres).map(([id, name]) => (
            <Chip key={id} active={activeGenre === Number(id)} onClick={() => setActiveGenre(Number(id))}>
              {name}
            </Chip>
          ))}
        </div>
      </div>

      {error && items.length === 0 ? (
        <div className="flex h-64 items-center justify-center text-neutral-400">
          Couldn&rsquo;t load titles. Check your TMDB API key.
        </div>
      ) : items.length === 0 && isLoading ? (
        <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3]" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-14 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {items.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, delay: i % 14 === 0 ? 0 : 0 }}
              className="cv-auto"
            >
              <Card item={m} variant="poster" className="w-full" />
            </motion.div>
          ))}
          {size < 50 &&
            Array.from({ length: 7 }).map((_, i) => (
              <div key={`s${i}`} className="skeleton aspect-[2/3] opacity-60" />
            ))}
        </div>
      )}
      <div ref={sentinel} className="h-2" />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-full px-3 py-1 text-[12px] font-medium transition",
        active ? "bg-white text-black" : "bg-white/10 text-neutral-300 hover:bg-white/20"
      )}
    >
      {children}
    </button>
  );
}
