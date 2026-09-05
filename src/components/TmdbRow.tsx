"use client";

import { useMemo } from "react";
import useSWR from "swr";
import Row from "./Row";
import { swrFetcher, type Media, type ProgressItem } from "@/lib/tmdb";
import { interleave, type RowDef } from "@/lib/rows";

/** Loads a declarative RowDef (multi-source rows are interleaved) and renders
 *  a Row. SWR dedupes/caches so scrolling back never refetches. */
export default function TmdbRow({
  def,
  progressItems,
  onRemove,
}: {
  def: RowDef;
  progressItems?: Map<number, ProgressItem>;
  onRemove?: (id: number) => void;
}) {
  const keys = def.sources.map(([path, params]) => `${path}?${new URLSearchParams(params as any)}`);

  const results = useSWR<any, any, any>(keys.length === 1 ? keys[0] : null);
  const multiA = useSWR<any, any, any>(keys.length > 1 ? keys[0] : null);
  const multiB = useSWR<any, any, any>(keys.length > 1 ? keys[1] : null);
  const multiC = useSWR<any, any, any>(keys.length > 1 ? keys[2] : null);

  const { items, loading } = useMemo(() => {
    if (keys.length === 1) {
      return { items: (results.data?.results ?? []) as Media[], loading: !results.data && !results.error };
    }
    const lists = [multiA, multiB, multiC]
      .filter(Boolean)
      .map((s) => (s?.data?.results ?? []) as Media[]);
    const anyLoading = [multiA, multiB, multiC].some((s) => s && !s.data && !s.error);
    if (!lists.length) return { items: [], loading: anyLoading };
    const merged = lists.length === 1 ? lists[0] : interleave(lists);
    return { items: merged, loading: anyLoading };
  }, [results.data, results.error, multiA?.data, multiB?.data, multiC?.data, multiA?.error, multiB?.error, multiC?.error, keys.length]);

  const finalItems = def.pick ? def.pick(items) : items;

  if (!loading && finalItems.length === 0) return null;

  return (
    <Row
      title={def.title}
      items={finalItems}
      variant={def.variant}
      top10={def.top10}
      loading={loading}
      progressItems={progressItems}
      onRemove={onRemove}
    />
  );
}
