"use client";

import { motion } from "framer-motion";

/** YouTube-style top progress bar shown on every route open (mounted from
 *  template.tsx, which re-mounts per navigation). nprogress-style staging:
 *  quick burst, crawl, complete + fade — zero dependencies. */
export default function RouteProgress() {
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[400] h-[3px] origin-left bg-gradient-to-r from-brand via-rose-500 to-amber-500"
      initial={{ scaleX: 0, opacity: 1 }}
      animate={{ scaleX: [0, 0.62, 0.88, 1], opacity: [1, 1, 1, 0] }}
      transition={{ duration: 0.9, times: [0, 0.3, 0.75, 1], ease: "easeOut" }}
    />
  );
}
