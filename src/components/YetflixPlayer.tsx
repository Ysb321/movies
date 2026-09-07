"use client";

/** Yetflix Player (Multi Dub) - full control set:
 * - AUDIO button: switch language on multi-audio HLS; otherwise jumps to
 *   the language source chips (each chip = a different language file)
 * - QUALITY button: HLS level switching; otherwise the chips
 * - SUBTITLES: load .srt/.vtt from disk or a URL (SRT auto-converted);
 *   multiple tracks switchable, Off supported
 * - codec-limited sources (MKV/Dolby = silent audio in Chromium) are
 *   hidden behind a toggle so what's offered by default actually plays */

import { useEffect, useRef, useState } from "react";
import Artplayer from "artplayer";
import Hls from "hls.js";
import { fetchDubStreams, DubStream } from "@/lib/dub";
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

/* Pengu links play through our edge proxy (/api/dub/proxy): same-origin
 * kills the hls.js CORS problem, Cloudflare's backbone routes to
 * pengu.uk, Range passes through so MP4s stay seekable. */
const proxyDubUrl = (u: string) =>
  /^https:\/\/pengu\.uk\//i.test(u) ? `/api/dub/proxy?u=${encodeURIComponent(u)}` : u;
/* the raw media URL behind a (possibly proxied) playUrl */
const unwrapDubUrl = (u: string) => {
  try {
    const p = new URL(u, typeof location !== "undefined" ? location.href : "https://yetflixbyyashraj.pages.dev").searchParams.get("u");
    return p ?? u;
  } catch {
    return u;
  }
};

const BLANK_VTT = URL.createObjectURL(new Blob(["WEBVTT\n\n"], { type: "text/vtt" }));

export default function YetflixPlayer({ type, tmdbId, season, episode }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastSaved = useRef(0);
  const recoverCount = useRef(0);
  const [streams, setStreams] = useState<DubStream[] | null>(null);
  const [current, setCurrent] = useState(-1);
  const [showAll, setShowAll] = useState(false);
  const [playUrl, setPlayUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [paste, setPaste] = useState("");
  const [menu, setMenu] = useState<null | "audio" | "quality" | "subs">(null);
  const [subs, setSubs] = useState<SubTrack[]>([]);
  const [subUrl, setSubUrl] = useState<string>("");
  const [subInput, setSubInput] = useState("");
  const [tick, setTick] = useState(0); /* re-render menus on hls changes */

  const rkey = resumeKeyFor(type, tmdbId, season ?? 1, episode ?? 1);

  useEffect(() => {
    let dead = false;
    setStreams(null);
    setError("");
    fetchDubStreams(type, tmdbId, season, episode)
      .then((s) => { if (!dead) setStreams(s); })
      .catch(() => { if (!dead) setStreams([]); });
    return () => { dead = true; };
  }, [type, tmdbId, season, episode]);

  /* every PenguPlay stream is a direct proxied link - instant play */
  const pick = (i: number) => {
    if (!streams?.[i]) return;
    setError(""); setPlayUrl(streams[i].url); setMenu(null); setCurrent(i);
  };

  const playPasted = () => {
    const u = paste.trim();
    if (!/^https?:\/\//i.test(u)) { setError("Paste the generated link (it starts with http)"); return; }
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
    const S = streams?.[current];
    const resumeAt = getResume(rkey)?.positionSec ?? 0;
    lastSaved.current = resumeAt;
    recoverCount.current = 0;

    /* Pengu links are time-signed (psig) and EXPIRE - when one dies,
     * refetch the list and hop to the same source seamlessly */
    /* direct pengu playback is the FAST path (no double proxy hop);
     * the edge proxy is the fallback route when direct fails/stalls */
    const tryProxyRoute = (): boolean => {
      const raw = unwrapDubUrl(playUrl);
      if (/^https:\/\/pengu\.uk\//i.test(raw) && !playUrl.includes("/api/dub/proxy?")) {
        try { if (artRef.current) artRef.current.notice.show = "Switching route..."; } catch {}
        setPlayUrl(proxyDubUrl(raw));
        return true;
      }
      return false;
    };

    let recovering = false;
    const recover = async (): Promise<boolean> => {
      if (recovering) return true; /* already on it */
      if (!S) return false; /* pasted link - nothing to match */
      if (recoverCount.current >= 2) return false; /* don't loop forever */
      recoverCount.current++;
      recovering = true;
      try { if (artRef.current) artRef.current.notice.show = "Refreshing source..."; } catch {}
      try {
        const fresh = await fetchDubStreams(type, tmdbId, season, episode);
        const cur = unwrapDubUrl(playUrl);
        const samePath = (u: string) => u.split("?")[0];
        const match =
          fresh.find((f) => samePath(f.url) === samePath(cur)) ??
          fresh.find((f) => f.quality === S.quality && f.host === S.host && f.langs.join() === S.langs.join()) ??
          fresh.find((f) => f.quality === S.quality && f.host === S.host) ??
          fresh.find((f) => f.quality === S.quality);
        setStreams(fresh); /* chips get fresh links either way */
        if (match) { setCurrent(fresh.indexOf(match)); setPlayUrl(match.url); return true; }
      } catch {}
      return false;
    };

    const art = new Artplayer({
      container: boxRef.current,
      url: playUrl,
      type: /\.m3u8(\?|$)/i.test(unwrapDubUrl(playUrl)) || /format=m3u8/i.test(unwrapDubUrl(playUrl)) || /\/hls\//i.test(unwrapDubUrl(playUrl)) ? "m3u8" : "",
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
              /* buffer 60s ahead (was 30) but cap at ~90MB / 120s so
               * low-end PCs stay smooth; free watched data after 30s;
               * conservative initial estimate so 4K doesn't lock in and
               * stall; retry flaky proxy segments before giving up */
              maxBufferLength: 60,
              /* never fetch levels bigger than the on-screen player -
               * huge waste of bandwidth/CPU (4K in a 900px box) */
              capLevelToPlayerSize: true,
              maxMaxBufferLength: 120,
              maxBufferSize: 90 * 1000 * 1000,
              backBufferLength: 30,
              abrEwmaDefaultEstimate: 1_000_000,
              fragLoadingMaxRetry: 6,
              fragLoadingRetryDelay: 800,
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => setTick((t) => t + 1));
            hls.on(Hls.Events.AUDIO_TRACK_SWITCHED, () => setTick((t) => t + 1));
            hls.on(Hls.Events.ERROR, (_e: unknown, data: { fatal?: boolean }) => {
              if (!data?.fatal) return;
              recover().then((ok) => { if (!ok) art.notice.show = "Stream failed - pick another chip"; });
            });
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
    art.on("error", async () => {
      if (/\.mkv|matroska/i.test(unwrapDubUrl(playUrl)) || S?.codecNote) {
        setError("This file's codec can't play in-app (MKV/Dolby) - pick a white chip (H.264+AAC) or paste an mp4/m3u8 link.");
        return;
      }
      if (tryProxyRoute()) return;
      const handled = await recover();
      if (!handled) setError("This link failed (expired or unsupported) - pick another chip or paste a link.");
    });
    /* watchdog: a source that just buffers forever (dead/slow upstream,
     * throttled link) - after 20s without a frame, refresh it; after two
     * failed refreshes tell the user to pick another chip */
    let stallTimer: ReturnType<typeof setTimeout> | undefined;
    const armStall = () => {
      clearTimeout(stallTimer);
      stallTimer = setTimeout(() => {
        if (tryProxyRoute()) return;
        recover().then((ok) => {
          if (!ok) { try { art.notice.show = "Source too slow - pick another chip"; } catch {} }
        });
      }, 20000);
    };
    const clearStall = () => clearTimeout(stallTimer);
    /* NOTE: call art.on(...) DIRECTLY - detaching the method
     * (const on = art.on; on(...)) loses `this`, and ArtPlayer's
     * emitter reads this.e -> "Cannot read properties of undefined
     * (reading 'e')" crash on every playback. */
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
  const S = streams?.[current];
  const visible = streams ? (showAll ? streams : streams.filter((s) => s.webSafe)) : [];
  const hiddenCount = streams ? streams.length - visible.length : 0;

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
                      {S?.codecNote ? <p className="mb-1.5 text-amber-400">{S.codecNote} - this source may be silent.</p> : null}
                      <p className="mb-1.5">This file has one audio track. To change language, pick another source (each chip is a different language/quality):</p>
                      <div className="flex flex-wrap gap-1">
                        {visible.slice(0, 6).map((s, i) => (
                          <button key={i} onClick={() => pick(streams!.indexOf(s))}
                            className="rounded-full bg-white/10 px-2 py-0.5 text-[10.5px] font-semibold text-neutral-200 hover:bg-white/20">
                            {s.quality} · {s.langs.join("+")}
                          </button>
                        ))}
                      </div>
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
                      <p className="mb-1">Current source: <span className="font-semibold text-white">{S?.quality ?? "unknown"}</span></p>
                      <p>File links are fixed quality - switch via the source chips below the player.</p>
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
        ) : streams === null ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[13px] text-neutral-400">Finding multi-language sources…</span>
          </div>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <span className="text-3xl">🌐</span>
            <p className="mt-2 text-sm font-bold">No Multi Dub sources found</p>
            <p className="text-[12.5px] text-neutral-400">Paste a video link below, or try another server.</p>
          </div>
        )}
      </div>

      {/* paste box + source chips (stay available while playing) */}
      <div className="styled-scroll max-h-44 shrink-0 overflow-y-auto border-t border-white/10 bg-black/40 px-2 py-2">
        <div className="mb-2 flex items-center gap-1.5">
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
        </div>
        {streams && streams.length > 0 ? (
          <>
            <div className="mb-1 flex items-center justify-between px-1">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                Multi Dub sources ({visible.length}{hiddenCount ? ` of ${streams.length}` : ""})
              </span>
              {hiddenCount > 0 ? (
                <button onClick={() => setShowAll((v) => !v)} className="text-[10px] font-semibold text-amber-500/90 hover:text-amber-400">
                  {showAll ? "hide codec-limited" : `+${hiddenCount} codec-limited (may be silent)`}
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
                  {s.quality}{s.codec === "HEVC" ? " HEVC" : ""} · {s.langs.join("+")}{s.size ? ` · ${s.size}` : ""}{s.host && s.host !== "PenguPlay" ? ` · ${s.host}` : ""}
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
