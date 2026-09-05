"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navbar from "@/components/Navbar";
import Row from "@/components/Row";
import SetupNotice from "@/components/SetupNotice";
import { useTmdbSnapshot } from "@/components/SWRProvider";
import { img, titleOf, yearOf } from "@/lib/tmdb";
import { saveProgress, inList, toggleList } from "@/lib/storage";
import { vidcoreUrl } from "@/lib/player";
import { ChevronIcon, PlayIcon, PlusIcon, CheckIcon, StarIcon } from "@/components/Icons";
import clsx from "clsx";

export default function WatchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-ink" />}>
      <WatchContent />
    </Suspense>
  );
}

function WatchContent() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const sp = useSearchParams();
  const t = type === "tv" ? "tv" : "movie";
  const [season, setSeason] = useState(Number(sp.get("s") ?? 1) || 1);
  const [episode, setEpisode] = useState(Number(sp.get("e") ?? 1) || 1);
  const playerRef = useRef<HTMLDivElement>(null);

  const { data: d, error } = useTmdbSnapshot<any>(
    `${t}/${id}?append_to_response=credits,recommendations,similar,images&include_image_language=en,null`
  );
  const { data: seasonData } = useTmdbSnapshot<any>(t === "tv" ? `tv/${id}/season/${season}` : null);

  const title = d ? titleOf(d) : `Loading…`;
  const seasons = useMemo(
    () => (d?.seasons ?? []).filter((s: any) => s.season_number > 0 && s.episode_count > 0),
    [d]
  );

  // track progress for Continue Watching
  useEffect(() => {
    if (!d) return;
    saveProgress({
      id: Number(id),
      type: t as "movie" | "tv",
      title: titleOf(d),
      poster_path: d.poster_path,
      backdrop_path: d.backdrop_path,
      vote_average: d.vote_average,
      year: yearOf(d),
      season: t === "tv" ? season : undefined,
      episode: t === "tv" ? episode : undefined,
      episodeCount: seasonData?.episodes?.length,
    });
  }, [d, id, t, season, episode, seasonData]);

  const goEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    playerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const similar = useMemo(() => {
    const items = d?.recommendations?.results?.length ? d.recommendations.results : d?.similar?.results ?? [];
    return items.map((i: any) => ({ ...i, media_type: i.media_type ?? (i.first_air_date ? "tv" : "movie") }));
  }, [d]);

  const [saved, setSaved] = useState(false);
  useEffect(() => setSaved(inList(Number(id))), [id]);

  return (
    <main className="min-h-screen bg-ink">
      <Navbar />

      <div ref={playerRef} className="mx-auto w-full max-w-[1500px] scroll-mt-16 px-[2vw] pt-20 md:pt-24">
        <div className="mb-3 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <Link href={`/title/${t}/${id}`} className="group flex items-center gap-2 text-[13px] text-neutral-400 hover:text-white">
              <ChevronIcon dir="left" className="h-4 w-4" /> Back to details
            </Link>
            <h1 className="mt-1 truncate text-xl font-bold md:text-2xl">
              {title}
              {t === "tv" && (
                <span className="ml-2 text-sm font-medium text-neutral-400">
                  S{season}:E{episode}
                  {seasonData?.episodes?.[episode - 1]?.name ? ` — ${seasonData.episodes[episode - 1].name}` : ""}
                </span>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {d && (
              <span className="hidden items-center gap-1 rounded bg-black/50 px-2 py-1 text-[12px] font-semibold text-amber-400 sm:flex">
                <StarIcon className="h-3 w-3" /> {(d.vote_average ?? 0).toFixed(1)}
              </span>
            )}
            <button
              onClick={() => {
                if (!d) return;
                toggleList({ id: Number(id), type: t as "movie" | "tv", title: titleOf(d), poster_path: d.poster_path, backdrop_path: d.backdrop_path, vote_average: d.vote_average, year: yearOf(d) });
                setSaved(!saved);
              }}
              aria-label="My List"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-neutral-500 text-white transition hover:border-white"
            >
              {saved ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* ── VidCore player ── */}
        <div className="relative aspect-video w-full overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
          <iframe
            key={`${t}-${id}-${season}-${episode}`}
            src={vidcoreUrl(t as "movie" | "tv", id, season, episode)}
            title={title}
            className="h-full w-full"
            allow="autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer"
            allowFullScreen
            referrerPolicy="origin"
          />
        </div>

        {!d && error && (
          <div className="mt-6">
            <SetupNotice error={error} />
          </div>
        )}

        {/* TV episodes */}
        {t === "tv" && seasons.length > 0 && (
          <div className="mt-8">
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <h2 className="mr-2 text-lg font-bold">Episodes</h2>
              {seasons.map((s: any) => (
                <button
                  key={s.id}
                  onClick={() => goEpisode(s.season_number, 1)}
                  className={clsx(
                    "rounded-full px-3.5 py-1 text-[12.5px] font-semibold transition",
                    season === s.season_number ? "bg-brand text-white" : "bg-white/10 text-neutral-300 hover:bg-white/20"
                  )}
                >
                  {s.name?.replace("Season", "S")}
                </button>
              ))}
            </div>
            <div className="divide-y divide-white/5">
              {(seasonData?.episodes ?? []).map((ep: any) => {
                const current = ep.episode_number === episode;
                return (
                  <button
                    key={ep.id}
                    onClick={() => goEpisode(season, ep.episode_number)}
                    className={clsx(
                      "flex w-full items-start gap-4 rounded-md px-3 py-3 text-left transition hover:bg-white/5",
                      current && "bg-white/10 ring-1 ring-brand/60"
                    )}
                  >
                    <span className={clsx("w-7 shrink-0 pt-1 text-center text-[15px] font-bold", current ? "text-brand" : "text-neutral-500")}>
                      {ep.episode_number}
                    </span>
                    <div className="relative h-16 w-28 shrink-0 overflow-hidden rounded bg-panel-2 md:h-[74px] md:w-[132px]">
                      {ep.still_path && (
                        <img src={img(ep.still_path, "w300") ?? ""} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                      )}
                      {current && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                          <PlayIcon className="h-6 w-6 text-brand ring-glow" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <p className={clsx("truncate text-[14px] font-semibold", current && "text-brand")}>{ep.name}</p>
                        <span className="shrink-0 text-[12px] text-neutral-500">{ep.runtime ? `${ep.runtime}m` : ""}</span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-neutral-400">{ep.overview}</p>
                    </div>
                  </button>
                );
              })}
              {!seasonData &&
                Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton my-1 h-[92px] w-full" />)}
            </div>
          </div>
        )}

        {/* info */}
        {d && (
          <div className="mt-8 max-w-3xl">
            <p className="text-[14.5px] leading-relaxed text-neutral-300">{d.overview}</p>
            {(d.credits?.cast ?? []).length > 0 && (
              <p className="mt-3 text-[13px] text-neutral-500">
                <span className="text-neutral-400">Starring: </span>
                {d.credits.cast.slice(0, 5).map((c: any) => c.name).join(", ")}
              </p>
            )}
          </div>
        )}
      </div>

      {similar.length > 0 && (
        <div className="mt-10">
          <Row title="More Like This" items={similar} variant="backdrop" />
        </div>
      )}
    </main>
  );
}
