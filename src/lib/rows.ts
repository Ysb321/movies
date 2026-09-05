import type { Media } from "./tmdb";

/* Static genre maps (avoid extra API round-trips on the critical path) */
export const MOVIE_GENRES: Record<number, string> = {
  28: "Action", 12: "Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 14: "Fantasy", 36: "History",
  27: "Horror", 10402: "Music", 9648: "Mystery", 10749: "Romance", 878: "Sci-Fi",
  10770: "TV Movie", 53: "Thriller", 10752: "War", 37: "Western",
};
export const TV_GENRES: Record<number, string> = {
  10759: "Action & Adventure", 16: "Animation", 35: "Comedy", 80: "Crime",
  99: "Documentary", 18: "Drama", 10751: "Family", 10762: "Kids", 9648: "Mystery",
  10763: "News", 10764: "Reality", 10765: "Sci-Fi & Fantasy", 10766: "Soap",
  10767: "Talk", 10768: "War & Politics", 37: "Western",
};

export const genreNames = (m: Media, map: Record<number, string> = MOVIE_GENRES) =>
  (m.genre_ids ?? m.genres?.map((g) => g.id) ?? [])
    .map((id) => map[id])
    .filter(Boolean)
    .slice(0, 3);

/* Row catalogue — one declarative source for the home page. Each row maps to
 * one or two TMDB requests; multi-request rows interleave results client-side
 * so a single cache entry powers the whole row. */
export type RowDef = {
  key: string;
  title: string;
  variant?: "backdrop" | "poster";
  top10?: boolean;
  /** "Explore all" target shown next to the row title (netflix-style) */
  href?: string;
  /** sources: [path, params] pairs — results are interleaved */
  sources: [string, Record<string, string | number>][];
  /** transform (e.g. dedupe / filter) */
  pick?: (items: Media[]) => Media[];
};

export const HOME_ROWS: RowDef[] = [
  {
    key: "trending-movies",
    title: "Trending Movies",
    href: "/movies",
    sources: [["trending/movie/week", { page: 1 }]],
  },
  {
    key: "trending-tv",
    title: "Trending TV Shows",
    href: "/tv",
    sources: [["trending/tv/week", { page: 1 }]],
  },
  {
    key: "trending-india",
    title: "Trending in India",
    href: "/movies",
    sources: [
      ["discover/movie", { region: "IN", sort_by: "popularity.desc", "vote_count.gte": 30 }],
      ["discover/tv", { region: "IN", sort_by: "popularity.desc", "vote_count.gte": 20, with_origin_country: "IN" }],
    ],
  },
  {
    key: "top10-india",
    title: "Top 10 in India Today",
    top10: true,
    href: "/movies",
    sources: [["discover/movie", { region: "IN", sort_by: "popularity.desc", "vote_count.gte": 80 }]],
  },
  {
    key: "hollywood",
    title: "Hollywood Movies",
    href: "/movies",
    sources: [
      ["discover/movie", { with_original_language: "en", with_origin_country: "US", "vote_count.gte": 400, sort_by: "popularity.desc" }],
    ],
  },
  {
    key: "bollywood",
    title: "Bollywood Movies",
    href: "/movies",
    sources: [["discover/movie", { with_original_language: "hi", "vote_count.gte": 30, sort_by: "popularity.desc" }]],
  },
  {
    key: "south-indian",
    title: "South Indian Cinema",
    sources: [
      ["discover/movie", { with_original_language: "ta", "vote_count.gte": 20, sort_by: "popularity.desc" }],
      ["discover/movie", { with_original_language: "te", "vote_count.gte": 20, sort_by: "popularity.desc" }],
      ["discover/movie", { with_original_language: "ml", "vote_count.gte": 15, sort_by: "popularity.desc" }],
    ],
  },
  {
    key: "korean-tv",
    title: "Korean TV Shows",
    href: "/tv",
    sources: [["discover/tv", { with_origin_country: "KR", "vote_count.gte": 30, sort_by: "popularity.desc" }]],
  },
  {
    key: "anime",
    title: "Anime",
    variant: "poster",
    sources: [["discover/tv", { with_origin_country: "JP", with_genres: 16, "vote_count.gte": 20, sort_by: "popularity.desc" }]],
  },
  {
    key: "chinese-tv",
    title: "Chinese TV Shows",
    variant: "poster",
    sources: [["discover/tv", { with_origin_country: "CN", "vote_count.gte": 10, sort_by: "popularity.desc" }]],
  },
  {
    key: "indian-tv",
    title: "Indian TV Shows",
    sources: [["discover/tv", { with_origin_country: "IN", "vote_count.gte": 10, sort_by: "popularity.desc" }]],
  },
  {
    key: "us-tv",
    title: "US TV Shows",
    sources: [["discover/tv", { with_origin_country: "US", "vote_count.gte": 200, sort_by: "popularity.desc" }]],
  },
  {
    key: "marvel",
    title: "Marvel Collection",
    sources: [["discover/movie", { with_companies: "420|38679", sort_by: "popularity.desc" }]],
  },
  {
    key: "animated",
    title: "Animated Movies",
    variant: "poster",
    sources: [["discover/movie", { with_genres: 16, "vote_count.gte": 300, sort_by: "popularity.desc" }]],
  },
  {
    key: "wwe",
    title: "WWE",
    sources: [["search/multi", { query: "WWE" }]],
    pick: (items) => items.filter((i) => i.media_type === "tv" || i.media_type === "movie"),
  },
];

/** round-robin merge of N result lists, deduped by id */
export function interleave(lists: Media[][]): Media[] {
  const seen = new Set<number>();
  const out: Media[] = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++)
    for (const l of lists) {
      const item = l[i];
      if (item && !seen.has(item.id)) {
        seen.add(item.id);
        out.push(item);
      }
    }
  return out;
}
