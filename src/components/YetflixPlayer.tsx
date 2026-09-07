"use client";

/** Yetflix Player - the FOSS in-house player (ArtPlayer + hls.js, both
 * MIT/Apache). Plays direct file links + HLS from the "Multi Dub"
 * sources with a language/quality picker; switches audio tracks when the
 * stream is multi-audio HLS; tracks resume via the same storage keys as
 * the embedded players. */

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

export default function YetflixPlayer({ type, tmdbId, season, episode }: Props) {
  const boxRef = useRef<HTMLDivElement>(null);
  const artRef = useRef<Artplayer | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const lastSaved = useRef(0);
  const [streams, setStreams] = useState<DubStream[] | null>(null);
  const [current, setCurrent] = useState(-1);
  const [error, setError] = useState("");

  const rkey = resumeKeyFor(type, tmdbId, season ?? 1, episode ?? 1);

  /* load the source list */
  useEffect(() => {
    let dead = false;
    setStreams(null);
    setError("");
    fetchDubStreams(type, tmdbId, season, episode)
      .then((s) => { if (!dead) setStreams(s); })
      .catch(() => { if (!dead) setStreams([]); });
    return () => { dead = true; };
  }, [type, tmdbId, season, episode]);

  /* build/refresh the player when a source is selected */
  useEffect(() => {
    if (!boxRef.current || current < 0 || !streams?.[current]) return;
    const src = streams[current];
    const resumeAt = getResume(rkey)?.positionSec ?? 0;
    lastSaved.current = resumeAt;

    const art = new Artplayer({
      container: boxRef.current,
      url: src.url,
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
      moreVideoAttr: { crossOrigin: "anonymous", playsInline: true },
      customType: {
        m3u8: (video: HTMLVideoElement, url: string, art: Artplayer) => {
          if (Hls.isSupported()) {
            const hls = new Hls({ maxBufferLength: 30 });
            hls.loadSource(url);
            hls.attachMedia(video);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              /* multi-audio HLS -> audio-track switcher in settings */
              const tracks = hls.audioTracks ?? [];
              if (tracks.length > 1) {
                art.setting.update({
                  name: "audio",
                  width: 200,
                  html: "Audio Track",
                  tooltip: tracks[hls.audioTrack]?.name ?? "",
                  icon: '<svg width="22" height="22" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" fill="currentColor"/></svg>',
                  selector: tracks.map((t: any, i: number) => ({ html: `${t.name || t.lang || "Track " + (i + 1)}`, url: "", default: i === hls.audioTrack })),
                  onSelect(item: any) {
                    const idx = tracks.findIndex((t: any, i: number) => `${t.name || t.lang || "Track " + (i + 1)}` === item.html);
                    if (idx >= 0) hls.audioTrack = idx;
                    return item.html;
                  },
                });
              }
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

    /* resume + progress persistence (same keys as embedded players) */
    art.on("ready", () => { if (resumeAt > 10) art.currentTime = resumeAt; });
    art.on("timeupdate", () => {
      const t = art.currentTime;
      if (t - lastSaved.current >= 5) {
        lastSaved.current = t;
        saveResume(rkey, t, art.duration || undefined);
      }
    });
    art.on("ended", () => clearResume(rkey));
    art.on("error", () => setError("This source failed to play - pick another one below."));
    artRef.current = art;
    return () => { art.destroy(false); artRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, streams, rkey]);

  const S = streams?.[current];

  return (
    <div className="flex h-full w-full flex-col">
      <div className="relative min-h-0 w-full flex-1">
        {S ? (
          <div ref={boxRef} className="absolute inset-0" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            {streams === null ? (
              <span className="text-[13px] text-neutral-400">Finding multi-language sources…</span>
            ) : (
              <div className="px-6 text-center">
                <span className="text-3xl">🌐</span>
                <p className="mt-2 text-sm font-bold">No Multi Dub sources found</p>
                <p className="text-[12.5px] text-neutral-400">Try another server below.</p>
              </div>
            )}
          </div>
        )}
        {S && error ? (
          <div className="absolute inset-x-0 top-0 bg-brand/90 px-3 py-1.5 text-center text-[12px] font-semibold">{error}</div>
        ) : null}
      </div>

      {/* source picker: language / quality / size / host */}
      {streams && streams.length > 0 ? (
        <div className="styled-scroll max-h-32 shrink-0 overflow-y-auto border-t border-white/10 bg-black/40 px-2 py-2">
          <div className="mb-1 flex items-center justify-between px-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
              Multi Dub sources ({streams.length})
            </span>
            <span className="text-[10px] text-neutral-600">switch any time - playback resumes</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {streams.map((s, i) => (
              <button
                key={s.url + i}
                onClick={() => { setError(""); setCurrent(i); }}
                title={`${s.quality} - ${s.langs.join("+")} - ${s.host}${s.codecNote ? " - " + s.codecNote : ""}`}
                className={
                  "rounded-full px-2.5 py-1 text-[11px] font-semibold transition " +
                  (i === current
                    ? "bg-brand text-white"
                    : s.webSafe
                      ? "bg-white/10 text-neutral-200 hover:bg-white/20"
                      : "bg-amber-900/40 text-amber-300 hover:bg-amber-900/60")
                }
              >
                {s.quality} · {s.langs.join("+")}{s.size ? ` · ${s.size}` : ""}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
