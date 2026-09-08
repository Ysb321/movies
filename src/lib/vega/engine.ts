/* Vega provider engine - server-only.
 * Runs the bundled provider modules from Zenda-Cross/vega-providers
 * (vendored under vendor/vega, CJS dist bundles, auto-updating base
 * URLs via their urls.json on GitHub). Providers receive a
 * providerContext: an axios-COMPATIBLE fetch shim + cheerio +
 * commonHeaders (+ optional kvStore; openWebView intentionally absent
 * so WAF-403 hosts fail per-provider instead of blocking the request).
 * No external requires inside the bundles. */
import * as cheerio from "cheerio";

import V1cinevoodPosts from "../../../vendor/vega/1cinevood/posts.js";
import V1cinevoodMeta from "../../../vendor/vega/1cinevood/meta.js";
import V1cinevoodStream from "../../../vendor/vega/1cinevood/stream.js";
import V1cinevoodEpisodes from "../../../vendor/vega/1cinevood/episodes.js";
import V4khdhubPosts from "../../../vendor/vega/4khdhub/posts.js";
import V4khdhubMeta from "../../../vendor/vega/4khdhub/meta.js";
import V4khdhubStream from "../../../vendor/vega/4khdhub/stream.js";
import Joya9tvPosts from "../../../vendor/vega/Joya9tv/posts.js";
import Joya9tvMeta from "../../../vendor/vega/Joya9tv/meta.js";
import Joya9tvStream from "../../../vendor/vega/Joya9tv/stream.js";
import Joya9tvEpisodes from "../../../vendor/vega/Joya9tv/episodes.js";
import A111477Posts from "../../../vendor/vega/a111477/posts.js";
import A111477Meta from "../../../vendor/vega/a111477/meta.js";
import A111477Stream from "../../../vendor/vega/a111477/stream.js";
import A111477Episodes from "../../../vendor/vega/a111477/episodes.js";
import AnikotoPosts from "../../../vendor/vega/anikoto/posts.js";
import AnikotoMeta from "../../../vendor/vega/anikoto/meta.js";
import AnikotoStream from "../../../vendor/vega/anikoto/stream.js";
import AnimetsuPosts from "../../../vendor/vega/animetsu/posts.js";
import AnimetsuMeta from "../../../vendor/vega/animetsu/meta.js";
import AnimetsuStream from "../../../vendor/vega/animetsu/stream.js";
import AutoEmbedPosts from "../../../vendor/vega/autoEmbed/posts.js";
import AutoEmbedMeta from "../../../vendor/vega/autoEmbed/meta.js";
import AutoEmbedStream from "../../../vendor/vega/autoEmbed/stream.js";
import CinefreakPosts from "../../../vendor/vega/cinefreak/posts.js";
import CinefreakMeta from "../../../vendor/vega/cinefreak/meta.js";
import CinefreakStream from "../../../vendor/vega/cinefreak/stream.js";
import CinemaLuxePosts from "../../../vendor/vega/cinemaLuxe/posts.js";
import CinemaLuxeMeta from "../../../vendor/vega/cinemaLuxe/meta.js";
import CinemaLuxeStream from "../../../vendor/vega/cinemaLuxe/stream.js";
import CinemaLuxeEpisodes from "../../../vendor/vega/cinemaLuxe/episodes.js";
import DooflixPosts from "../../../vendor/vega/dooflix/posts.js";
import DooflixMeta from "../../../vendor/vega/dooflix/meta.js";
import DooflixStream from "../../../vendor/vega/dooflix/stream.js";
import DrivePosts from "../../../vendor/vega/drive/posts.js";
import DriveMeta from "../../../vendor/vega/drive/meta.js";
import DriveStream from "../../../vendor/vega/drive/stream.js";
import DriveEpisodes from "../../../vendor/vega/drive/episodes.js";
import EonMoviesPosts from "../../../vendor/vega/eonMovies/posts.js";
import EonMoviesMeta from "../../../vendor/vega/eonMovies/meta.js";
import EonMoviesStream from "../../../vendor/vega/eonMovies/stream.js";
import EverythingPosts from "../../../vendor/vega/everything/posts.js";
import EverythingMeta from "../../../vendor/vega/everything/meta.js";
import EverythingStream from "../../../vendor/vega/everything/stream.js";
import FilmyflyPosts from "../../../vendor/vega/filmyfly/posts.js";
import FilmyflyMeta from "../../../vendor/vega/filmyfly/meta.js";
import FilmyflyStream from "../../../vendor/vega/filmyfly/stream.js";
import FilmyflyEpisodes from "../../../vendor/vega/filmyfly/episodes.js";
import FlixhqPosts from "../../../vendor/vega/flixhq/posts.js";
import FlixhqMeta from "../../../vendor/vega/flixhq/meta.js";
import FlixhqStream from "../../../vendor/vega/flixhq/stream.js";
import GokuHDPosts from "../../../vendor/vega/gokuHD/posts.js";
import GokuHDMeta from "../../../vendor/vega/gokuHD/meta.js";
import GokuHDStream from "../../../vendor/vega/gokuHD/stream.js";
import GokuHDEpisodes from "../../../vendor/vega/gokuHD/episodes.js";
import GuardahdPosts from "../../../vendor/vega/guardahd/posts.js";
import GuardahdMeta from "../../../vendor/vega/guardahd/meta.js";
import GuardahdStream from "../../../vendor/vega/guardahd/stream.js";
import Hdhub4uPosts from "../../../vendor/vega/hdhub4u/posts.js";
import Hdhub4uMeta from "../../../vendor/vega/hdhub4u/meta.js";
import Hdhub4uStream from "../../../vendor/vega/hdhub4u/stream.js";
import HiAnimePosts from "../../../vendor/vega/hiAnime/posts.js";
import HiAnimeMeta from "../../../vendor/vega/hiAnime/meta.js";
import HiAnimeStream from "../../../vendor/vega/hiAnime/stream.js";
import KatMovieFixPosts from "../../../vendor/vega/katMovieFix/posts.js";
import KatMovieFixMeta from "../../../vendor/vega/katMovieFix/meta.js";
import KatMovieFixStream from "../../../vendor/vega/katMovieFix/stream.js";
import KatMovieFixEpisodes from "../../../vendor/vega/katMovieFix/episodes.js";
import KatmoviesPosts from "../../../vendor/vega/katmovies/posts.js";
import KatmoviesMeta from "../../../vendor/vega/katmovies/meta.js";
import KatmoviesStream from "../../../vendor/vega/katmovies/stream.js";
import KatmoviesEpisodes from "../../../vendor/vega/katmovies/episodes.js";
import KickAssAnimePosts from "../../../vendor/vega/kickAssAnime/posts.js";
import KickAssAnimeMeta from "../../../vendor/vega/kickAssAnime/meta.js";
import KickAssAnimeStream from "../../../vendor/vega/kickAssAnime/stream.js";
import KissKhPosts from "../../../vendor/vega/kissKh/posts.js";
import KissKhMeta from "../../../vendor/vega/kissKh/meta.js";
import KissKhStream from "../../../vendor/vega/kissKh/stream.js";
import KmMoviesPosts from "../../../vendor/vega/kmMovies/posts.js";
import KmMoviesMeta from "../../../vendor/vega/kmMovies/meta.js";
import KmMoviesStream from "../../../vendor/vega/kmMovies/stream.js";
import KmMoviesEpisodes from "../../../vendor/vega/kmMovies/episodes.js";
import LuxMoviesPosts from "../../../vendor/vega/luxMovies/posts.js";
import LuxMoviesMeta from "../../../vendor/vega/luxMovies/meta.js";
import LuxMoviesStream from "../../../vendor/vega/luxMovies/stream.js";
import LuxMoviesEpisodes from "../../../vendor/vega/luxMovies/episodes.js";
import MkvDramaPosts from "../../../vendor/vega/mkvDrama/posts.js";
import MkvDramaMeta from "../../../vendor/vega/mkvDrama/meta.js";
import MkvDramaStream from "../../../vendor/vega/mkvDrama/stream.js";
import MkvDramaEpisodes from "../../../vendor/vega/mkvDrama/episodes.js";
import ModPosts from "../../../vendor/vega/mod/posts.js";
import ModMeta from "../../../vendor/vega/mod/meta.js";
import ModStream from "../../../vendor/vega/mod/stream.js";
import ModEpisodes from "../../../vendor/vega/mod/episodes.js";
import MovieBoxPosts from "../../../vendor/vega/movieBox/posts.js";
import MovieBoxMeta from "../../../vendor/vega/movieBox/meta.js";
import MovieBoxStream from "../../../vendor/vega/movieBox/stream.js";
import MovieBoxEpisodes from "../../../vendor/vega/movieBox/episodes.js";
import MovieBoxWebPosts from "../../../vendor/vega/movieBoxWeb/posts.js";
import MovieBoxWebMeta from "../../../vendor/vega/movieBoxWeb/meta.js";
import MovieBoxWebStream from "../../../vendor/vega/movieBoxWeb/stream.js";
import MovieBoxWebEpisodes from "../../../vendor/vega/movieBoxWeb/episodes.js";
import Movies4uPosts from "../../../vendor/vega/movies4u/posts.js";
import Movies4uMeta from "../../../vendor/vega/movies4u/meta.js";
import Movies4uStream from "../../../vendor/vega/movies4u/stream.js";
import Movies4uEpisodes from "../../../vendor/vega/movies4u/episodes.js";
import MoviezwapPosts from "../../../vendor/vega/moviezwap/posts.js";
import MoviezwapMeta from "../../../vendor/vega/moviezwap/meta.js";
import MoviezwapStream from "../../../vendor/vega/moviezwap/stream.js";
import MoviezwapEpisodes from "../../../vendor/vega/moviezwap/episodes.js";
import MultiPosts from "../../../vendor/vega/multi/posts.js";
import MultiMeta from "../../../vendor/vega/multi/meta.js";
import MultiStream from "../../../vendor/vega/multi/stream.js";
import NetflixMirrorPosts from "../../../vendor/vega/netflixMirror/posts.js";
import NetflixMirrorMeta from "../../../vendor/vega/netflixMirror/meta.js";
import NetflixMirrorStream from "../../../vendor/vega/netflixMirror/stream.js";
import NetflixMirrorEpisodes from "../../../vendor/vega/netflixMirror/episodes.js";
import OgomoviesPosts from "../../../vendor/vega/ogomovies/posts.js";
import OgomoviesMeta from "../../../vendor/vega/ogomovies/meta.js";
import OgomoviesStream from "../../../vendor/vega/ogomovies/stream.js";
import PrimeMirrorPosts from "../../../vendor/vega/primeMirror/posts.js";
import PrimeMirrorMeta from "../../../vendor/vega/primeMirror/meta.js";
import PrimeMirrorStream from "../../../vendor/vega/primeMirror/stream.js";
import PrimeMirrorEpisodes from "../../../vendor/vega/primeMirror/episodes.js";
import PrimewirePosts from "../../../vendor/vega/primewire/posts.js";
import PrimewireMeta from "../../../vendor/vega/primewire/meta.js";
import PrimewireStream from "../../../vendor/vega/primewire/stream.js";
import ProtonMoviesPosts from "../../../vendor/vega/protonMovies/posts.js";
import ProtonMoviesMeta from "../../../vendor/vega/protonMovies/meta.js";
import ProtonMoviesStream from "../../../vendor/vega/protonMovies/stream.js";
import RidoMoviesPosts from "../../../vendor/vega/ridoMovies/posts.js";
import RidoMoviesMeta from "../../../vendor/vega/ridoMovies/meta.js";
import RidoMoviesStream from "../../../vendor/vega/ridoMovies/stream.js";
import RingzPosts from "../../../vendor/vega/ringz/posts.js";
import RingzMeta from "../../../vendor/vega/ringz/meta.js";
import RingzStream from "../../../vendor/vega/ringz/stream.js";
import ShowboxPosts from "../../../vendor/vega/showbox/posts.js";
import ShowboxMeta from "../../../vendor/vega/showbox/meta.js";
import ShowboxStream from "../../../vendor/vega/showbox/stream.js";
import ShowboxEpisodes from "../../../vendor/vega/showbox/episodes.js";
import SkyMovieHDPosts from "../../../vendor/vega/skyMovieHD/posts.js";
import SkyMovieHDMeta from "../../../vendor/vega/skyMovieHD/meta.js";
import SkyMovieHDStream from "../../../vendor/vega/skyMovieHD/stream.js";
import SkyMovieHDEpisodes from "../../../vendor/vega/skyMovieHD/episodes.js";
import TokyoInsiderPosts from "../../../vendor/vega/tokyoInsider/posts.js";
import TokyoInsiderMeta from "../../../vendor/vega/tokyoInsider/meta.js";
import TokyoInsiderStream from "../../../vendor/vega/tokyoInsider/stream.js";
import TopmoviesPosts from "../../../vendor/vega/topmovies/posts.js";
import TopmoviesMeta from "../../../vendor/vega/topmovies/meta.js";
import TopmoviesStream from "../../../vendor/vega/topmovies/stream.js";
import TopmoviesEpisodes from "../../../vendor/vega/topmovies/episodes.js";
import UhdPosts from "../../../vendor/vega/uhd/posts.js";
import UhdMeta from "../../../vendor/vega/uhd/meta.js";
import UhdStream from "../../../vendor/vega/uhd/stream.js";
import UniquestreamPosts from "../../../vendor/vega/uniquestream/posts.js";
import UniquestreamMeta from "../../../vendor/vega/uniquestream/meta.js";
import UniquestreamStream from "../../../vendor/vega/uniquestream/stream.js";
import UniquestreamEpisodes from "../../../vendor/vega/uniquestream/episodes.js";
import VadapavPosts from "../../../vendor/vega/vadapav/posts.js";
import VadapavMeta from "../../../vendor/vega/vadapav/meta.js";
import VadapavStream from "../../../vendor/vega/vadapav/stream.js";
import VadapavEpisodes from "../../../vendor/vega/vadapav/episodes.js";
import VegaPosts from "../../../vendor/vega/vega/posts.js";
import VegaMeta from "../../../vendor/vega/vega/meta.js";
import VegaStream from "../../../vendor/vega/vega/stream.js";
import VegaEpisodes from "../../../vendor/vega/vega/episodes.js";
import World4uPosts from "../../../vendor/vega/world4u/posts.js";
import World4uMeta from "../../../vendor/vega/world4u/meta.js";
import World4uStream from "../../../vendor/vega/world4u/stream.js";
import World4uEpisodes from "../../../vendor/vega/world4u/episodes.js";
import ZeeflizPosts from "../../../vendor/vega/zeefliz/posts.js";
import ZeeflizMeta from "../../../vendor/vega/zeefliz/meta.js";
import ZeeflizStream from "../../../vendor/vega/zeefliz/stream.js";
import ZeeflizEpisodes from "../../../vendor/vega/zeefliz/episodes.js";

export type VegaChip = {
  provider: string;    /* vega, 4khdhub, hdhub4u... */
  server: string;      /* FastDl, Gofile, PixelDrain, GDrive... */
  link: string;        /* DIRECT playable url */
  type: string;        /* m3u8 | mp4 | mkv ... */
  quality?: string;
  title?: string;      /* matched post title (lang parsing) */
  headers?: any;
  subtitles?: { title: string; language: string; uri: string; type: string }[];
};

type ProviderMod = { value: string; name: string; posts: any; meta: any; stream: any; episodes: any };

const PROVIDERS: ProviderMod[] = [
  { value: "1cinevood", name: "Cinewood", posts: V1cinevoodPosts, meta: V1cinevoodMeta, stream: V1cinevoodStream, episodes: V1cinevoodEpisodes },
  { value: "4khdhub", name: "4khdHub", posts: V4khdhubPosts, meta: V4khdhubMeta, stream: V4khdhubStream, episodes: null },
  { value: "Joya9tv", name: "Joya9tv", posts: Joya9tvPosts, meta: Joya9tvMeta, stream: Joya9tvStream, episodes: Joya9tvEpisodes },
  { value: "a111477", name: "A.111477", posts: A111477Posts, meta: A111477Meta, stream: A111477Stream, episodes: A111477Episodes },
  { value: "anikoto", name: "Anikoto", posts: AnikotoPosts, meta: AnikotoMeta, stream: AnikotoStream, episodes: null },
  { value: "animetsu", name: "Animetsu", posts: AnimetsuPosts, meta: AnimetsuMeta, stream: AnimetsuStream, episodes: null },
  { value: "autoEmbed", name: "MultiStream", posts: AutoEmbedPosts, meta: AutoEmbedMeta, stream: AutoEmbedStream, episodes: null },
  { value: "cinefreak", name: "CineFreak", posts: CinefreakPosts, meta: CinefreakMeta, stream: CinefreakStream, episodes: null },
  { value: "cinemaLuxe", name: "CinemaLuxe", posts: CinemaLuxePosts, meta: CinemaLuxeMeta, stream: CinemaLuxeStream, episodes: CinemaLuxeEpisodes },
  { value: "dooflix", name: "Dooflix", posts: DooflixPosts, meta: DooflixMeta, stream: DooflixStream, episodes: null },
  { value: "drive", name: "MoviesDrive", posts: DrivePosts, meta: DriveMeta, stream: DriveStream, episodes: DriveEpisodes },
  { value: "eonMovies", name: "EonMovies", posts: EonMoviesPosts, meta: EonMoviesMeta, stream: EonMoviesStream, episodes: null },
  { value: "everything", name: "Everything", posts: EverythingPosts, meta: EverythingMeta, stream: EverythingStream, episodes: null },
  { value: "filmyfly", name: "FilmyFly", posts: FilmyflyPosts, meta: FilmyflyMeta, stream: FilmyflyStream, episodes: FilmyflyEpisodes },
  { value: "flixhq", name: "FlixHQ", posts: FlixhqPosts, meta: FlixhqMeta, stream: FlixhqStream, episodes: null },
  { value: "gokuHD", name: "GokuHD", posts: GokuHDPosts, meta: GokuHDMeta, stream: GokuHDStream, episodes: GokuHDEpisodes },
  { value: "guardahd", name: "GuardaHD", posts: GuardahdPosts, meta: GuardahdMeta, stream: GuardahdStream, episodes: null },
  { value: "hdhub4u", name: "HdHub4u", posts: Hdhub4uPosts, meta: Hdhub4uMeta, stream: Hdhub4uStream, episodes: null },
  { value: "hiAnime", name: "HiAnime", posts: HiAnimePosts, meta: HiAnimeMeta, stream: HiAnimeStream, episodes: null },
  { value: "katMovieFix", name: "KatMovieFix", posts: KatMovieFixPosts, meta: KatMovieFixMeta, stream: KatMovieFixStream, episodes: KatMovieFixEpisodes },
  { value: "katmovies", name: "KatMoviesHd", posts: KatmoviesPosts, meta: KatmoviesMeta, stream: KatmoviesStream, episodes: KatmoviesEpisodes },
  { value: "kickAssAnime", name: "KickAssAnime", posts: KickAssAnimePosts, meta: KickAssAnimeMeta, stream: KickAssAnimeStream, episodes: null },
  { value: "kissKh", name: "KissKh", posts: KissKhPosts, meta: KissKhMeta, stream: KissKhStream, episodes: null },
  { value: "kmMovies", name: "KmMovies", posts: KmMoviesPosts, meta: KmMoviesMeta, stream: KmMoviesStream, episodes: KmMoviesEpisodes },
  { value: "luxMovies", name: "RogMovies", posts: LuxMoviesPosts, meta: LuxMoviesMeta, stream: LuxMoviesStream, episodes: LuxMoviesEpisodes },
  { value: "mkvDrama", name: "MKVDrama", posts: MkvDramaPosts, meta: MkvDramaMeta, stream: MkvDramaStream, episodes: MkvDramaEpisodes },
  { value: "mod", name: "MoviesMod", posts: ModPosts, meta: ModMeta, stream: ModStream, episodes: ModEpisodes },
  { value: "movieBox", name: "MovieBox App", posts: MovieBoxPosts, meta: MovieBoxMeta, stream: MovieBoxStream, episodes: MovieBoxEpisodes },
  { value: "movieBoxWeb", name: "MovieBox Web", posts: MovieBoxWebPosts, meta: MovieBoxWebMeta, stream: MovieBoxWebStream, episodes: MovieBoxWebEpisodes },
  { value: "movies4u", name: "Movies4U", posts: Movies4uPosts, meta: Movies4uMeta, stream: Movies4uStream, episodes: Movies4uEpisodes },
  { value: "moviezwap", name: "MoviezWap", posts: MoviezwapPosts, meta: MoviezwapMeta, stream: MoviezwapStream, episodes: MoviezwapEpisodes },
  { value: "multi", name: "MultiMovies", posts: MultiPosts, meta: MultiMeta, stream: MultiStream, episodes: null },
  { value: "netflixMirror", name: "NetflixMirror", posts: NetflixMirrorPosts, meta: NetflixMirrorMeta, stream: NetflixMirrorStream, episodes: NetflixMirrorEpisodes },
  { value: "ogomovies", name: "Ogomovies", posts: OgomoviesPosts, meta: OgomoviesMeta, stream: OgomoviesStream, episodes: null },
  { value: "primeMirror", name: "PrimeMirror", posts: PrimeMirrorPosts, meta: PrimeMirrorMeta, stream: PrimeMirrorStream, episodes: PrimeMirrorEpisodes },
  { value: "primewire", name: "Primewire", posts: PrimewirePosts, meta: PrimewireMeta, stream: PrimewireStream, episodes: null },
  { value: "protonMovies", name: "ProtonMovies", posts: ProtonMoviesPosts, meta: ProtonMoviesMeta, stream: ProtonMoviesStream, episodes: null },
  { value: "ridoMovies", name: "RidoMovies", posts: RidoMoviesPosts, meta: RidoMoviesMeta, stream: RidoMoviesStream, episodes: null },
  { value: "ringz", name: "Ringz", posts: RingzPosts, meta: RingzMeta, stream: RingzStream, episodes: null },
  { value: "showbox", name: "ShowBox", posts: ShowboxPosts, meta: ShowboxMeta, stream: ShowboxStream, episodes: ShowboxEpisodes },
  { value: "skyMovieHD", name: "SkyMovieHD", posts: SkyMovieHDPosts, meta: SkyMovieHDMeta, stream: SkyMovieHDStream, episodes: SkyMovieHDEpisodes },
  { value: "tokyoInsider", name: "TokyoInsider", posts: TokyoInsiderPosts, meta: TokyoInsiderMeta, stream: TokyoInsiderStream, episodes: null },
  { value: "topmovies", name: "TopMovies", posts: TopmoviesPosts, meta: TopmoviesMeta, stream: TopmoviesStream, episodes: TopmoviesEpisodes },
  { value: "uhd", name: "UHDMovies", posts: UhdPosts, meta: UhdMeta, stream: UhdStream, episodes: null },
  { value: "uniquestream", name: "AnimeStream", posts: UniquestreamPosts, meta: UniquestreamMeta, stream: UniquestreamStream, episodes: UniquestreamEpisodes },
  { value: "vadapav", name: "VadaPav", posts: VadapavPosts, meta: VadapavMeta, stream: VadapavStream, episodes: VadapavEpisodes },
  { value: "vega", name: "VMovies", posts: VegaPosts, meta: VegaMeta, stream: VegaStream, episodes: VegaEpisodes },
  { value: "world4u", name: "World4uFree", posts: World4uPosts, meta: World4uMeta, stream: World4uStream, episodes: World4uEpisodes },
  { value: "zeefliz", name: "Zeefliz", posts: ZeeflizPosts, meta: ZeeflizMeta, stream: ZeeflizStream, episodes: ZeeflizEpisodes },
];

/* axios-compatible shim on fetch (providers use get/post/head + the
 * callable form; errors carry .response/.config like axios) */
async function doRequest(url: string, config: any = {}): Promise<any> {
  const { headers = {}, params, data, method = "GET", signal } = config || {};
  let u = url;
  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) qs.append(k, String(v));
    u += (u.includes("?") ? "&" : "?") + qs.toString();
  }
  let body: any = data;
  const h: Record<string, string> = { ...headers };
  if (data && typeof data === "object") {
    body = JSON.stringify(data);
    if (!h["Content-Type"] && !h["content-type"]) h["Content-Type"] = "application/json";
  }
  const res = await fetch(u, { method, headers: h, body, signal, redirect: "follow" });
  if (res.status < 200 || res.status >= 300) {
    const err: any = new Error("Request failed with status code " + res.status);
    err.response = { status: res.status, statusText: res.statusText, config: { url: u }, headers: res.headers };
    err.config = { url: u };
    throw err;
  }
  const text = await res.text();
  let payload: any = text;
  try { payload = JSON.parse(text); } catch { /* html/plain */ }
  return { data: payload, status: res.status, statusText: res.statusText, headers: res.headers, config: { url: u } };
}

const axiosShim: any = (url: string, config?: any) => doRequest(url, config);
axiosShim.get = (url: string, config?: any) => doRequest(url, config);
axiosShim.post = (url: string, data?: any, config?: any) => doRequest(url, { ...(config || {}), method: "POST", data });
axiosShim.head = (url: string, config?: any) => doRequest(url, { ...(config || {}), method: "HEAD" });

const COMMON_HEADERS: Record<string, string> = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Sec-Fetch-Dest": "document",
  "Sec-Fetch-Mode": "navigate",
  "Sec-Fetch-Site": "none",
  "Sec-Fetch-User": "?1",
  "Upgrade-Insecure-Requests": "1",
  "Cache-Control": "max-age=0",
};

const memoryKV = () => {
  const m = new Map<string, string>();
  return {
    get: async (k: string) => m.get(k),
    set: async (k: string, v: string) => { m.set(k, v); },
    delete: async (k: string) => { m.delete(k); },
  };
};

const makeContext = () => ({
  axios: axiosShim,
  cheerio,
  commonHeaders: COMMON_HEADERS,
  kvStore: memoryKV(),
});

const norm = (x: string) => (x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function postMatches(title: string, wantTitle: string, year: number): boolean {
  const t = norm(title);
  const tokens = norm(wantTitle).split(" ").filter((w) => w.length > 3);
  if (tokens.length && !tokens.some((tk) => t.includes(tk))) return false;
  if (!year) return true;
  const years = (title.match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  if (!years.length) return true;
  return years.some((y) => Math.abs(y - year) <= 1);
}

function episodeEntry(list: any[], episode: number): any | null {
  const num = new RegExp("(^|[^0-9])0*" + episode + "([^0-9]|$)", "i");
  return list.find((d) => num.test(d?.title ?? "")) ?? list[episode - 1] ?? null;
}

async function searchProvider(m: ProviderMod, query: string, signal: AbortSignal) {
  const posts = await m.posts.getSearchPosts({
    searchQuery: query, page: 1, providerValue: m.value, signal, providerContext: makeContext(),
  });
  return (posts ?? []).filter((p: any) => p?.link && p?.title);
}

async function resolveEpisodeLink(m: ProviderMod, link: string, season: number, episode: number, signal: AbortSignal): Promise<string | null> {
  if (!m.meta) return null;
  const info = await m.meta.getMeta({ link, providerContext: makeContext(), signal });
  const seasons = info?.linkList ?? [];
  if (!seasons.length) return null;
  const sNum = new RegExp("(^|[^0-9])0*" + season + "([^0-9]|$)", "i");
  const sEntry =
    seasons.find((s: any) => sNum.test(s?.title ?? "")) ??
    seasons.find((s: any) => /all|every|complete/i.test(s?.title ?? "")) ??
    seasons[0];
  if (!sEntry) return null;
  if (Array.isArray(sEntry.directLinks) && sEntry.directLinks.length) {
    const ep = episodeEntry(sEntry.directLinks, episode);
    return ep?.link ?? null;
  }
  if (sEntry.episodesLink && m.episodes?.getEpisodes) {
    const eps = await m.episodes.getEpisodes({ url: sEntry.episodesLink, providerContext: makeContext(), signal });
    const ep = episodeEntry(eps ?? [], episode);
    return ep?.link ?? null;
  }
  return null;
}

type VegaMeta = { title: string; year: number };

export async function listAll(
  meta: VegaMeta,
  type: "movie" | "tv",
  season?: number,
  episode?: number
): Promise<VegaChip[]> {
  const signal = AbortSignal.timeout(24000);
  const jobs = PROVIDERS.map(async (m): Promise<VegaChip[]> => {
    try {
      const posts = await searchProvider(m, meta.title, signal);
      const hit = posts.find((p: any) => postMatches(p.title, meta.title, meta.year));
      if (!hit) return [];
      let link: string = hit.link;
      if (type === "tv") {
        const epLink = await resolveEpisodeLink(m, hit.link, season ?? 1, episode ?? 1, signal);
        if (!epLink) return [];
        link = epLink;
      }
      const streams = await m.stream.getStream({
        link, type: type === "tv" ? "series" : "movie", signal,
        providerContext: makeContext(), isDownload: false,
      });
      return (streams ?? [])
        .filter((s: any) => s?.link && /^https?:/i.test(s.link))
        .map((s: any) => ({
          provider: m.value, server: s.server ?? m.name, link: s.link, type: s.type ?? "",
          quality: s.quality, title: hit.title, headers: s.headers, subtitles: s.subtitles,
        }));
    } catch {
      return [];
    }
  });

  const all = (await Promise.all(jobs)).flat();
  const seen = new Set<string>();
  const out: VegaChip[] = [];
  for (const c of all) {
    if (seen.has(c.link)) continue;
    seen.add(c.link);
    out.push(c);
  }
  return out.slice(0, 80);
}

export const VEGA_PROVIDER_COUNT = PROVIDERS.length;
