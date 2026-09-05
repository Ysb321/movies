"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import Card from "./Card";
import SetupNotice from "./SetupNotice";
import { swrFetcher, type Media } from "@/lib/tmdb";
import { MOVIE_GENRES, TV_GENRES } from "@/lib/rows";
import clsx from "clsx";

export type BrowseOptions = {
  type: "movie" | "tv";
  genre?: number; // optional genre filter
  heading: string;
};

const PAGE_CAP = 500; // TMDB discover caps at 500 pages

/** Infinite poster grid (Movies / TV / Genres). Pages stream in via
 *  useSWRInfinite with a stable, cooldown-guarded IntersectionObserver —
 *  no runaway fetch loops, no observer churn, smooth on huge lists. */
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
    if (activeGenre) p.set("with_genres", String(activeGenre));
    return p;
  }, [type, activeGenre]);

  const getKey = (index: number) => `discover/${type}?${params.toString()}&page=${index + 1}`;
  const { data, size, setSize, isLoading, isValidating, error } = useSWRInfinite<any>(getKey, swrFetcher, {
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

  const total = data?.[0]?.total_pages ?? 1;
  const hasMore = size < Math.min(total, PAGE_CAP);

  /* ── stable infinite-scroll sentinel (never recreated, ref-driven) ── */
  const sentinel = useRef<HTMLDivElement>(null);
  const busyRef = useRef(true);
  const hasMoreRef = useRef(true);
  const sizeRef = useRef(size);
  const setSizeRef = useRef(setSize);
  useEffect(() => void (busyRef.current = isLoading || isValidating), [isLoading, isValidating]);
  useEffect(() => void (hasMoreRef.current = hasMore), [hasMore]);
  useEffect(() => void (sizeRef.current = size), [size]);
  setSizeRef.current = setSize;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    let cooldown = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (busyRef.current || !hasMoreRef.current) return;
        const now = performance.now();
        if (now - cooldown < 400) return; // one page per 400ms max
        cooldown = now;
        setSizeRef.current(sizeRef.current + 1);
      },
      { rootMargin: "800px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="px-[4vw] pb-10">
      <div className="mb-5 flex flex-wrap items-center gap-2 pt-24 md:pt-28">
        <h1 className="font-display mr-3 text-3xl tracking-wide md:text-5xl">{heading}</h1>
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
        <SetupNotice error={error} />
      ) : items.length === 0 && isLoading ? (
        <div className="grid grid-cols-3 gap-x-2.5 gap-y-10 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
          {Array.from({ length: 21 }).map((_, i) => (
            <div key={i} className="skeleton aspect-[2/3]" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-x-2.5 gap-y-10 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 2xl:grid-cols-8">
            {items.map((m) => (
              <div key={m.id}>
                <Card item={m} variant="poster" className="w-full" />
              </div>
            ))}
            {isValidating && hasMore &&
              Array.from({ length: 7 }).map((_, i) => <div key={`s${i}`} className="skeleton aspect-[2/3] opacity-60" />)}
          </div>
          <div ref={sentinel} className="h-4" />
          <div className="flex flex-col items-center gap-2 py-4">
            {hasMore ? (
              <button
                onClick={() => setSize(size + 1)}
                disabled={isValidating || isLoading}
                className="rounded-md bg-brand px-8 py-2.5 text-sm font-bold text-white shadow transition hover:scale-[1.03] hover:bg-brand-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isValidating || isLoading ? "Loading…" : `Load More — ${items.length.toLocaleString()} loaded`}
              </button>
            ) : (
              <p className="text-[12px] text-neutral-500">
                {items.length.toLocaleString()} titles · You&rsquo;ve reached the end
              </p>
            )}
          </div>
        </>
      )}
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
