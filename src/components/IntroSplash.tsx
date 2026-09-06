"use client";

import { useEffect, useRef, useState } from "react";

/** Netflix-style intro splash: animated YETFLIX logo over black, played once
 *  per browser before the homepage opens (localStorage flag). Pure CSS
 *  keyframes (see globals.css) - no JS animation libs, respects
 *  prefers-reduced-motion, tap/click to skip, fully responsive via clamp(). */
const KEY = "yetflix:intro-shown";
const LETTERS = "YETFLIX".split("");

export default function IntroSplash() {
  const [show, setShow] = useState(false);
  const [out, setOut] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    let seen = false;
    try { seen = localStorage.getItem(KEY) === "1"; } catch {}
    if (seen) return;
    try { localStorage.setItem(KEY, "1"); } catch {}
    setShow(true);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    const total = reduced ? 800 : 2750; /* full sequence vs quick fade */
    timers.current.push(setTimeout(() => setOut(true), Math.max(total - 450, 0)));
    timers.current.push(setTimeout(() => setShow(false), total));
    return () => timers.current.forEach(clearTimeout);
  }, []);

  if (!show) return null;

  const skip = () => {
    timers.current.forEach(clearTimeout);
    setOut(true);
    timers.current.push(setTimeout(() => setShow(false), 380));
  };

  return (
    <div
      onClick={skip}
      className={`intro-overlay fixed inset-0 z-[300] flex cursor-pointer items-center justify-center bg-black ${out ? "out" : ""}`}
      role="presentation"
    >
      <div className={`intro-content relative select-none text-center ${out ? "out" : ""}`}>
        <div
          className="font-display relative flex justify-center overflow-hidden tracking-tight text-brand"
          style={{ fontSize: "clamp(3rem, 15vw, 10rem)" }}
        >
          {LETTERS.map((l, i) => (
            <span
              key={i}
              className="intro-letter"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              {l}
            </span>
          ))}
          <span className="intro-sweep" aria-hidden />
        </div>
        <span
          className="intro-tag mt-3 block uppercase text-neutral-400"
          style={{ fontSize: "clamp(0.55rem, 2vw, 0.95rem)", letterSpacing: "0.45em" }}
        >
          by Yashraj
        </span>
        <span className="intro-glow" aria-hidden />
      </div>
      <span className="absolute bottom-8 text-[10px] uppercase tracking-[0.3em] text-neutral-700">
        tap to skip
      </span>
    </div>
  );
}
