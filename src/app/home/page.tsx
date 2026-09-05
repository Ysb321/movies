"use client";

import { useEffect, useMemo, useState } from "react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import HeroBillboard from "@/components/HeroBillboard";
import Row from "@/components/Row";
import TmdbRow from "@/components/TmdbRow";
import { useTmdbSnapshot } from "@/components/SWRProvider";
import { HOME_ROWS } from "@/lib/rows";
import {
  getProgress, onProgressChange, removeProgress,
  getList, onListChange, getActiveProfile,
} from "@/lib/storage";
import type { ListItem, ProgressItem } from "@/lib/storage";

export default function HomePage() {
  const { data, isLoading } = useTmdbSnapshot<any>("trending/movie/week?page=1");
  const heroes = useMemo(() => (data?.results ?? []).slice(0, 6), [data]);

  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [myList, setMyList] = useState<ListItem[]>([]);
  const [profileName, setProfileName] = useState("you");

  useEffect(() => {
    setProgress(getProgress());
    setMyList(getList());
    setProfileName(getActiveProfile()?.name ?? "you");
    const a = onProgressChange(setProgress);
    const b = onListChange(setMyList);
    return () => { a(); b(); };
  }, []);

  // continue-watching: distinct items keyed by id with their progress
  const cwItems = useMemo(() => progress.slice(0, 14), [progress]);
  const cwMap = useMemo(() => new Map(cwItems.map((p) => [p.id, p])), [cwItems]);

  const listItems = useMemo(
    () => myList.map((l) => ({ ...l, media_type: l.type, title: l.title })) as any[],
    [myList]
  );

  return (
    <main className="min-h-screen bg-ink">
      <Navbar />

      {isLoading && heroes.length === 0 ? (
        <div className="relative h-[82vh] min-h-[480px] max-h-[860px] w-full">
          <div className="skeleton h-full w-full rounded-none opacity-70" />
          <div className="absolute bottom-[16%] px-[4vw]">
            <div className="skeleton mb-4 h-14 w-[min(70vw,420px)]" />
            <div className="skeleton mb-2 h-4 w-[min(60vw,380px)]" />
            <div className="skeleton mb-2 h-4 w-[min(50vw,320px)]" />
            <div className="skeleton h-11 w-52" />
          </div>
        </div>
      ) : (
        <HeroBillboard heroes={heroes} />
      )}

      <div className="relative z-10 -mt-14 flex flex-col gap-0.5 pb-6">
        {cwItems.length > 0 && (
          <Row
            title={`Continue Watching for ${profileName}`}
            items={cwItems as any}
            progressItems={cwMap}
            onRemove={removeProgress}
          />
        )}
        {listItems.length > 0 && <Row title="My List" items={listItems} />}
        {HOME_ROWS.map((def) => (
          <TmdbRow key={def.key} def={def} />
        ))}
      </div>

      <Footer />
    </main>
  );
}
