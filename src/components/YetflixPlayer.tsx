"use client";

/** Yetflix Player (Multi Dub) - powered by an embedded download site
 * (downloadeverythingfromeverywhere.com, TMDB-keyed: /m/{id} /s/{id}).
 * Flow: the site loads INSIDE the player area -> the user taps "find
 * downloads" and picks a link -> the final video URL is captured and
 * plays here automatically.
 *  - exe: desktop hooks catch download attempts / media navigations from
 *    the frame and postMessage them here (window.__dubCapture gates it)
 *  - web: one manual step - open the tab, copy the link, paste it below
 * Also plays ANY pasted link (mp4 / m3u8 / direct).
 * - AUDIO button: switch language on multi-audio HLS
 * - QUALITY button: HLS level switching (capped to player size)
 * - SUBTITLES: .srt/.vtt from disk or a URL (SRT auto-converted) */

import { useEffect, useRef, useState } from "react";
import Artplayer from "artplayer";
import Hls from "hls.js";
import { getResume, saveResume, clearResume, resumeKeyFor } from "@/lib/storage";

type Props = {
  type: "movie" | "tv";
  tmdbId: string;
  season?: number;
  episode?: number;
};

type SubTrack = { name: string; url: string };

const ICONS = {
  audio: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9v6h4l5 5V4L7 9H3z"/><path d="M16 8a5 5 0 0 1 0 8M19 5a9 9 0 0 1 0 14"/></svg>',
  gear: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  cc: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M10 10.5a2 2 0 1 0 0 3M17 10.5a2 2 0 1 0 0 3"/></svg>',
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

const BLANK_VTT = URL.createObjectURL(new Blob(["WEBVTT\n\n"], { type: "text/vtt" }));

/* the embedded download site - TMDB-keyed pages: /m/{id} for movies,
 * /s/{id} for shows (episode picked on their page) */
const frameUrlFor = (type: "movie" | "tv", tmdbId: string) =>
  `https://downloadeverythingfromeverywhere.com/${type === "movie" ? "m" : "s"}/${tmdbId}`;

export default function YetflixPlayer({ type, tmdbId, season, episode }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSaved = useRef(0);
  const inApp = useRef(/electron/i.test(typeof navigator !== "undefined" ? navigator.userAgent : "")).current;
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [menu, setMenu] = useState<null | "audio" | "quality" | "subs">(null);
  const [subs, setSubs] = useState<SubTrack[]>([]);
  const [subUrl, setSubUrl] = useState<string>("");
  const [subInput, setSubInput] = useState<string>("");
  const [tick, setTick] = useState(0); /* re-render menus on hls changes */

  const rkey = resumeKeyFor(type, tmdbId, season ?? 1, episode ?? 1);
  const frameUrl = frameUrlFor(type, tmdbId);

  /* the exe posts captured media links here (desktop dubCapture hooks) */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const u = (e.data as any)?.yetflixDubUrl;
      if (typeof u === "string" && /^https?:\/\//.test(u)) {
        setError("");
        setPlayUrl(u);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  /* gate flag read by the desktop capture hooks - live while the source
   * frame is on screen and nothing is playing */
  useEffect(() => {
    (window as any).__dubCapture = !playUrl;
    return () => { (window as any).__dubCapture = false; };
  }, [playUrl]);

  const playPasted = () => {
    const u = paste.trim();
    if (!/^https?:\/\//i.test(u)) { setError("Paste the video link (it starts with http)"); return; }
    setError(""); setPlayUrl(u); setMenu(null);
  };

  /* ── subtitle loading ── */
  const addSub = (name: string, url: string) => {
    setSubs((prev) => [...prev.filter((s) => s.name !== name), { name, url }]);
    setSubUrl(url);
    try { artRef.current?.subtitle.switch(url, { type: "vtt" }); } catch {}
    setMenu(null);
  };
  const onSubFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    const vtt = /\.(vtt|txt)$/i.test(f.name) ? text : srtToVtt(text);
    addSub(f.name.replace(/\.[^.]+$/, ""), URL.createObjectURL(new Blob([vtt], { type: "text/vtt" })));
  };
  const offSub = () => {
    setSubUrl("");
    try { artRef.current?.subtitle.switch(BLANK_VTT, { type: "vtt" }); } catch {}
  };

  /* ── the player ── */
  useEffect(() => {
    if (!boxRef.current || !playUrl) return;
    const resumeAt = getResume(rkey)?.positionSec ?? 0;
    lastSaved.current = resumeAt;

    const art = new Artplayer({
      container: boxRef.current,
      url: playUrl,
      type: /\.m3u8(\?|$)/i.test(playUrl) || /format=m3u8/i.test(playUrl) || /\/hls\//i.test(playUrl) ? "m3u8" : "",
      autoplay: true,
      autoOrientation: true,
      setting: true,
      hotkey: true,
      pip: true,
      aspectRatio: true,
      playbackRate: true,
      fullscreen: true,
      fullscreenWeb: true,
      theme: "#e50914",
      moreVideoAttr: { playsInline: true, preload: "auto" },
      controls: [
        { position: "right", index: 10, html: ICONS.audio, tooltip: "Audio / Language", click: () => setMenu((m) => (m === "audio" ? null : "audio")) },
        { position: "right", index: 11, html: ICONS.gear, tooltip: "Quality", click: () => setMenu((m) => (m === "quality" ? null : "quality")) },
        { position: "right", index: 12, html: ICONS.cc, tooltip: "Subtitles", click: () => setMenu((m) => (m === "subs" ? null : "subs")) },
      ],
      customType: {
        m3u8: (video: HTMLVideoElement, url: string, art: Artplayer) => {
          if (Hls.isSupported()) {
            const hls = new Hls({
              /* buffer 60s ahead but cap at ~90MB / 120s for low-end PCs;
               * never fetch levels bigger than the on-screen player;
               * retry flaky segments before giving up */
              maxBufferLength: 60,
              maxMaxBufferLength: 120,
              maxBufferSize: 90 * 1000 * 1000,
              backBufferLength: 30,
              capLevelToPlayerSize: true,
              abrEwmaDefaultEstimate: 1_000_000,
              fragLoadingMaxRetry: 6,
              fragLoadingRetryDelay: 800,
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => setTick((t) => t + 1));
            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => setTick((t) => t + 1));
            hlsRef.current = hls;
            art.hls = hls;
            art.on("destroy", () => { hls.destroy(); hlsRef.current = null; });
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = url;
          } else {
            art.notice.show = "HLS not supported here";
          }
        },
      },
    });

    art.on("ready", () => { if (resumeAt > 10) art.currentTime = resumeAt; });
    art.on("timeupdate", () => {
      const t = art.currentTime;
      if (t - lastSaved.current >= 5) {
        lastSaved.current = t;
        saveResume(rkey, t, art.duration || undefined);
      }
    });
    art.on("ended", () => clearResume(rkey));
    art.on("error", () => {
      setError(
        /\.mkv|matroska/i.test(playUrl)
          ? "MKV / Dolby files can't play in-app - grab an MP4 / WebM / HLS link instead."
          : "That link failed (expired or unsupported) - grab another one from the source site."
      );
      setPlayUrl(null);
    });
    /* stall notice: nothing to auto-switch to (the user picks the
     * source) - just say it after 20s without a frame */
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        try { art.notice.show = "Still buffering - file may be slow or dead. Use 'Change source' below."; } catch {}
      }, 20000);
    };
    const clearStall = () => clearTimeout(stallTimer);
    /* NOTE: call art.on(...) DIRECTLY on the instance - detaching the
     * method loses `this` (ArtPlayer's emitter reads this.e) */
    art.on("video:waiting", armStall);
    art.on("waiting", armStall);
    art.on("video:playing", clearStall);
    art.on("playing", clearStall);
    art.on("video:canplay", clearStall);
    art.on("canplay", clearStall);

    artRef.current = art;
    return () => {
      clearTimeout(stallTimer);
      art.destroy(false);
      artRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playUrl, rkey]);

  const hls = hlsRef.current;

  const MenuItem = ({ active, onClick, children }: { active?: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={onClick}
      className={
        "flex w-full items-center justify-between gap-3 rounded px-2.5 py-1.5 text-left text-[12px] transition " +
        (active ? "bg-brand text-white" : "text-neutral-200 hover:bg-white/10")
      }
    >
      {children}
    </button>
  );

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 w-full flex-1 bg-black">
        {playUrl ? (
          <>
            <div ref={boxRef} className="absolute inset-0" />

            {/* ── overlay menus (audio / quality / subtitles) ── */}
            {menu ? (
              <div className="styled-scroll absolute bottom-14 right-2 z-20 max-h-64 w-64 overflow-y-auto rounded-lg border border-white/10 bg-black/95 p-1.5 shadow-2xl">
                <div className="flex items-center justify-between px-2 pb-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    {menu === "audio" ? "Audio / Language" : menu === "quality" ? "Quality" : "Subtitles"}
                  </span>
                  <button onClick={() => setMenu(null)} className="text-[11px] text-neutral-500 hover:text-white">✕</button>
                </div>

                {menu === "audio" ? (
                  hls && (hls.audioTracks?.length ?? 0) > 1 ? (
                    hls.audioTracks.map((t: any, i: number) => (
                      <MenuItem key={i} active={hls.audioTrack === i} onClick={() => { hls.audioTrack = i; setTick((x) => x + 1); }}>
                        <span>{t.name || t.lang || `Track ${i + 1}`}</span>
                        {hls.audioTrack === i ? <span className="text-brand">✓</span> : null}
                      </MenuItem>
                    ))
                  ) : (
                    <div className="px-2 pb-1.5 text-[11.5px] leading-relaxed text-neutral-400">
                      <p className="mb-1.5">This file has one audio track. To change language, grab a dual-audio or HLS (multi-track) link from the source site.</p>
                    </div>
                  )
                ) : null}

                {menu === "quality" ? (
                  hls && (hls.levels?.length ?? 0) > 1 ? (
                    <>
                      <MenuItem active={hls.currentLevel === -1} onClick={() => { hls.currentLevel = -1; setTick((x) => x + 1); }}>
                        <span>Auto</span>{hls.currentLevel === -1 ? <span className="text-brand">✓</span> : null}
                      </MenuItem>
                      {hls.levels.map((l: any, i: number) => (
                        <MenuItem key={i} active={hls.currentLevel === i} onClick={() => { hls.currentLevel = i; setTick((x) => x + 1); }}>
                          <span>{l.height ? `${l.height}p` : `${Math.round((l.bitrate ?? 0) / 1000)}kbps`}</span>
                          {hls.currentLevel === i ? <span className="text-brand">✓</span> : null}
                        </MenuItem>
                      ))}
                    </>
                  ) : (
                    <div className="px-2 pb-1.5 text-[11.5px] leading-relaxed text-neutral-400">
                      <p>File links are fixed quality - grab another quality from the source site.</p>
                    </div>
                  )
                ) : null}

                {menu === "subs" ? (
                  <div data-tick={tick}>
                    <MenuItem active={!subUrl} onClick={offSub}>
                      <span>Off</span>{!subUrl ? <span className="text-brand">✓</span> : null}
                    </MenuItem>
                    {subs.map((s) => (
                      <MenuItem key={s.name} active={subUrl === s.url} onClick={() => addSub(s.name, s.url)}>
                        <span className="truncate">{s.name}</span>{subUrl === s.url ? <span className="text-brand">✓</span> : null}
                      </MenuItem>
                    ))}
                    <div className="mt-1 border-t border-white/10 pt-1.5">
                      <button onClick={() => fileInput.current?.click()} className="w-full rounded px-2.5 py-1.5 text-left text-[12px] text-neutral-200 hover:bg-white/10">
                        📁 Load .srt / .vtt from disk…
                      </button>
                      <div className="flex items-center gap-1 px-1 pt-1">
                        <input value={subInput} onChange={(e) => setSubInput(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter" && /^https?:\/\//i.test(subInput.trim())) addSub("URL subtitle", subInput.trim()); }}
                          placeholder="or paste a subtitle URL"
                          className="min-w-0 flex-1 rounded bg-white/10 px-2 py-1 text-[11px] text-white outline-none placeholder:text-neutral-500" />
                        <button onClick={() => { const u = subInput.trim(); if (/^https?:\/\//i.test(u)) addSub("URL subtitle", u); }}
                          className="shrink-0 rounded bg-white/15 px-2 py-1 text-[11px] font-semibold hover:bg-white/25">Add</button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? <div className="absolute inset-x-0 top-0 bg-brand/90 px-3 py-1.5 text-center text-[12px] font-semibold">{error}</div> : null}
            <input ref={fileInput} type="file" accept=".srt,.vtt,.txt" className="hidden" onChange={(e) => onSubFile(e.target.files?.[0])} />
          </>
        ) : (
          <>
            {/* ── embedded source site: user picks a download; the link
             *     plays here automatically (exe) / gets pasted (web) ── */}
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
            {error ? <div className="absolute inset-x-0 bottom-0 bg-brand/90 px-3 py-1.5 text-center text-[12px] font-semibold">{error}</div> : null}
          </>
        )}
      </div>

      {/* paste box + change-source (stay available while playing) */}
      <div className="shrink-0 border-t border-white/10 bg-black/40 px-2 py-2">
        <div className="flex flex-wrap items-center gap-1.5">
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
            <button onClick={() => { setPlayUrl(null); setError(""); setMenu(null); }}
              className="shrink-0 rounded bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-neutral-200 hover:bg-white/20">
              ⇄ Change source
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
