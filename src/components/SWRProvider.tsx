"use client";

import useSWR, { SWRConfig } from "swr";
import { swrFetcher, getCached } from "@/lib/tmdb";

export default function SWRProvider({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        fetcher: swrFetcher,
        revalidateOnFocus: false,
        revalidateIfStale: true,
        dedupingInterval: 60_000,
        keepPreviousData: true,
        fallback: {}, // primed per-key by useTmdbSnapshot below
      }}
    >
      {children}
    </SWRConfig>
  );
}

/** useSWR + localStorage snapshot: paints cached data instantly, then
 *  revalidates in the background — zero spinner on revisit. */
export function useTmdbSnapshot<T = any>(key: string | null) {
  const snapshot = key ? getCached(key) : undefined;
  const swr = useSWR<any, any, any | null>(key, {
    fallbackData: snapshot && snapshot.data !== undefined ? snapshot.data : undefined,
    keepPreviousData: true,
  });
  return swr;
}
