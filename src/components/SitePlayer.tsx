"use client";

import { useEffect, useRef } from "react";

type Props = {
  url: string;
  title: string;
  onError?: () => void;
  onVlc?: () => void;
  onDownload?: () => void;
};

/* Inbuilt site player (ArtPlayer - the same engine family as Multiverse's
 * player): plays the WebStreamr direct links with a Multiverse-style UI
 * (speed / aspect / flip / lock / screenshot + Download & VLC controls).
 * HLS goes through hls.js; progressive files straight to <video>.
 * Browser-codec limits still apply (HEVC/Dolby need real VLC) - failures
 * surface via onError and the VLC control stays one tap away. */
export default function SitePlayer({ url, title, onError, onVlc, onDownload }: Props) {
  const host = useRef<HTMLDivElement | null>(null);
  const cbs = useRef({ onError, onVlc, onDownload });
  cbs.current = { onError, onVlc, onDownload };

  useEffect(() => {
    let art: any = null;
    let hls: any = null;
    let dead = false;
    (async () => {
      try {
        const { default: Artplayer } = (await import("artplayer")) as any;
        if (dead || !host.current) return;
        const isHls = /\.m3u8(\?|#|$)/i.test(url);
        art = new Artplayer({
          container: host.current,
          url,
          type: isHls ? "m3u8" : "mp4",
          customType: {
            m3u8: async (video: any, src: string) => {
              try {
                const { default: Hls } = (await import("hls.js")) as any;
                if (Hls.isSupported()) {
                  hls = new Hls({ maxBufferLength: 30 });
                  hls.loadSource(src);
                  hls.attachMedia(video);
                } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                  video.src = src; /* Safari plays HLS natively */
                }
              } catch {}
            },
          },
          title,
          theme: "#e50914",
          volume: 0.8,
          autoplay: true,
          muted: false,
          playsInline: true,
          pip: true,
          fullscreen: true,
          lock: true,
          playbackRate: true,
          aspectRatio: true,
          flip: true,
          hotkey: true,
          screenshot: true,
          controls: [
            {
              name: "vlc",
              position: "right",
              html: "VLC",
              tooltip: "Open in VLC",
              click: () => cbs.current.onVlc?.(),
            },
            {
              name: "download",
              position: "right",
              html: "⬇",
              tooltip: "Download",
              click: () => cbs.current.onDownload?.(),
            },
          ],
        });
        art.on("error", () => {
          if (!dead) cbs.current.onError?.();
        });
      } catch {
        if (!dead) cbs.current.onError?.();
      }
    })();
    return () => {
      dead = true;
      try {
        art?.destroy();
      } catch {}
      try {
        hls?.destroy?.();
      } catch {}
      art = null;
      hls = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  return <div ref={host} className="h-full w-full bg-black" />;
}
