"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/** Lenis smooth scrolling — buttery, rAF-driven wheel smoothing with
 *  native fallback (reduced-motion users & SSR keep the default behavior). */
export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const lenis = new Lenis({
      lerp: 0.12,
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 1.4,
    });
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;

    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      (window as unknown as { __lenis?: Lenis }).__lenis = undefined;
    };
  }, []);

  return <>{children}</>;
}
