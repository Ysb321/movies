"use client";

import { motion } from "framer-motion";
import RouteProgress from "@/components/RouteProgress";

/** Re-mounts on every navigation → subtle netflix-like page transition +
 *  youtube-style top progress bar while the new page opens */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RouteProgress />
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32, ease: [0.22, 0.61, 0.36, 1] }}
      >
        {children}
      </motion.div>
    </>
  );
}
