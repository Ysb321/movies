"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import clsx from "clsx";
import Navbar from "@/components/Navbar";
import Row from "@/components/Row";
import SetupNotice from "@/components/SetupNotice";
import { useTmdbSnapshot } from "@/components/SWRProvider";
import { img, titleOf, yearOf, bestLogo, kidsSafeItem } from "@/lib/tmdb";
import { embedUrl, getProvider, PROVIDERS, parsePlayerEvent, fmtTime, PLAYER_SANDBOX } from "@/lib/player";
import { scrollToEl } from "@/lib/scroll";
import {
  saveProgress, updateProgressPosition, inList, toggleList,
  getResume, saveResume, clearResume, resumeKeyFor, isKidsActive,
} from "@/lib/storage";
import { ChevronIcon, PlayIcon, PlusIcon, CheckIcon, StarIcon, RotateCcwIcon } from "@/components/Icons";

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
  const [serverId, setServerId] = useState("vidzee");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setServerId(() => {
      try { return localStorage.getItem("yetflix:server") || "vidzee"; } catch { return "vidzee"; }
    });
  }, []);
  const switchServer = (id: string) => {
    setServerId(id);
    try { localStorage.setItem("yetflix:server", id); } catch {}
  };
const provider = getProvider(serverId);
  const playerRef = useRef<HTMLDivElement>(null); /* scroll target: page container */
  const lastTime = useRef<{ time: number; duration?: number } | null>(null);
  const lastSaved = useRef(0);

  const { data: d, error } = useTmdbSnapshot<any>(
    `${t}/${id}?append_to_response=credits,recommendations,similar,images,external_ids&include_image_language=en,null`
  );
  const { data: seasonData } = useTmdbSnapshot<any>(t === "tv" ? `tv/${id}/season/${season}` : null);
  const logoPath = bestLogo(d?.images);
  /* Kids mode: block non-kids content reached by direct URL */
  const kidsBlocked = !!d && isKidsActive() && !kidsSafeItem(d);
    /* VidCore indexes best by IMDb id; Videasy is TMDB-native */
  const embedId: string = provider.prefersImdb ? (d?.external_ids?.imdb_id || (id as string)) : (id as string);

  const title = d ? titleOf(d) : "Loading…";
  const seasons = useMemo(
    () => (d?.seasons ?? []).filter((s: any) => s.season_number > 0 && s.episode_count > 0),
    [d]
  );

  /* ── resume: pick up exactly where the user left off (startAt) ── */
  const [embed, setEmbed] = useState<{ src: string; resumedFrom?: number } | null>(null);

  useEffect(() => {
    const rkey = resumeKeyFor(t, id, season, episode);
    const saved = getResume(rkey);
    const resume =
      saved && saved.positionSec > 10 && (!saved.durationSec || saved.positionSec < saved.durationSec * 0.97)
        ? Math.floor(saved.positionSec)
        : undefined;
    setEmbed({ src: embedUrl(provider, t, embedId, { s: season, e: episode, startAt: resume }), resumedFrom: resume });
    lastSaved.current = resume ?? 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [t, id, season, episode, provider.id, embedId]);

  const startOver = () => {
    clearResume(resumeKeyFor(t, id, season, episode));
    lastTime.current = null;
    lastSaved.current = 0;
    setEmbed({ src: embedUrl(provider, t, embedId, { s: season, e: episode }) });
  };

  /* ── listen to player postMessage events → persist exact position ── */
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const pt = parsePlayerEvent(e);
      if (!pt) return;
      const rkey = resumeKeyFor(t, id, season, episode);
      if (pt.ended) {
        clearResume(rkey);
        updateProgressPosition((p) => p.id === Number(id) && p.type === t, { positionSec: 0 });
        lastTime.current = null;
        return;
      }
      lastTime.current = { time: pt.time, duration: pt.duration };
      if (pt.time - lastSaved.current >= 5) {
        lastSaved.current = pt.time;
        saveResume(rkey, pt.time, pt.duration);
        updateProgressPosition(
          (p) => p.id === Number(id) && p.type === t,
          { positionSec: pt.time, durationSec: pt.duration ?? undefined, season: t === "tv" ? season : undefined, episode: t === "tv" ? episode : undefined }
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => {
      window.removeEventListener("message", onMessage);
      // persist the last known position on leave
      const lt = lastTime.current;
      if (lt && lt.time > 5) {
        const rkey = resumeKeyFor(t, id, season, episode);
        const dur = lt.duration ?? getResume(rkey)?.durationSec;
        if (!dur || lt.time < dur * 0.97) saveResume(rkey, lt.time, dur);
        else clearResume(rkey);
      }
    };
  }, [t, id, season, episode]);

  /* ── continue-watching row entry ── */
  useEffect(() => {
    if (!d) return;
    const rkey = resumeKeyFor(t, id, season, episode);
    const saved = getResume(rkey);
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
      positionSec: saved?.positionSec,
      durationSec: saved?.durationSec,
    });
  }, [d, id, t, season, episode, seasonData]);

  const goEpisode = (s: number, e: number) => {
    setSeason(s);
    setEpisode(e);
    scrollToEl(playerRef.current);
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
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <Link href={`/title/${t}/${id}`} className="group flex items-center gap-2 text-[13px] text-neutral-400 hover:text-white">
              <ChevronIcon dir="left" className="h-4 w-4" /> Back to details
            </Link>
            {/* wrap-safe on every width: title clamps to 2 lines, the S/E
             *  badge sits on its own line on phones (inline on md+) */}
            <h1 className="mt-1 line-clamp-2 break-words text-lg font-bold leading-snug md:text-2xl">
              {logoPath ? (
                <img
                  src={img(logoPath, "w500") ?? undefined}
                  alt={title}
                  draggable={false}
                  className="inline-block max-h-10 w-auto max-w-full object-contain align-middle sm:max-h-12 md:max-h-14"
                />
              ) : (
                title
              )}
              {t === "tv" && (
                <span className="mt-0.5 block truncate text-[13px] font-medium text-neutral-400 md:ml-2 md:inline md:truncate md:text-sm">
                  S{season}:E{episode}
                  {seasonData?.episodes?.[episode - 1]?.name ? ` — ${seasonData.episodes[episode - 1].name}` : ""}
                </span>
              )}
            </h1>
            {embed?.resumedFrom ? (
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="rounded-full bg-brand/20 px-2.5 py-0.5 font-semibold text-brand">
                  Resumed from {fmtTime(embed.resumedFrom)}
                </span>
                <button onClick={startOver} className="flex items-center gap-1 text-neutral-400 hover:text-white">
                  <RotateCcwIcon className="h-3.5 w-3.5" /> Start over
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
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

        {/* ── VidCore player (mounts after resume position is resolved) ── */}
        <div className="relative aspect-video max-h-[76vh] w-full overflow-hidden rounded-lg bg-black ring-1 ring-white/10">
          {kidsBlocked ? (
            <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
              <span className="text-4xl">🧒</span>
              <p className="text-lg font-bold">Not available in Kids profile</p>
              <p className="max-w-sm text-[13px] text-neutral-400">
                This title isn&rsquo;t suitable for kids. Ask a parent to enter the PIN to switch profiles.
              </p>
            </div>
          ) : embed ? (
            <iframe
              key={`${t}-${id}-${season}-${episode}-${embed.src}-${reloadKey}`}
              src={embed.src}
              title={title}
              className="h-full w-full"
              allow={`autoplay; encrypted-media; fullscreen; picture-in-picture; accelerometer${provider.denyPopups ? "; popups 'none'" : ""}`}
              sandbox={provider.sandbox === false ? undefined : provider.sandbox || PLAYER_SANDBOX}
              scrolling={provider.noScroll ? "no" : undefined}
              allowFullScreen
              referrerPolicy="origin"
            />
          ) : (
            <div className="skeleton h-full w-full rounded-none opacity-50" />
          )}
        </div>

        {/* ── Server switcher (below the player; wraps on small screens) ── */}

        {!kidsBlocked && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            Servers
          </span>
          {PROVIDERS.map((pv, i) => (
            <button
              key={pv.id}
              onClick={() => switchServer(pv.id)}
              className={clsx(
                "rounded-full px-3 py-1.5 text-[11px] font-semibold transition md:px-2.5 md:py-1",
                serverId === pv.id ? "bg-brand text-white" : "bg-white/10 text-neutral-300 hover:bg-white/20"
              )}
            >
              {`Server ${i + 1}`}
            </button>
          ))}
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            title="Reload player"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-neutral-300 transition hover:bg-white/20 hover:text-white md:h-7 md:w-7"
          >
            <RotateCcwIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        )}

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
            <div
              className="styled-scroll max-h-[68vh] divide-y divide-white/5 overflow-y-auto overscroll-auto pr-1.5"
            >
              {(seasonData?.episodes ?? []).map((ep: any) => {
                const current = ep.episode_number === episode;
                const epResume = getResume(resumeKeyFor("tv", id, season, ep.episode_number));
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
                        <span className="shrink-0 text-[12px] text-neutral-500">
                          {ep.runtime ? `${ep.runtime}m` : ""}
                          {epResume?.positionSec && epResume.durationSec && epResume.positionSec < epResume.durationSec * 0.97
                            ? ` · ${Math.round((epResume.positionSec / epResume.durationSec) * 100)}% watched`
                            : ""}
                        </span>
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
                {d.credits.cast.slice(0, 5).map((c: any, i: number) => (
                  <span key={c.id}>
                    <Link href={`/person/${c.id}`} className="text-neutral-300 hover:text-white hover:underline">
                      {c.name}
                    </Link>
                    {i < Math.min(5, d.credits.cast.length) - 1 ? ", " : ""}
                  </span>
                ))}
              </p>
            )}
          </div>
        )}
      </div>

      {similar.length > 0 && (
        <div className="mt-10">
          <Row title="More Like This" items={similar} />
        </div>
      )}
    </main>
  );
}
