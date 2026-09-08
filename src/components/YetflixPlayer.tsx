"use client";

/** Yetflix Player (Multi Dub) - VidStack player engine.
 * HdHub dual-audio sources as one-tap chips; every URL is direct.
 * VidStack's settings menu (gear) natively provides Audio-track /
 * Quality / Captions switching (HLS) - plus speed, PiP, fullscreen.
 * Subtitles: .srt/.vtt from disk or a URL (SRT auto-converted).
 * Codec-limited files (MKV / Dolby DDP / DTS - silent in ANY browser
 * engine) open in the bundled VLC in the exe; on web they're flagged.
 * Fallback: when HdHub has nothing, the download site is embedded -
 * exe captures the generated link automatically, web pastes it. */

import { useEffect, useRef, useState } from "react";
import { MediaPlayer, MediaProvider, type MediaPlayerInstance, TextTrack } from "@vidstack/react";
import { DefaultVideoLayout, defaultLayoutIcons } from "@vidstack/react/player/layouts/default";
import "@vidstack/react/player/styles/default/theme.css";
import "@vidstack/react/player/styles/default/layouts/video.css";
import { fetchDubStreams, DubStream } from "@/lib/dub";
import { getResume, saveResume, clearResume, resumeKeyFor } from "@/lib/storage";

type Props = {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
};

function srtToVtt(srt: string): string {
  return (
    "WEBVTT\n\n" +
    srt
      .replace(/\r+/g, "")
      .replace(/^\d+\n/gm, "")
      .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2")
  );
}

/* fallback source - the download site, TMDB-keyed: /m/{id} /s/{id} */
const frameUrlFor = (type: "movie" | "tv", tmdbId: string) =>
  `https://downloadeverythingfromeverywhere.com/${type === "movie" ? "m" : "s"}/${tmdbId}`;

/* VidStack src object with explicit type so HLS is detected even when
 * the URL has no .m3u8 extension */
const srcFor = (u: string): any => {
  if (/\.m3u8(\?|$)/i.test(u) || /format=m3u8/i.test(u) || /\/hls\//i.test(u))
    return { src: u, type: "application/vnd.apple.mpegurl" };
  if (/\.mp4(\?|$)/i.test(u)) return { src: u, type: "video/mp4" };
  return u;
};

export default function YetflixPlayer({ type, tmdbId, season, episode }: Props) {
  const playerRef = useRef<MediaPlayerInstance>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSaved = useRef(0);
  const resumed = useRef(false);
  const recoverCount = useRef(0);
  const stallTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const inApp = useRef(/electron/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "")).current;

  const [streams, setStreams] = useState<DubStream[] | null>(null);
  const [current, setCurrent] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const pendingSubs = useRef<DubStream["subs"]>(undefined); /* provider subtitles, added on canplay */
  const [nonce, setNonce] = useState(0); /* force player remount on recovery */
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paste, setPaste] = useState("");
  const [subInput, setSubInput] = useState("");

  const rkey = resumeKeyFor(type, tmdbId, season ?? 1, episode ?? 1);
  const frameUrl = frameUrlFor(type, tmdbId);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(""), 4500);
  };

  useEffect(() => {
    let dead = false;
    setStreams(null);
    setError("");
    fetchDubStreams(type, tmdbId, season, episode, (partial) => {
      /* progressive top-up: paint the first provider batch instantly,
       * later batches append while the user browses the chips */
      if (!dead && partial.length) setStreams(partial);
    })
      .then((s) => { if (!dead) setStreams(s); })
      .catch(() => { if (!dead) setStreams([]); });
    return () => { dead = true; };
  }, [type, tmdbId, season, episode]);

  /* the fallback frame is on screen only when HdHub has nothing and
   * nothing is playing - that's when the exe capture hooks are armed */
  const frameVisible = streams !== null && streams.length === 0 && !playUrl;
  useEffect(() => {
    (window as any).__dubCapture = frameVisible;
    return () => { (window as any).__dubCapture = false; };
  }, [frameVisible]);

  /* the exe posts captured media links here (desktop dubCapture hooks) */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const u = (e.data as any)?.yetflixDubUrl;
      if (typeof u === "string" && /^https?:\/\//.test(u)) {
        setError("");
        setPlayUrl(u);
        setNonce((n) => n + 1);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* every HdHub stream is a direct link - instant play.
   * Codec-limited files (MKV / Dolby / DTS - silent in any browser
   * engine) go to VLC in the exe; falls back to the in-app player. */
  /* every Multi Dub chip is a DIRECT download link - tapping it
   * opens VLC (exe spawns vlc.exe with host headers; the website /
   * phone uses the vlc:// / intent:// / x-callback deep link). If VLC
   * can't be reached, browser-playable files still play in-app. */
  const playStream = async (st: DubStream, idx: number) => {
    setError(""); setCurrent(idx);
    const url = st.url.startsWith("/") ? new URL(st.url, window.location.origin).toString() : st.url;

    if (inApp) {
      const bridge = (window as any).yetflixVlc;
      if (bridge?.play) {
        try {
          const ok = await bridge.play(url, st.headers ?? undefined);
          if (ok) {
            setPlayUrl(null);
            flashNotice("Playing in VLC - switch audio / subtitles with its menus (keys b / v).");
            return;
          }
        } catch {}
      }
    } else {
      /* copy first so the user always has a fallback in VLC's network
       * stream dialog if the protocol handler is missing */
      try { await navigator.clipboard?.writeText(url); } catch {}
      const ua = navigator.userAgent;
      try {
        if (/android/i.test(ua)) {
          const u = new URL(url);
          const intent =
            `intent://${u.host}${u.pathname}${u.search}#Intent;scheme=${u.protocol.replace(":", "")}` +
            `;package=org.videolan.vlc;action=android.intent.action.VIEW;end`;
          window.location.href = intent;
        } else if (/iphone|ipad|ipod/i.test(ua)) {
          window.location.href = `vlc-x-callback://x-callback-url/stream?url=${encodeURIComponent(url)}`;
        } else {
          window.location.href = `vlc://${url}`;
        }
        flashNotice("Opening in VLC — link copied as backup (in VLC: Media → Open Network Stream).");
        return;
      } catch {}
    }

    /* VLC unavailable - play here when the browser can */
    if (!st.webSafe) {
      flashNotice("VLC didn't respond - this file type needs it. The link is copied to your clipboard.");
      return;
    }
    resumed.current = false;
    pendingSubs.current = st.subs;
    setPlayUrl(st.url);
    setNonce((n) => n + 1);
  };

  const pick = (i: number) => {
    const st = streams?.[i];
    if (!st) return;
    playStream(st, i);
  };

  const playPasted = () => {
    const u = paste.trim();
    if (!/^https?:\/\//i.test(u)) { setError("Paste the video link (it starts with http)"); return; }
    setError(""); resumed.current = false;
    setPlayUrl(u); setNonce((n) => n + 1);
  };

  /* ── subtitles (added into VidStack's Captions menu) ── */
  const addSubtitle = (name: string, url: string) => {
    const p = playerRef.current;
    if (!p) { setError("Start playback first, then add subtitles."); return; }
    try {
      const existing = Array.from(p.textTracks as any).find((t: any) => t?.label === name);
      if (existing) (p.textTracks as any).remove(existing);
      const track = new TextTrack({ kind: "subtitles", label: name, language: "en", src: url, type: "vtt" });
      p.textTracks.add(track);
      track.mode = "showing";
    } catch {
      setError("Couldn't load that subtitle.");
    }
  };
  const onSubFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const vtt = /\.(vtt|txt)$/i.test(f.name) ? text : srtToVtt(text);
    addSubtitle(f.name.replace(/\.[^.]+$/, ""), URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })));
  };

  /* ── recovery: links die - refetch and hop to the same
   *     quality+language (max 2 tries per playback) ── */
  const recover = async (): Promise<boolean> => {
    const S = streams?.[current];
    if (!S) return false; /* pasted link - nothing to match */
    if (recoverCount.current >= 2) return false;
    recoverCount.current++;
    flashNotice("Refreshing source...");
    try {
      const fresh = await fetchDubStreams(type, tmdbId, season, episode);
      setStreams(fresh);
      const match =
        fresh.find((f) => f.quality === S.quality && f.langs.join() === S.langs.join() && f.url !== S.url) ??
        fresh.find((f) => f.quality === S.quality && f.url !== S.url) ??
        fresh.find((f) => f.webSafe);
      if (match) {
        await playStream(match, fresh.indexOf(match));
        return true;
      }
    } catch {}
    return false;
  };

  /* ── player events ── */
  const onCanPlay = () => {
    const p = playerRef.current;
    if (!p) return;
    clearTimeout(stallTimer.current);
    /* guard against a zero-volume start (the 'no audio' report) */
    if (p.volume === 0 && !p.muted) p.volume = 0.9;
    /* provider subtitles (if any) -> Captions menu */
    if (pendingSubs.current?.length) {
      const subs = pendingSubs.current;
      pendingSubs.current = undefined;
      try {
        for (const [i, t] of subs.entries()) {
          const track = new TextTrack({
            kind: "subtitles",
            label: t.title || t.language || `Track ${i + 1}`,
            language: t.language || "en",
            src: t.uri,
            type: (t.type?.includes("subrip") ? "srt" : t.type?.includes("ttml") ? "ttml" : "vtt") as any,
          });
          p.textTracks.add(track);
        }
      } catch {}
    }
    if (!resumed.current) {
      resumed.current = true;
      const at = getResume(rkey)?.positionSec ?? 0;
      if (at > 10) p.currentTime = at;
    }
  };
  const onTimeUpdate = () => {
    const p = playerRef.current;
    if (!p) return;
    const t = p.currentTime;
    if (t - lastSaved.current >= 5) {
      lastSaved.current = t;
      saveResume(rkey, t, p.duration || undefined);
    }
  };
  const onEnded = () => clearResume(rkey);
  const onErrorEvt = async () => {
    const S = streams?.[current];
    if (S && !S.webSafe) {
      setError("This file's audio codec (Dolby/MKV) can't play in a browser" + (inApp ? " - VLC handles it, retrying in VLC..." : "") + ".");
      if (inApp && current >= 0) { playStream(S, current); return; }
      return;
    }
    const handled = await recover();
    if (!handled) setError("This link failed (expired or unsupported) - pick another chip or paste a link.");
  };
  /* watchdog: 20s stalled without a frame -> refresh the source */
  const armStall = () => {
    clearTimeout(stallTimer.current);
    stallTimer.current = setTimeout(() => {
      recover().then((ok) => { if (!ok) flashNotice("Still buffering - the file may be slow or dead. Try another chip."); });
    }, 20000);
  };

  useEffect(() => () => clearTimeout(stallTimer.current), []);

  const S = streams?.[current];
  const visible = streams ? (showAll ? streams : streams.filter((s) => s.webSafe)) : [];
  const hiddenCount = streams ? streams.length - visible.length : 0;

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 w-full flex-1 bg-black">
        {playUrl ? (
          <>
            <MediaPlayer
              key={`${playUrl}#${nonce}`}
              ref={playerRef}
              src={srcFor(playUrl)}
              autoPlay
              playsInline
              onError={onErrorEvt}
              onCanPlay={onCanPlay}
              onTimeUpdate={onTimeUpdate}
              onEnded={onEnded}
              onStalled={armStall}
              onPlaying={() => clearTimeout(stallTimer.current)}
              className="h-full w-full bg-black"
            >
              <DefaultVideoLayout icons={defaultLayoutIcons} />
              <MediaProvider />
            </MediaPlayer>

            {error ? <div className="absolute inset-x-0 top-0 z-20 bg-brand/90 px-3 py-1.5 text-center text-[12px] font-semibold">{error}</div> : null}
            {notice ? <div className="absolute inset-x-0 top-0 z-20 bg-black/85 px-3 py-1.5 text-center text-[12px] font-medium text-white">{notice}</div> : null}
            <input ref={fileInput} type="file" accept=".srt,.vtt,.txt" className="hidden" onChange={(e) => onSubFile(e.target.files?.[0])} />
          </>
        ) : streams === null ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[13px] text-neutral-400">Finding multi-language sources…</span>
          </div>
        ) : streams.length > 0 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
            <span className="text-3xl">🌐</span>
            <p className="text-sm font-bold">Pick a source below</p>
            <p className="text-[12.5px] text-neutral-400">Direct download links (Hindi + English multi-audio) - tap one and it opens in VLC.</p>
            <p className="text-[11.5px] text-neutral-500">Make sure VLC is installed (PC: videolan.org, phone: Play Store / App Store).</p>
          </div>
        ) : (
          <>
            {/* ── HdHub had nothing - embed the download site as the
             *     fallback; exe auto-captures, web pastes ── */}
            <iframe
              key={frameUrl}
              src={frameUrl}
              title="Multi Dub sources"
              className="absolute inset-0 h-full w-full border-0 bg-white"
              sandbox={`allow-scripts allow-same-origin allow-forms allow-popups${inApp ? " allow-downloads" : ""}`}
            />
            <div className="absolute inset-x-0 top-0 z-10 bg-black/80 px-3 py-1.5 text-center text-[11.5px] font-medium text-neutral-200">
              {inApp ? (
                <>Tap <span className="font-bold text-white">Find downloads</span> and pick a link — the video plays here automatically</>
              ) : (
                <>Pick a download, copy the video link and <span className="font-bold text-white">paste it below</span> — or open the site in a tab</>
              )}
            </div>
            {!inApp && (
              <button onClick={() => window.open(frameUrl, "_blank", "noopener")}
                className="absolute right-2 top-9 z-10 rounded bg-white/15 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-white/25">
                Open tab ↗
              </button>
            )}
            {error ? <div className="absolute inset-x-0 bottom-0 z-10 bg-brand/90 px-3 py-1.5 text-center text-[12px] font-semibold">{error}</div> : null}
          </>
        )}
      </div>

      {/* controls row + source chips (stay available while playing) */}
      <div className="styled-scroll max-h-48 shrink-0 overflow-y-auto border-t border-white/10 bg-black/40 px-2 py-2">
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <input
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && playPasted()}
            placeholder="paste any video link (mp4 · m3u8 · direct) — Enter to play"
            className="min-w-0 flex-1 rounded bg-white/10 px-2.5 py-1.5 text-[11.5px] text-white outline-none placeholder:text-neutral-500 focus:bg-white/15"
          />
          <button onClick={playPasted} className="shrink-0 rounded bg-brand px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-brand/85">
            ▶ Play link
          </button>
          {playUrl ? (
            <>
              <button onClick={() => fileInput.current?.click()} className="shrink-0 rounded bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 hover:bg-white/20">
                💡 Subtitle file
              </button>
              <button onClick={() => { setPlayUrl(null); setError(""); }} className="shrink-0 rounded bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 hover:bg-white/20">
                ⇄ Change source
              </button>
            </>
          ) : null}
        </div>
        {playUrl ? (
          <div className="mb-2 flex flex-wrap items-center gap-1.5">
            <input
              value={subInput}
              onChange={(e) => setSubInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && /^https?:\/\//i.test(subInput.trim())) { addSubtitle("URL subtitle", subInput.trim()); setSubInput(""); } }}
              placeholder="subtitle URL (.vtt / .srt) — added to the Captions menu"
              className="min-w-0 flex-1 rounded bg-white/5 px-2.5 py-1 text-[11px] text-neutral-300 outline-none placeholder:text-neutral-600 focus:bg-white/10"
            />
            <button onClick={() => { const u = subInput.trim(); if (/^https?:\/\//i.test(u)) { addSubtitle("URL subtitle", u); setSubInput(""); } }}
              className="shrink-0 rounded bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-neutral-200 hover:bg-white/20">Add</button>
          </div>
        ) : null}
        {streams && streams.length > 0 ? (
          <>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Multi Dub sources ({visible.length}{hiddenCount ? ` of ${streams.length}` : ""}) · gear ⚙ = audio / quality / subs
              </span>
              {hiddenCount > 0 ? (
                <button onClick={() => setShowAll((v) => !v)} className="text-[10px] font-semibold text-amber-500/90 hover:text-amber-400">
                  {showAll ? "hide codec-limited" : `+${hiddenCount} codec-limited${inApp ? " (open in VLC)" : " (may be silent)"}`}
                </button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {visible.map((s) => (
                <button
                  key={s.url}
                  onClick={() => pick(streams!.indexOf(s))}
                  title={`${s.quality} - ${s.langs.join("+")} - ${s.host}${s.codecNote ? " - " + s.codecNote : ""}`}
                  className={
                    "rounded-full px-2.5 py-1 text-[11px] font-semibold transition " +
                    (streams!.indexOf(s) === current
                      ? "bg-brand text-white"
                      : s.webSafe
                        ? "bg-white/10 text-neutral-200 hover:bg-white/20"
                        : "bg-amber-900/40 text-amber-300 hover:bg-amber-900/60")
                  }
                >
                  {s.quality}{s.codec === "HEVC" ? " HEVC" : ""} · {s.langs.join("+")}{s.size ? ` · ${s.size}` : ""}{s.host && s.host !== "HdHub" ? ` · ${s.host}` : ""}
                </button>
              ))}
            </div>
          </>
        ) : null}
        {streams && streams.length === 0 ? (
          <p className="px-1 pb-1 text-[11px] text-neutral-500">
            No direct sources for this title — use the download site above{inApp ? " (auto-plays here)" : " and paste the link"}.
          </p>
        ) : null}
      </div>
    </div>
  );
}
