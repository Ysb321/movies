"use client";

import RouteProgress from "@/components/RouteProgress";
import "./transition.css";

/** Re-mounts on every navigation → subtle page transition + youtube-style
 *  top progress bar. Pure CSS animations (fast, no runtime lib). */
export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RouteProgress />
      <div className="page-in">{children}</div>
    </>
  );
}
