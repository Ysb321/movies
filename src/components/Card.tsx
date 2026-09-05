"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { img, titleOf, yearOf, typeOf, type Media } from "@/lib/tmdb";
import { genreNames, MOVIE_GENRES } from "@/lib/rows";
import { toggleList, inList, type ProgressItem } from "@/lib/storage";
import { wasRecentlyDragged } from "@/lib/dragGuard";
import { PlayIcon, PlusIcon, CheckIcon, XIcon, StarIcon } from "./Icons";

const runtimeLabel = (m: Media) => {
  if (typeOf(m) === "movie" && m.runtime) return `${Math.floor(m.runtime / 60)}h ${m.runtime % 60}m`;
  return "";
};

/** Netflix-style card: poster/backdrop with in-card hover overlay
 *  (play / my-list / match % / genres) + continue-watching progress bar. */
export default function Card({
  item,
  variant = "backdrop",
  rank,
  progress,
  onRemove,
  className,
}: {
  item: Media;
  variant?: "backdrop" | "poster";
  rank?: number; // top-10 ranking
  progress?: ProgressItem; // continue-watching bar
  onRemove?: () => void;
  className?: string;
}) {
  const router = useRouter();
  const [saved, setSaved] = useState(() => inList(item.id));
  const type = typeOf(item);
  const poster = variant === "poster" || rank !== undefined;
  const src = poster
    ? img(item.poster_path ?? item.backdrop_path, "w342") ?? img(item.backdrop_path, "w780")
    : img(item.backdrop_path ?? item.poster_path, "w500") ?? img(item.poster_path, "w342");
  const match = Math.round((item.vote_average ?? 0) * 10);

  // resume: clicking a continue-watching card plays straight from where it
  // left off (exact season/episode + startAt); other cards open details
  const open = () => {
    if (wasRecentlyDragged()) return;
    if (progress) {
      play();
      return;
    }
    router.push(`/title/${type}/${item.id}`);
  };
  const play = () => {
    if (wasRecentlyDragged()) return;
    if (type === "tv" && progress?.season && progress?.episode)
      router.push(`/watch/tv/${item.id}?s=${progress.season}&e=${progress.episode}`);
    else router.push(type === "tv" ? `/watch/tv/${item.id}?s=1&e=1` : `/watch/movie/${item.id}`);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => e.key === "Enter" && open()}
      aria-label={titleOf(item)}
      className={clsx(
        "group/card relative cursor-pointer rounded-md transition-transform duration-300 ease-[cubic-bezier(.22,.61,.36,1)]",
        "hover:z-30 hover:scale-[1.12] hover:card-shadow focus-visible:scale-[1.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60",
        className
      )}
    >
      {/* image */}
      <div
        className={clsx(
          "relative overflow-hidden rounded-md bg-panel-2",
          poster ? "aspect-[2/3]" : "aspect-video"
        )}
      >
        {src ? (
          <img
            src={src}
            alt={titleOf(item)}
            loading="lazy"
            decoding="async"
            draggable={false}
            className="h-full w-full object-cover no-drag"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-panel-2 to-panel p-3 text-center text-xs font-semibold text-neutral-400">
            {titleOf(item)}
          </div>
        )}

        {/* top-10 rank */}
        {rank !== undefined && (
          <div
            className="absolute -left-2 bottom-0 z-10 flex select-none items-end leading-none font-black text-[6.5rem] text-black"
            style={{ WebkitTextStroke: "3px #737373", letterSpacing: "-0.08em" }}
          >
            {rank}
          </div>
        )}

        {/* poster rating badge */}
        {poster && (item.vote_average ?? 0) > 0 && (
          <div className="absolute right-1.5 top-1.5 z-10 flex items-center gap-1 rounded bg-black/65 px-1.5 py-0.5 text-[10px] font-bold text-amber-400 backdrop-blur-sm transition group-hover/card:opacity-0">
            <StarIcon className="h-2.5 w-2.5" />
            {(item.vote_average ?? 0).toFixed(1)}
          </div>
        )}

        {/* continue-watching progress */}
        {progress && (
          <div className="absolute inset-x-2 bottom-1.5 z-10 h-[3px] rounded bg-white/30 transition group-hover/card:opacity-0">
            <div
              className="h-full rounded bg-brand"
              style={{
                width:
                  progress.positionSec && progress.durationSec
                    ? `${Math.min(98, (progress.positionSec / progress.durationSec) * 100)}%`
                    : progress.season
                      ? `${Math.min(92, 8 + progress.episode! * 18)}%`
                      : "42%",
              }}
            />
          </div>
        )}

        {/* title strip for backdrop cards (hidden on hover) */}
        {!poster && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] rounded-b-md bg-gradient-to-t from-black/85 via-black/45 to-transparent px-2.5 pb-1.5 pt-6 transition-opacity duration-200 group-hover/card:opacity-0">
            <p className="truncate text-[12.5px] font-semibold text-neutral-100 drop-shadow">{titleOf(item)}</p>
          </div>
        )}

        {/* ── in-card hover overlay (netflix style) — visibility-gated so
             hidden overlays cost nothing to paint ── */}
        <div className="pointer-events-none invisible absolute inset-0 z-20 flex flex-col justify-end rounded-md bg-gradient-to-t from-black/95 via-black/45 to-transparent p-2 opacity-0 transition-opacity duration-300 group-hover/card:visible group-hover/card:opacity-100 group-focus-within/card:visible group-focus-within/card:opacity-100">
          <div className="pointer-events-auto">
            <div className="mb-1.5 flex items-center gap-1.5">
              <button
                onClick={(e) => { e.stopPropagation(); play(); }}
                aria-label="Play"
                className="flex h-7 w-7 items-center justify-center rounded-full bg-white text-black transition hover:scale-110 hover:bg-neutral-300"
              >
                <PlayIcon className="ml-0.5 h-3.5 w-3.5" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleList({ id: item.id, type, title: titleOf(item), poster_path: item.poster_path, backdrop_path: item.backdrop_path, vote_average: item.vote_average, year: yearOf(item) });
                  setSaved(!saved);
                }}
                aria-label="My List"
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-neutral-400 bg-black/40 text-white transition hover:scale-110 hover:border-white"
              >
                {saved ? <CheckIcon className="h-3.5 w-3.5" /> : <PlusIcon className="h-3.5 w-3.5" />}
              </button>
              {onRemove && (
                <button
                  onClick={(e) => { e.stopPropagation(); onRemove(); }}
                  aria-label="Remove"
                  className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-neutral-400 bg-black/40 text-white transition hover:scale-110 hover:border-white"
                >
                  <XIcon className="h-3.5 w-3.5" />
                </button>
              )}
              <span className="ml-auto flex items-center gap-1 text-[11px] font-bold text-amber-400">
                <StarIcon className="h-3 w-3" />
                {(item.vote_average ?? 0).toFixed(1)}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
              <span className="font-bold text-emerald-500">{match}% Match</span>
              {yearOf(item) && <span className="text-neutral-400">{yearOf(item)}</span>}
              <span className="rounded border border-neutral-600 px-1 text-[9px] font-medium text-neutral-300">HD</span>
              {runtimeLabel(item) && <span className="text-neutral-400">{runtimeLabel(item)}</span>}
            </div>
            <div className="mt-0.5 truncate text-[10px] text-neutral-400">
              {genreNames(item, MOVIE_GENRES).join(" • ")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
