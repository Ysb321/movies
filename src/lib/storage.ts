"use client";

/* localStorage-backed stores for profiles, My List and Continue Watching */

export type Profile = { id: string; name: string; color: string; kids?: boolean };
export type ListItem = {
  id: number;
  type: "movie" | "tv";
  title: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  vote_average?: number;
  year?: string;
};
export type ProgressItem = ListItem & {
  season?: number;
  episode?: number;
  episodeName?: string;
  episodeCount?: number;
  ts: number;
};

const read = <T,>(key: string, fallback: T): T => {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const write = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent("store:" + key, { detail: value }));
  } catch {}
};

const sub = <T,>(key: string, cb: (v: T) => void) => {
  const handler = (e: Event) => cb((e as CustomEvent).detail as T);
  const storage = () => cb(read<T>(key, [] as unknown as T));
  window.addEventListener("store:" + key, handler);
  window.addEventListener("storage", storage);
  return () => {
    window.removeEventListener("store:" + key, handler);
    window.removeEventListener("storage", storage);
  };
};

/* ── profiles ── */
const PROFILE_KEY = "netout:profiles";
const ACTIVE_KEY = "netout:activeProfile";

export const defaultProfiles: Profile[] = [
  { id: "p1", name: "Person 1", color: "#5e17eb" },
  { id: "p2", name: "Person 2", color: "#e50914" },
  { id: "p3", name: "Person 3", color: "#1a9c5b" },
  { id: "kids", name: "Kids", color: "#f5a623", kids: true },
];

export const getProfiles = () => read<Profile[]>(PROFILE_KEY, defaultProfiles);
export const setProfiles = (p: Profile[]) => write(PROFILE_KEY, p);
export const getActiveProfile = () => read<Profile | null>(ACTIVE_KEY, null);
export const setActiveProfile = (p: Profile | null) => write(ACTIVE_KEY, p);
export const onProfilesChange = (cb: (p: Profile[]) => void) => sub<Profile[]>(PROFILE_KEY, cb);
export const onActiveProfileChange = (cb: (p: Profile | null) => void) => sub<Profile | null>(ACTIVE_KEY, cb);

/* ── my list (per profile) ── */
const listKey = () => `netout:list:${getActiveProfile()?.id ?? "p1"}`;

export const getList = (): ListItem[] => read<ListItem[]>(listKey(), []);
export const inList = (id: number) => getList().some((i) => i.id === id);
export const toggleList = (item: ListItem) => {
  const cur = getList();
  write(listKey(), cur.some((i) => i.id === item.id) ? cur.filter((i) => i.id !== item.id) : [item, ...cur]);
};
export const onListChange = (cb: (l: ListItem[]) => void) => {
  const unsubs = [sub<ListItem[]>(listKey(), cb)];
  return () => unsubs.forEach((u) => u());
};

/* ── continue watching (per profile) ── */
const progKey = () => `netout:progress:${getActiveProfile()?.id ?? "p1"}`;

export const getProgress = (): ProgressItem[] =>
  read<ProgressItem[]>(progKey(), []).sort((a, b) => b.ts - a.ts);

export const saveProgress = (item: Omit<ProgressItem, "ts">) => {
  const cur = read<ProgressItem[]>(progKey(), []).filter((i) => !(i.id === item.id && i.type === item.type));
  write(progKey(), [{ ...item, ts: Date.now() }, ...cur].slice(0, 20));
};

export const removeProgress = (id: number) => write(progKey(), getProgress().filter((i) => i.id !== id));
export const clearProgress = () => write(progKey(), []);
export const onProgressChange = (cb: (l: ProgressItem[]) => void) => sub<ProgressItem[]>(progKey(), cb);
