/** Lenis-aware smooth scroll helpers (fall back to native when Lenis is off) */

type LenisLike = {
  scrollTo: (target: number | string | HTMLElement, opts?: Record<string, unknown>) => void;
  targetScroll: number;
  animatedScroll: number;
};

export const getLenis = (): LenisLike | undefined =>
  (window as unknown as { __lenis?: LenisLike }).__lenis;

export function scrollToEl(el: HTMLElement | null, offset = -84) {
  if (!el) return;
  const lenis = getLenis();
  if (lenis?.scrollTo) lenis.scrollTo(el, { offset, duration: 0.8 });
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
}

/** Forward a vertical wheel event (fired inside a data-lenis-prevent row) to
 *  the page's Lenis scroll, so vertical scrolling keeps working while the
 *  cursor is over cards. Returns false when Lenis is off (native takes over). */
export function forwardWheelToPage(e: WheelEvent): boolean {
  const lenis = getLenis();
  if (!lenis || typeof lenis.targetScroll !== "number") return false;
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
  lenis.scrollTo(lenis.targetScroll + dy * 1.05);
  return true;
}
