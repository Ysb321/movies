"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import {
  fetchWsStreams,
  resolveWsUrl,
  openInVlc,
  parseStream,
  wsIds,
  isDesktopVlc,
  isAndroid,
  isIOS,
  playableInBrowser,
  type WsRow,
} from "@/lib/vlc";
import { PlayIcon, RotateCcwIcon, CheckIcon, ChevronIcon } from "@/components/Icons";

type Props = {
  type: "movie" | "tv";
  tmdbId: string;
  imdbId: string | null;
  season: number;
  episode: number;
};

type Status = "loading" | "ready" | "empty" | "error";

const LOAD_LINES = [
  "Contacting WebStreamr sources…",
  "Searching 20+ sites (HubCloud, HDHub4u, 4KHDHub…)…",
  "Still searching — big libraries take up to a minute…",
  "Almost there — resolving the last sources…",
];

const platformHint = () =>
  isDesktopVlc()
    ? "Tap a source — it opens in VLC"
    : isAndroid() || isIOS()
      ? "Tap a source — it opens in your VLC app"
      : "Tap a source — opens in VLC via the desktop app (link copied too)";

/** inline player for browser-compatible files (mp4/webm native, HLS via
 *  hls.js) - instant playback with zero installs; .mkv/Dolby still needs
 *  real VLC, so rows only offer this when the resolved file qualifies. */
function BrowserVideo({ url }: { url: string }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);
  const isHls = /\.m3u8(\?|#|$)/i.test(url);
  useEffect(() => {
    const v = ref.current;
    if (!v || !isHls) return;
    let hls: { destroy: () => void } | null = null;
    let dead = false;
    import("hls.js")
      .then(({ default: Hls }: any) => {
        if (dead || !ref.current) return;
        if (Hls.isSupported()) {
          const h = new Hls({ maxBufferLength: 30 });
          hls = h;
          h.loadSource(url);
          h.attachMedia(ref.current);
          h.on(Hls.Events.ERROR, (_evt: any, data: any) => {
            if (!dead && data.fatal) setFailed(true);
          });
        } else if (ref.current.canPlayType("application/vnd.apple.mpegurl")) {
          ref.current.src = url; /* Safari plays HLS natively */
        } else {
          setFailed(true);
        }
      })
      .catch(() => {
        if (!dead) setFailed(true);
      });
    return () => {
      dead = true;
      try {
        hls?.destroy();
      } catch {}
    };
  }, [url, isHls]);
  if (failed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-[13px] font-bold">This browser can&apos;t play this file</p>
        <p className="max-w-xs text-[11.5px] text-neutral-400">
          Open it in VLC instead — the link is on its row.
        </p>
      </div>
    );
  }
  return (
    <video
      ref={ref}
      className="h-full w-full bg-black"
      controls
      autoPlay
      playsInline
      src={isHls ? undefined : url}
      onError={() => setFailed(true)}
    />
  );
}

export default function VlcSources({ type, tmdbId, imdbId, season, episode }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [rows, setRows] = useState<WsRow[]>([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [pageFor, setPageFor] = useState<Record<string, string>>({});
  const [watchable, setWatchable] = useState<Record<string, string>>({});
  const [watch, setWatch] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const [hint] = useState(platformHint);
  const [isPcWeb] = useState(() => !isDesktopVlc() && !isAndroid() && !isIOS());
  const [isPhone] = useState(() => isAndroid() || isIOS());

  /* fetch streams (IMDb first when TMDB knows it, TMDB fallback on empty) */
  useEffect(() => {
    alive.current = true;
    setStatus("loading");
    setRows([]);
    setError("");
    setTick(0);
    const ctrl = new AbortController();
    const killer = setTimeout(() => ctrl.abort(new Error("timeout")), 105000);
    const clock = setInterval(() => setTick((n) => n + 1), 9000);
    (async () => {
      try {
        const kind = type === "movie" ? "movie" : "series";
        let found: WsRow[] = [];
        let threw: unknown = null;
        for (const sid of wsIds(type, tmdbId, imdbId, season, episode)) {
          try {
            const list = await fetchWsStreams(kind, sid, ctrl.signal);
            if (!alive.current) return;
            const parsed = list
              .map(parseStream)
              .filter((r) => r.fileUrl || r.pageUrl);
            if (parsed.length) {
              found = parsed;
              break;
            }
          } catch (e) {
            if (!alive.current || ctrl.signal.aborted) return;
            threw = e;
          }
        }
        if (!alive.current) return;
        if (found.length) {
          setRows(found);
          setStatus("ready");
        } else if (threw) {
          throw threw;
        } else {
          setStatus("empty");
        }
      } catch (e) {
        if (!alive.current) return;
        setError(
          e instanceof Error && /abort|timeout/i.test(e.message)
            ? "Search timed out — the source sites are slow right now."
            : "Couldn't reach the VLC sources."
        );
        setStatus("error");
      } finally {
        clearTimeout(killer);
        clearInterval(clock);
      }
    })();
    return () => {
      alive.current = false;
      ctrl.abort();
      clearTimeout(killer);
      clearInterval(clock);
    };
  }, [type, tmdbId, imdbId, season, episode, reload]);

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {}
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => alive.current && setCopied(false), 1600);
  }, []);

  /* tap -> the resolver generates the playable link itself -> VLC. Nothing
   * ever embeds; truly uncrackable pages fall back to open-in-new-tab, and
   * browser-compatible files also offer instant inline playback. */
  const play = useCallback(async (row: WsRow) => {
    const target = row.fileUrl || row.pageUrl;
    if (!target || busy) return;
    setBusy(row.key);
    setPageFor((p) => {
      if (!(row.key in p)) return p;
      const n = { ...p };
      delete n[row.key];
      return n;
    });
    setNote((n) => ({ ...n, [row.key]: "Generating playable link…" }));
    try {
      const r = await resolveWsUrl(target);
      if (!alive.current) return;
      if (r.ok && r.kind === "file") {
        if (playableInBrowser(r.url)) {
          setWatchable((w) => ({ ...w, [row.key]: r.url }));
        }
        setNote((n) => ({ ...n, [row.key]: "Opening VLC…" }));
        const out = await openInVlc(r.url);
        if (!alive.current) return;
        setSent((s) => ({ ...s, [row.key]: out.ok }));
        setNote((n) => ({
          ...n,
          [row.key]: r.stale ? `${out.note} (link may be expired)` : out.note,
        }));
      } else if (r.ok) {
        setPageFor((p) => ({ ...p, [row.key]: r.url }));
        setNote((n) => ({ ...n, [row.key]: "Couldn't auto-generate this one — open it in your browser:" }));
      } else {
        setNote((n) => ({ ...n, [row.key]: `${r.error || "Couldn't generate a link"} — try another` }));
      }
    } catch {
      if (alive.current)
        setNote((n) => ({ ...n, [row.key]: "Couldn't generate a link — try another" }));
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [busy]);

  /* ── inline playback ── */
  if (watch) {
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2 text-[12px]">
          <button
            onClick={() => setWatch(null)}
            className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-semibold text-neutral-200 hover:bg-white/20"
          >
            <ChevronIcon dir="left" className="h-3.5 w-3.5" /> Sources
          </button>
          <span className="min-w-0 flex-1 truncate text-neutral-400">{watch.label}</span>
          <button
            onClick={() => copy(watch.url)}
            className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-neutral-200 hover:bg-white/20"
          >
            Copy link
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <BrowserVideo url={watch.url} />
        </div>
        {copied && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-black">
            Link copied
          </div>
        )}
      </div>
    );
  }

  /* ── source list ── */
  return (
    <div className="relative flex h-full flex-col bg-black">
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2">
        <span className="text-[13px] font-bold">VLC sources</span>
        {status === "ready" && (
          <span className="rounded-full bg-brand/20 px-2 py-0.5 text-[11px] font-semibold text-brand">
            {rows.length} found
          </span>
        )}
        <span className="hidden min-w-0 flex-1 truncate text-[11.5px] text-neutral-500 sm:block">
          {hint}
        </span>
        {isPhone && (
          <a
            href="https://www.videolan.org/vlc/"
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-300 hover:bg-white/20 hover:text-white"
          >
            Get VLC
          </a>
        )}
        <button
          onClick={() => setReload((r) => r + 1)}
          title="Search again"
          className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-neutral-300 hover:bg-white/20 hover:text-white"
        >
          <RotateCcwIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      {isPcWeb && (
        <div className="border-b border-white/10 px-3 py-1.5 text-[11px] text-neutral-500">
          Tip: install the Yetflix desktop app — sources then open in VLC with one tap, no
          downloads.
        </div>
      )}

      <div className="styled-scroll min-h-0 flex-1 overflow-y-auto p-1.5">
        {status === "loading" && (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-brand" />
            <p className="text-[13px] font-semibold">
              {LOAD_LINES[Math.min(tick, LOAD_LINES.length - 1)]}
            </p>
            <p className="max-w-xs text-[11.5px] text-neutral-500">
              Live search across the source sites — first load can take up to a minute.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="text-3xl">📡</span>
            <p className="text-[13px] font-bold">{error}</p>
            <button
              onClick={() => setReload((r) => r + 1)}
              className="mt-1 rounded-full bg-brand px-4 py-1.5 text-[12px] font-bold text-white"
            >
              Retry
            </button>
          </div>
        )}

        {status === "empty" && (
          <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
            <span className="text-3xl">📼</span>
            <p className="text-[13px] font-bold">No VLC sources for this title yet</p>
            <p className="max-w-xs text-[11.5px] text-neutral-400">
              New and cam releases are often missing here — try a Server above, or check back
              later.
            </p>
          </div>
        )}

        {rows.map((row) => (
          <div
            key={row.key}
            onClick={() => play(row)}
            className={clsx(
              "flex w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-left transition hover:bg-white/5",
              busy === row.key && "pointer-events-none opacity-70"
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
              {busy === row.key ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : sent[row.key] ? (
                <CheckIcon className="h-4 w-4" />
              ) : (
                <PlayIcon className="h-4 w-4" />
              )}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12.5px] font-semibold">
                {row.quality && (
                  <span
                    className={clsx(
                      "rounded px-1.5 py-0.5 text-[11px]",
                      row.quality.includes("2160") ? "bg-amber-400/20 text-amber-300" : "bg-white/10"
                    )}
                  >
                    {row.quality}
                  </span>
                )}
                {row.size && <span className="text-neutral-300">{row.size}</span>}
                {row.source && (
                  <span className="truncate font-normal text-neutral-400">{row.source}</span>
                )}
              </span>
              <span className="mt-0.5 block truncate text-[11.5px] text-neutral-500">
                {row.audio ? `${row.audio} · ` : ""}
                {row.file}
              </span>
              {note[row.key] && (
                <span className="mt-0.5 block text-[11.5px] font-medium text-brand">
                  {note[row.key]}
                </span>
              )}
              {pageFor[row.key] && (
                <span className="mt-1 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <a
                    href={pageFor[row.key]}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white"
                  >
                    Open page
                  </a>
                  <button
                    onClick={() => copy(pageFor[row.key])}
                    className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-200 hover:bg-white/20"
                  >
                    Copy link
                  </button>
                </span>
              )}
              {watchable[row.key] && (
                <span className="mt-1 flex gap-1.5" onClick={(e) => e.stopPropagation()}>
                  <button
                    onClick={() =>
                      setWatch({
                        url: watchable[row.key],
                        label: row.quality
                          ? `${row.quality} · ${row.source || row.file}`
                          : row.source || row.file,
                      })
                    }
                    className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-200 hover:bg-white/20"
                  >
                    Play here
                  </button>
                </span>
              )}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                copy(row.fileUrl || row.pageUrl || "");
              }}
              title="Copy link"
              className="shrink-0 rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-300 hover:bg-white/20 hover:text-white"
            >
              Copy
            </button>
          </div>
        ))}
      </div>

      {copied && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-black">
          Link copied
        </div>
      )}
    </div>
  );
}
