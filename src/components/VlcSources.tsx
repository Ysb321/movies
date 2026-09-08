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
  type WsRow,
} from "@/lib/vlc";
import { PLAYER_SANDBOX } from "@/lib/player";
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

export default function VlcSources({ type, tmdbId, imdbId, season, episode }: Props) {
  const [status, setStatus] = useState<Status>("loading");
  const [rows, setRows] = useState<WsRow[]>([]);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<Record<string, string>>({});
  const [sent, setSent] = useState<Record<string, boolean>>({});
  const [embed, setEmbed] = useState<{ url: string; label: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [reload, setReload] = useState(0);
  const alive = useRef(true);
  const [hint] = useState(platformHint);
  const [isPcWeb] = useState(() => !isDesktopVlc() && !isAndroid() && !isIOS());

  /* fetch streams (IMDb first when TMDB knows it, TMDB fallback on empty) */
  useEffect(() => {
    alive.current = true;
    setStatus("loading");
    setRows([]);
    setError("");
    setEmbed(null);
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

  /* desktop: while a download page is embedded, arm link-capture - the file
   * the user clicks through to comes back as yetflixDubUrl -> straight to
   * VLC, no manual copy-paste. */
  useEffect(() => {
    if (!embed) return;
    try {
      (window as unknown as { __dubCapture?: boolean }).__dubCapture = true;
    } catch {}
    const onMsg = (e: MessageEvent) => {
      const u = (e.data as { yetflixDubUrl?: unknown } | null)?.yetflixDubUrl;
      if (typeof u === "string" && u) {
        setNote((n) => ({ ...n, __embed: "Opening in VLC…" }));
        openInVlc(u).then(
          (r) => alive.current && setNote((n) => ({ ...n, __embed: r.note }))
        );
      }
    };
    window.addEventListener("message", onMsg);
    return () => {
      window.removeEventListener("message", onMsg);
      try {
        (window as unknown as { __dubCapture?: boolean }).__dubCapture = false;
      } catch {}
    };
  }, [embed]);

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

  const play = useCallback(async (row: WsRow) => {
    const target = row.fileUrl || row.pageUrl;
    if (!target || busy) return;
    setBusy(row.key);
    setNote((n) => ({ ...n, [row.key]: "Finding playable link…" }));
    try {
      const r = await resolveWsUrl(target);
      if (!alive.current) return;
      if (r.ok && r.kind === "file") {
        const out = await openInVlc(r.url);
        if (!alive.current) return;
        setSent((s) => ({ ...s, [row.key]: out.ok }));
        setNote((n) => ({ ...n, [row.key]: out.note }));
      } else if (r.ok) {
        /* download-button page (HubCloud-style): embed it - on desktop the
         * clicked file link is captured and sent to VLC automatically */
        setEmbed({
          url: r.url,
          label: row.quality ? `${row.quality} · ${row.source || row.file}` : row.source || row.file,
        });
        setNote((n) => ({ ...n, [row.key]: "Download page opened — tap its Download button" }));
      } else {
        setNote((n) => ({ ...n, [row.key]: `${r.error || "Couldn't resolve this source"} — try another` }));
      }
    } catch {
      if (alive.current)
        setNote((n) => ({ ...n, [row.key]: "Couldn't resolve this source — try another" }));
    } finally {
      if (alive.current) setBusy(null);
    }
  }, [busy]);

  /* ── download-button page mode ── */
  if (embed) {
    return (
      <div className="flex h-full flex-col bg-black">
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-3 py-2 text-[12px]">
          <button
            onClick={() => setEmbed(null)}
            className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1 font-semibold text-neutral-200 hover:bg-white/20"
          >
            <ChevronIcon dir="left" className="h-3.5 w-3.5" /> Sources
          </button>
          <span className="min-w-0 flex-1 truncate text-neutral-400">{embed.label}</span>
          <a
            href={embed.url}
            target="_blank"
            rel="noreferrer"
            className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-neutral-200 hover:bg-white/20"
          >
            Open in new tab
          </a>
          <button
            onClick={() => copy(embed.url)}
            className="rounded-full bg-white/10 px-2.5 py-1 font-semibold text-neutral-200 hover:bg-white/20"
          >
            Copy link
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <iframe
            src={embed.url}
            title={embed.label}
            className="h-full w-full bg-white"
            sandbox={PLAYER_SANDBOX}
          />
        </div>
        <div className="border-t border-white/10 px-3 py-1.5 text-[11.5px] text-neutral-400">
          {note.__embed ||
            (isDesktopVlc()
              ? "Tap the page's Download button — the file opens in VLC automatically."
              : "Tap the page's Download button, then open the file with your VLC app.")}
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
