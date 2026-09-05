/** Lenis-aware smooth scroll (falls back to native when Lenis is off) */
export function scrollToEl(el: HTMLElement | null, offset = -84) {
  if (!el) return;
  const lenis = (window as unknown as { __lenis?: { scrollTo: (t: HTMLElement, o?: object) => void } }).__lenis;
  if (lenis?.scrollTo) lenis.scrollTo(el, { offset, duration: 0.8 });
  else el.scrollIntoView({ behavior: "smooth", block: "start" });
}
