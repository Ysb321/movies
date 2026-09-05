"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useAnimationControls, useMotionValue } from "framer-motion";
import clsx from "clsx";
import Card from "./Card";
import { ChevronIcon } from "./Icons";
import { type Media, type ProgressItem } from "@/lib/tmdb";

const WIDTHS = {
  backdrop:
    "w-[68vw] sm:w-[41vw] md:w-[31vw] lg:w-[23.5vw] xl:w-[18.7vw] 2xl:w-[15.6vw]",
  poster:
    "w-[35vw] sm:w-[25vw] md:w-[19vw] lg:w-[13.6vw] xl:w-[10.8vw] 2xl:w-[9.2vw]",
  top10:
    "w-[42vw] sm:w-[29vw] md:w-[22vw] lg:w-[16vw] xl:w-[12.6vw] 2xl:w-[10.8vw]",
};

const SPRING = { type: "spring", stiffness: 260, damping: 34, mass: 0.85 } as const;

/** Netflix-style carousel: transform-based GPU paging, drag + trackpad +
 *  keyboard, edge-aware arrows, optional endless pages via onRequestMore. */
export default function Row({
  title,
  items,
  variant = "backdrop",
  top10,
  loading,
  href,
  progressItems,
  onRemove,
  onRequestMore,
  moreLoading,
}: {
  title: string;
  items: Media[];
  variant?: "backdrop" | "poster";
  top10?: boolean;
  loading?: boolean;
  href?: string;
  progressItems?: Map<number, ProgressItem>;
  onRemove?: (id: number) => void;
  /** called when the user pages/drags past the end → parent appends items */
  onRequestMore?: () => void;
  moreLoading?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [maxPage, setMaxPage] = useState(0);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [canMore, setCanMore] = useState(true);
  const x = useMotionValue(0);
  const controls = useAnimationControls();
  const lastWheel = useRef(0);
  const moreBusy = useRef(false);

  const measure = useCallback(() => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const w = el.clientWidth;
    const max = Math.max(0, Math.ceil((track.scrollWidth - w) / w));
    setWidth(w);
    setMaxPage(max);
    setPage((p) => Math.min(p, max));
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
  }, [measure, items.length]);

  useEffect(() => {
    controls.start({ x: -page * width, transition: SPRING });
  }, [page, width, controls]);

  const requestMore = useCallback(() => {
    if (!onRequestMore || moreBusy.current || !canMore) return;
    moreBusy.current = true;
    onRequestMore();
    // allow asking again shortly (parent may have appended by then)
    setTimeout(() => (moreBusy.current = false), 900);
  }, [onRequestMore, canMore]);

  useEffect(() => {
    setCanMore(true);
  }, [items.length]);

  const snap = useCallback(
    (p: number) => {
      const target = Math.max(0, Math.min(p, maxPage));
      setPage(target);
      controls.start({ x: -target * width, transition: SPRING });
      if (target >= maxPage) requestMore();
    },
    [maxPage, width, controls, requestMore]
  );

  // trackpad horizontal swipe → page turn
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) + 4 && Math.abs(e.deltaX) > 6) {
        e.preventDefault();
        const now = performance.now();
        if (now - lastWheel.current < 380) return;
        lastWheel.current = now;
        snap(page + Math.sign(e.deltaX));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [page, snap]);

  // keyboard ← → when the row header/container is focused
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      snap(page + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      snap(page - 1);
    }
  };

  const itemWidth = top10 ? WIDTHS.top10 : variant === "poster" ? WIDTHS.poster : WIDTHS.backdrop;
  const arrowBase =
    "absolute inset-y-0 z-40 hidden h-full w-[4vw] min-w-10 items-center justify-center rounded-full text-white/90 transition sm:flex";
  const arrowBg = "bg-black/40 hover:bg-black/75 backdrop-blur-sm";

  return (
    <section className="group/row relative z-0 py-2.5 hover:z-30 cv-auto">
      <div className="mb-1.5 flex items-baseline gap-3 px-[4vw]">
        <h2
          tabIndex={0}
          onKeyDown={onKeyDown}
          className="cursor-default text-[15px] font-bold tracking-wide text-neutral-200 outline-none transition-colors focus-visible:text-white md:text-[17px]"
        >
          {title}
        </h2>
        {href && (
          <Link
            href={href}
            className="flex translate-x-[-6px] items-center gap-0.5 text-[12px] font-semibold text-sky-400 opacity-0 transition-all duration-300 hover:text-sky-300 focus-visible:translate-x-0 focus-visible:opacity-100 group-hover/row:translate-x-0 group-hover/row:opacity-100"
          >
            Explore All <ChevronIcon className="h-3 w-3" />
          </Link>
        )}
        <span className="ml-1 hidden text-[11px] text-neutral-500 opacity-0 transition group-hover/row:opacity-100 md:inline">
          ← → to browse
        </span>
      </div>

      <div ref={containerRef} className="relative px-[4vw]" onKeyDown={onKeyDown}>
        {/* left arrow */}
        <button
          aria-label="Scroll left"
          onClick={() => snap(page - 1)}
          className={clsx(arrowBase, arrowBg, "left-0 rounded-l-none", page > 0 ? "opacity-0 group-hover/row:opacity-100" : "pointer-events-none opacity-0")}
        >
          <ChevronIcon dir="left" className="h-8 w-8 drop-shadow md:h-10 md:w-10" />
        </button>

        <motion.div
          ref={trackRef}
          drag="x"
          dragDirectionLock
          dragConstraints={{ left: -maxPage * width, right: 0 }}
          dragElastic={0.06}
          dragMomentum
          onDragStart={() => setDragging(true)}
          onDragEnd={() => {
            setDragging(false);
            const target = Math.round(-x.get() / width);
            if (target >= maxPage) requestMore();
            snap(target);
          }}
          style={{ x }}
          className={clsx(
            "flex w-max touch-pan-y gap-1.5 px-0 py-6", // vertical padding hosts the hover pop
            dragging && "cursor-grabbing [&_div[data-card]]:pointer-events-none"
          )}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={clsx("shrink-0", itemWidth)}>
                  <div className={clsx("skeleton", top10 || variant === "poster" ? "aspect-[2/3]" : "aspect-video", "w-[88%]")} />
                </div>
              ))
            : items.slice(0, 60).map((item, i) => (
                <div key={`${item.id}-${i}`} data-card className={clsx("shrink-0", itemWidth)}>
                  <Card
                    item={item}
                    variant={variant}
                    rank={top10 ? i + 1 : undefined}
                    progress={progressItems?.get(item.id)}
                    onRemove={onRemove ? () => onRemove(item.id) : undefined}
                    edge={i === 0 ? "left" : i >= items.length - 3 ? "right" : null}
                  />
                </div>
              ))}
          {moreLoading &&
            Array.from({ length: 4 }).map((_, i) => (
              <div key={`m${i}`} className={clsx("shrink-0", itemWidth)}>
                <div className={clsx("skeleton opacity-50", top10 || variant === "poster" ? "aspect-[2/3]" : "aspect-video", "w-[88%]")} />
              </div>
            ))}
        </motion.div>

        {/* right arrow */}
        <button
          aria-label="Scroll right"
          onClick={() => snap(page + 1)}
          className={clsx(
            arrowBase,
            arrowBg,
            "right-0 rounded-r-none",
            page < maxPage || canMore ? "opacity-0 group-hover/row:opacity-100" : "pointer-events-none opacity-0"
          )}
        >
          <ChevronIcon className="h-8 w-8 drop-shadow md:h-10 md:w-10" />
        </button>
      </div>
    </section>
  );
}
