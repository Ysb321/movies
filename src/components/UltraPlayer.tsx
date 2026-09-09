"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

type Props = {
  type: "movie" | "tv";
  tmdbId: string;
  title: string;
  year?: string;
  season: number;
  episode: number;
  /** player-list endpoint root (default /api/ultrastream/stream) */
  endpoint?: string;
  loadLines?: string[];
  emptyHint?: string;
};

type Embed = { title: string; url: string };

const DEFAULT_LINES = [
  "Contacting UltraStream sources...",
  "Searching Hindi-dubbed posts...",
  "Still searching - finding the player...",
  "Almost there - loading the player...",
];

export default function UltraPlayer({
  type, tmdbId, title, year, season, episode,
  endpoint, loadLines, emptyHint,
}: Props) {
  const [embeds, setEmbeds] = useState<Embed[] | null>(null);
  const [postTitle, setPostTitle] = useState("");
  const [err, setErr] = useState("");
  const [diag, setDiag] = useState("");
  const [sel, setSel] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [lineIdx, setLineIdx] = useState(0);

  const kind = type === "tv" ? "series" : "movie";
  const id = type === "tv" ? `${tmdbId}:${season}:${episode}` : tmdbId;
  const lines = loadLines?.length ? loadLines : DEFAULT_LINES;

  useEffect(() => {
    let cancelled = false;
    setEmbeds(null);
    setErr("");
    setDiag("");
    setSel(0);
    setLineIdx(0);
    const tick = setInterval(() => setLineIdx((i) => i + 1), 4000);
    (async () => {
      try {
        const res = await fetch(
          `${endpoint || "/api/ultrastream/stream"}/${kind}/${id}?title=${encodeURIComponent(title)}${year ? `&year=${encodeURIComponent(year)}` : ""}`
        );
        const body = await res.json().catch(() => ({}));
        if (cancelled) return;
        setDiag(typeof body.diag === "string" ? body.diag : "");
        const list: Embed[] = Array.isArray(body.embeds)
          ? body.embeds.filter((e: { url?: string }) => e && e.url)
          : [];
        if (list.length) {
          setPostTitle(typeof body.title === "string" ? body.title : "");
          setEmbeds(list);
        } else {
          setErr(body.laneError || "No UltraStream player found for this title.");
        }
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Request failed");
      }
    })();
    return () => {
      cancelled = true;
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, tmdbId, title, year, season, episode, reloadKey]);

  if (err || (embeds && !embeds.length)) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <span className="text-4xl">📺</span>
        <p className="text-sm font-bold">{err || "No player found"}</p>
        <p className="max-w-md text-[12.5px] text-neutral-400">
          {emptyHint || "UltraStream covers Hindi and Hindi-dubbed titles - try a Server above, or check back later."}
        </p>
        <div className="mt-1 flex items-center gap-2">
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="rounded-full bg-white/10 px-3.5 py-1.5 text-[12px] font-semibold text-neutral-200 transition hover:bg-white/20"
          >
            Retry
          </button>
        </div>
        {diag ? (
          <details className="mt-1 max-w-full">
            <summary className="cursor-pointer text-[11px] text-neutral-500">why?</summary>
            <p className="mt-1 break-all font-mono text-[10.5px] leading-relaxed text-neutral-500">{diag}</p>
          </details>
        ) : null}
      </div>
    );
  }

  if (!embeds) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
        <span className="text-4xl">⚡</span>
        <p className="text-[13px] font-semibold text-neutral-300">
          {lines[Math.min(lineIdx, lines.length - 1)]}
        </p>
        <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-brand" />
        </div>
      </div>
    );
  }

  const cur = embeds[Math.min(sel, embeds.length - 1)];
  return (
    <div className="flex h-full flex-col bg-black">
      <div className="flex flex-wrap items-center gap-1.5 px-2.5 pb-1.5 pt-2">
        <span className="mr-1 hidden text-[11px] font-semibold uppercase tracking-wider text-neutral-500 sm:inline">
          Players
        </span>
        {embeds.map((e, i) => (
          <button
            key={`${e.url}-${i}`}
            onClick={() => (i === sel ? setReloadKey((k) => k + 1) : setSel(i))}
            title={e.title}
            className={clsx(
              "max-w-[160px] truncate rounded-full px-3 py-1.5 text-[11px] font-semibold transition md:py-1",
              i === sel ? "bg-brand text-white" : "bg-white/10 text-neutral-300 hover:bg-white/20"
            )}
          >
            {e.title}
          </button>
        ))}
        {postTitle ? (
          <span className="ml-auto hidden max-w-[40%] truncate text-[11px] text-neutral-500 lg:inline">
            {postTitle}
          </span>
        ) : null}
      </div>
      <div className="relative min-h-0 flex-1">
        <iframe
          key={`${cur.url}-${reloadKey}`}
          src={cur.url}
          title={cur.title}
          className="h-full w-full"
          sandbox="allow-scripts allow-same-origin"
          scrolling="no"
          allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
          allowFullScreen
        />
      </div>
    </div>
  );
}
