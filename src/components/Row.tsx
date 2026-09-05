"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** Netflix-style carousel: transform-based paging (GPU), drag + trackpad,
 *  no overflow clipping so hover pops escape the row. */
export default function Row({
  title,
  items,
  variant = "backdrop",
  top10,
  loading,
  progressItems,
  onRemove,
}: {
  title: string;
  items: Media[];
  variant?: "backdrop" | "poster";
  top10?: boolean;
  loading?: boolean;
  progressItems?: Map<number, ProgressItem>;
  onRemove?: (id: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [maxPage, setMaxPage] = useState(0);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState(false);
  const x = useMotionValue(0);
  const controls = useAnimationControls();
  const lastWheel = useRef(0);

  const measure = useCallback(() => {
    const el = containerRef.current;
    const track = trackRef.current;
    if (!el || !track) return;
    const w = el.clientWidth;
    const shift = w; // one page = full visible width
    const max = Math.max(0, Math.ceil((track.scrollWidth - w) / shift));
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
    controls.start({
      x: -page * width,
      transition: { type: "spring", stiffness: 230, damping: 32, mass: 0.9 },
    });
  }, [page, width, controls]);

  const snap = useCallback(
    (p: number) => {
      const target = Math.max(0, Math.min(p, maxPage));
      setPage(target);
      controls.start({
        x: -target * width,
        transition: { type: "spring", stiffness: 230, damping: 32, mass: 0.9 },
      });
    },
    [maxPage, width, controls]
  );

  // trackpad horizontal swipe → page turn (non-passive)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) + 4 && Math.abs(e.deltaX) > 6) {
        e.preventDefault();
        const now = performance.now();
        if (now - lastWheel.current < 380) return; // one page per gesture
        lastWheel.current = now;
        snap(page + Math.sign(e.deltaX));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [page, snap]);

  const itemWidth = top10 ? WIDTHS.top10 : variant === "poster" ? WIDTHS.poster : WIDTHS.backdrop;

  return (
    <section className="group/row relative z-0 py-2.5 hover:z-30 cv-auto">
      <h2 className="mb-1.5 px-[4vw] text-[15px] font-bold tracking-wide text-neutral-200 transition-colors md:text-[17px]">
        {title}
      </h2>

      <div ref={containerRef} className="relative px-[4vw]">
        {/* left arrow */}
        {page > 0 && (
          <button
            aria-label="Scroll left"
            onClick={() => snap(page - 1)}
            className="absolute inset-y-0 left-0 z-40 flex w-[4vw] min-w-9 items-center justify-center bg-black/40 text-white opacity-0 transition hover:bg-black/70 group-hover/row:opacity-100"
          >
            <ChevronIcon dir="left" className="h-9 w-9 drop-shadow" />
          </button>
        )}

        <motion.div
          ref={trackRef}
          drag="x"
          dragConstraints={{ left: -maxPage * width, right: 0 }}
          dragElastic={0.08}
          onDragStart={() => setDragging(true)}
          onDragEnd={() => {
            setDragging(false);
            snap(Math.round(-x.get() / width));
          }}
          style={{ x }}
          className={clsx(
            "flex w-max gap-1.5 px-0 py-6", // vertical padding hosts the hover pop
            dragging && "cursor-grabbing [&_div[data-card]]:pointer-events-none"
          )}
        >
          {loading
            ? Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className={clsx("shrink-0", itemWidth)}>
                  <div className={clsx("skeleton", top10 || variant === "poster" ? "aspect-[2/3]" : "aspect-video", "w-[88%]")} />
                </div>
              ))
            : items.slice(0, top10 ? 10 : 26).map((item, i) => (
                <div key={`${item.id}-${i}`} data-card className={clsx("shrink-0", itemWidth)}>
                  <Card
                    item={item}
                    variant={variant}
                    rank={top10 ? i + 1 : undefined}
                    progress={progressItems?.get(item.id)}
                    onRemove={onRemove ? () => onRemove(item.id) : undefined}
                    edge={i === 0 ? "left" : i >= 19 ? "right" : null}
                  />
                </div>
              ))}
        </motion.div>

        {/* right arrow */}
        {page < maxPage && (
          <button
            aria-label="Scroll right"
            onClick={() => snap(page + 1)}
            className="absolute inset-y-0 right-0 z-40 flex w-[4vw] min-w-9 items-center justify-center bg-black/40 text-white opacity-0 transition hover:bg-black/70 group-hover/row:opacity-100"
          >
            <ChevronIcon className="h-9 w-9 drop-shadow" />
          </button>
        )}
      </div>
    </section>
  );
}
