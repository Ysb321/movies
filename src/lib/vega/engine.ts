/* Vega provider engine - server-only.
 * Runs the bundled provider modules from Zenda-Cross/vega-providers
 * (vendored under vendor/vega; base URLs auto-update via their
 * urls.json on GitHub, cached in globalThis by the bundles).
 * Providers get a providerContext whose axios resolves RELATIVE urls
 * against the provider's own origin (captured from its first absolute
 * request - the vega app injects a per-provider axios with baseURL,
 * many stream.js modules rely on that). openWebView is deliberately
 * absent so WAF-403 hosts fail per-provider and get skipped. */
import * as cheerio from "cheerio";

import VVegaPosts from "../../../vendor/vega/vega/posts.js";
import VVegaMeta from "../../../vendor/vega/vega/meta.js";
import VVegaStream from "../../../vendor/vega/vega/stream.js";
import VVegaEpisodes from "../../../vendor/vega/vega/episodes.js";
import VMultiPosts from "../../../vendor/vega/multi/posts.js";
import VMultiMeta from "../../../vendor/vega/multi/meta.js";
import VMultiStream from "../../../vendor/vega/multi/stream.js";
import VMovies4uPosts from "../../../vendor/vega/movies4u/posts.js";
import VMovies4uMeta from "../../../vendor/vega/movies4u/meta.js";
import VMovies4uStream from "../../../vendor/vega/movies4u/stream.js";
import VMovies4uEpisodes from "../../../vendor/vega/movies4u/episodes.js";
import VTopmoviesPosts from "../../../vendor/vega/topmovies/posts.js";
import VTopmoviesMeta from "../../../vendor/vega/topmovies/meta.js";
import VTopmoviesStream from "../../../vendor/vega/topmovies/stream.js";
import VTopmoviesEpisodes from "../../../vendor/vega/topmovies/episodes.js";
import VWorld4uPosts from "../../../vendor/vega/world4u/posts.js";
import VWorld4uMeta from "../../../vendor/vega/world4u/meta.js";
import VWorld4uStream from "../../../vendor/vega/world4u/stream.js";
import VWorld4uEpisodes from "../../../vendor/vega/world4u/episodes.js";
import VZeeflizPosts from "../../../vendor/vega/zeefliz/posts.js";
import VZeeflizMeta from "../../../vendor/vega/zeefliz/meta.js";
import VZeeflizStream from "../../../vendor/vega/zeefliz/stream.js";
import VZeeflizEpisodes from "../../../vendor/vega/zeefliz/episodes.js";
import VLuxMoviesPosts from "../../../vendor/vega/luxMovies/posts.js";
import VLuxMoviesMeta from "../../../vendor/vega/luxMovies/meta.js";
import VLuxMoviesStream from "../../../vendor/vega/luxMovies/stream.js";
import VLuxMoviesEpisodes from "../../../vendor/vega/luxMovies/episodes.js";
import VDrivePosts from "../../../vendor/vega/drive/posts.js";
import VDriveMeta from "../../../vendor/vega/drive/meta.js";
import VDriveStream from "../../../vendor/vega/drive/stream.js";
import VDriveEpisodes from "../../../vendor/vega/drive/episodes.js";
import VEonMoviesPosts from "../../../vendor/vega/eonMovies/posts.js";
import VEonMoviesMeta from "../../../vendor/vega/eonMovies/meta.js";
import VEonMoviesStream from "../../../vendor/vega/eonMovies/stream.js";
import VJoya9tvPosts from "../../../vendor/vega/Joya9tv/posts.js";
import VJoya9tvMeta from "../../../vendor/vega/Joya9tv/meta.js";
import VJoya9tvStream from "../../../vendor/vega/Joya9tv/stream.js";
import VJoya9tvEpisodes from "../../../vendor/vega/Joya9tv/episodes.js";
import VRingzPosts from "../../../vendor/vega/ringz/posts.js";
import VRingzMeta from "../../../vendor/vega/ringz/meta.js";
import VRingzStream from "../../../vendor/vega/ringz/stream.js";
import VShowboxPosts from "../../../vendor/vega/showbox/posts.js";
import VShowboxMeta from "../../../vendor/vega/showbox/meta.js";
import VShowboxStream from "../../../vendor/vega/showbox/stream.js";
import VShowboxEpisodes from "../../../vendor/vega/showbox/episodes.js";
import VGuardahdPosts from "../../../vendor/vega/guardahd/posts.js";
import VGuardahdMeta from "../../../vendor/vega/guardahd/meta.js";
import VGuardahdStream from "../../../vendor/vega/guardahd/stream.js";
import VRidoMoviesPosts from "../../../vendor/vega/ridoMovies/posts.js";
import VRidoMoviesMeta from "../../../vendor/vega/ridoMovies/meta.js";
import VRidoMoviesStream from "../../../vendor/vega/ridoMovies/stream.js";
import VAutoEmbedPosts from "../../../vendor/vega/autoEmbed/posts.js";
import VAutoEmbedMeta from "../../../vendor/vega/autoEmbed/meta.js";
import VAutoEmbedStream from "../../../vendor/vega/autoEmbed/stream.js";
import VEverythingPosts from "../../../vendor/vega/everything/posts.js";
import VEverythingMeta from "../../../vendor/vega/everything/meta.js";
import VEverythingStream from "../../../vendor/vega/everything/stream.js";
import VProtonMoviesPosts from "../../../vendor/vega/protonMovies/posts.js";
import VProtonMoviesMeta from "../../../vendor/vega/protonMovies/meta.js";
import VProtonMoviesStream from "../../../vendor/vega/protonMovies/stream.js";
import VKatmoviesPosts from "../../../vendor/vega/katmovies/posts.js";
import VKatmoviesMeta from "../../../vendor/vega/katmovies/meta.js";
import VKatmoviesStream from "../../../vendor/vega/katmovies/stream.js";
import VKatmoviesEpisodes from "../../../vendor/vega/katmovies/episodes.js";
import VKatMovieFixPosts from "../../../vendor/vega/katMovieFix/posts.js";
import VKatMovieFixMeta from "../../../vendor/vega/katMovieFix/meta.js";
import VKatMovieFixStream from "../../../vendor/vega/katMovieFix/stream.js";
import VKatMovieFixEpisodes from "../../../vendor/vega/katMovieFix/episodes.js";
import VMovieBoxWebPosts from "../../../vendor/vega/movieBoxWeb/posts.js";
import VMovieBoxWebMeta from "../../../vendor/vega/movieBoxWeb/meta.js";
import VMovieBoxWebStream from "../../../vendor/vega/movieBoxWeb/stream.js";
import VMovieBoxWebEpisodes from "../../../vendor/vega/movieBoxWeb/episodes.js";
import VA111477Posts from "../../../vendor/vega/a111477/posts.js";
import VA111477Meta from "../../../vendor/vega/a111477/meta.js";
import VA111477Stream from "../../../vendor/vega/a111477/stream.js";
import VA111477Episodes from "../../../vendor/vega/a111477/episodes.js";
import VAnikotoPosts from "../../../vendor/vega/anikoto/posts.js";
import VAnikotoMeta from "../../../vendor/vega/anikoto/meta.js";
import VAnikotoStream from "../../../vendor/vega/anikoto/stream.js";
import VAnimetsuPosts from "../../../vendor/vega/animetsu/posts.js";
import VAnimetsuMeta from "../../../vendor/vega/animetsu/meta.js";
import VAnimetsuStream from "../../../vendor/vega/animetsu/stream.js";
import VCinefreakPosts from "../../../vendor/vega/cinefreak/posts.js";
import VCinefreakMeta from "../../../vendor/vega/cinefreak/meta.js";
import VCinefreakStream from "../../../vendor/vega/cinefreak/stream.js";
import VCinemaLuxePosts from "../../../vendor/vega/cinemaLuxe/posts.js";
import VCinemaLuxeMeta from "../../../vendor/vega/cinemaLuxe/meta.js";
import VCinemaLuxeStream from "../../../vendor/vega/cinemaLuxe/stream.js";
import VCinemaLuxeEpisodes from "../../../vendor/vega/cinemaLuxe/episodes.js";
import VDooflixPosts from "../../../vendor/vega/dooflix/posts.js";
import VDooflixMeta from "../../../vendor/vega/dooflix/meta.js";
import VDooflixStream from "../../../vendor/vega/dooflix/stream.js";
import VFilmyflyPosts from "../../../vendor/vega/filmyfly/posts.js";
import VFilmyflyMeta from "../../../vendor/vega/filmyfly/meta.js";
import VFilmyflyStream from "../../../vendor/vega/filmyfly/stream.js";
import VFilmyflyEpisodes from "../../../vendor/vega/filmyfly/episodes.js";
import VFlixhqPosts from "../../../vendor/vega/flixhq/posts.js";
import VFlixhqMeta from "../../../vendor/vega/flixhq/meta.js";
import VFlixhqStream from "../../../vendor/vega/flixhq/stream.js";
import VGokuHDPosts from "../../../vendor/vega/gokuHD/posts.js";
import VGokuHDMeta from "../../../vendor/vega/gokuHD/meta.js";
import VGokuHDStream from "../../../vendor/vega/gokuHD/stream.js";
import VGokuHDEpisodes from "../../../vendor/vega/gokuHD/episodes.js";
import VHiAnimePosts from "../../../vendor/vega/hiAnime/posts.js";
import VHiAnimeMeta from "../../../vendor/vega/hiAnime/meta.js";
import VHiAnimeStream from "../../../vendor/vega/hiAnime/stream.js";
import VKickAssAnimePosts from "../../../vendor/vega/kickAssAnime/posts.js";
import VKickAssAnimeMeta from "../../../vendor/vega/kickAssAnime/meta.js";
import VKickAssAnimeStream from "../../../vendor/vega/kickAssAnime/stream.js";
import VKissKhPosts from "../../../vendor/vega/kissKh/posts.js";
import VKissKhMeta from "../../../vendor/vega/kissKh/meta.js";
import VKissKhStream from "../../../vendor/vega/kissKh/stream.js";
import VKmMoviesPosts from "../../../vendor/vega/kmMovies/posts.js";
import VKmMoviesMeta from "../../../vendor/vega/kmMovies/meta.js";
import VKmMoviesStream from "../../../vendor/vega/kmMovies/stream.js";
import VKmMoviesEpisodes from "../../../vendor/vega/kmMovies/episodes.js";
import VMkvDramaPosts from "../../../vendor/vega/mkvDrama/posts.js";
import VMkvDramaMeta from "../../../vendor/vega/mkvDrama/meta.js";
import VMkvDramaStream from "../../../vendor/vega/mkvDrama/stream.js";
import VMkvDramaEpisodes from "../../../vendor/vega/mkvDrama/episodes.js";
import VModPosts from "../../../vendor/vega/mod/posts.js";
import VModMeta from "../../../vendor/vega/mod/meta.js";
import VModStream from "../../../vendor/vega/mod/stream.js";
import VModEpisodes from "../../../vendor/vega/mod/episodes.js";
import VMovieBoxPosts from "../../../vendor/vega/movieBox/posts.js";
import VMovieBoxMeta from "../../../vendor/vega/movieBox/meta.js";
import VMovieBoxStream from "../../../vendor/vega/movieBox/stream.js";
import VMovieBoxEpisodes from "../../../vendor/vega/movieBox/episodes.js";
import VNetflixMirrorPosts from "../../../vendor/vega/netflixMirror/posts.js";
import VNetflixMirrorMeta from "../../../vendor/vega/netflixMirror/meta.js";
import VNetflixMirrorStream from "../../../vendor/vega/netflixMirror/stream.js";
import VNetflixMirrorEpisodes from "../../../vendor/vega/netflixMirror/episodes.js";
import VOgomoviesPosts from "../../../vendor/vega/ogomovies/posts.js";
import VOgomoviesMeta from "../../../vendor/vega/ogomovies/meta.js";
import VOgomoviesStream from "../../../vendor/vega/ogomovies/stream.js";
import VPrimeMirrorPosts from "../../../vendor/vega/primeMirror/posts.js";
import VPrimeMirrorMeta from "../../../vendor/vega/primeMirror/meta.js";
import VPrimeMirrorStream from "../../../vendor/vega/primeMirror/stream.js";
import VPrimeMirrorEpisodes from "../../../vendor/vega/primeMirror/episodes.js";
import VPrimewirePosts from "../../../vendor/vega/primewire/posts.js";
import VPrimewireMeta from "../../../vendor/vega/primewire/meta.js";
import VPrimewireStream from "../../../vendor/vega/primewire/stream.js";
import VSkyMovieHDPosts from "../../../vendor/vega/skyMovieHD/posts.js";
import VSkyMovieHDMeta from "../../../vendor/vega/skyMovieHD/meta.js";
import VSkyMovieHDStream from "../../../vendor/vega/skyMovieHD/stream.js";
import VSkyMovieHDEpisodes from "../../../vendor/vega/skyMovieHD/episodes.js";
import VTokyoInsiderPosts from "../../../vendor/vega/tokyoInsider/posts.js";
import VTokyoInsiderMeta from "../../../vendor/vega/tokyoInsider/meta.js";
import VTokyoInsiderStream from "../../../vendor/vega/tokyoInsider/stream.js";
import VUhdPosts from "../../../vendor/vega/uhd/posts.js";
import VUhdMeta from "../../../vendor/vega/uhd/meta.js";
import VUhdStream from "../../../vendor/vega/uhd/stream.js";
import VUniquestreamPosts from "../../../vendor/vega/uniquestream/posts.js";
import VUniquestreamMeta from "../../../vendor/vega/uniquestream/meta.js";
import VUniquestreamStream from "../../../vendor/vega/uniquestream/stream.js";
import VUniquestreamEpisodes from "../../../vendor/vega/uniquestream/episodes.js";
import VVadapavPosts from "../../../vendor/vega/vadapav/posts.js";
import VVadapavMeta from "../../../vendor/vega/vadapav/meta.js";
import VVadapavStream from "../../../vendor/vega/vadapav/stream.js";
import VVadapavEpisodes from "../../../vendor/vega/vadapav/episodes.js";
import V1cinevoodPosts from "../../../vendor/vega/1cinevood/posts.js";
import V1cinevoodMeta from "../../../vendor/vega/1cinevood/meta.js";
import V1cinevoodStream from "../../../vendor/vega/1cinevood/stream.js";
import V1cinevoodEpisodes from "../../../vendor/vega/1cinevood/episodes.js";
import V4khdhubPosts from "../../../vendor/vega/4khdhub/posts.js";
import V4khdhubMeta from "../../../vendor/vega/4khdhub/meta.js";
import V4khdhubStream from "../../../vendor/vega/4khdhub/stream.js";
import VHdhub4uPosts from "../../../vendor/vega/hdhub4u/posts.js";
import VHdhub4uMeta from "../../../vendor/vega/hdhub4u/meta.js";
import VHdhub4uStream from "../../../vendor/vega/hdhub4u/stream.js";
import VMoviezwapPosts from "../../../vendor/vega/moviezwap/posts.js";
import VMoviezwapMeta from "../../../vendor/vega/moviezwap/meta.js";
import VMoviezwapStream from "../../../vendor/vega/moviezwap/stream.js";
import VMoviezwapEpisodes from "../../../vendor/vega/moviezwap/episodes.js";

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
export type VegaDebug = { provider: string; posts: number; titles: string[]; matched: string | null; chips: number; err: string | null; budget?: boolean };

const PROVIDERS: ProviderMod[] = [
  { value: "vega", name: "VMovies", posts: VVegaPosts, meta: VVegaMeta, stream: VVegaStream, episodes: VVegaEpisodes },
  { value: "multi", name: "MultiMovies", posts: VMultiPosts, meta: VMultiMeta, stream: VMultiStream, episodes: null },
  { value: "movies4u", name: "Movies4U", posts: VMovies4uPosts, meta: VMovies4uMeta, stream: VMovies4uStream, episodes: VMovies4uEpisodes },
  { value: "topmovies", name: "TopMovies", posts: VTopmoviesPosts, meta: VTopmoviesMeta, stream: VTopmoviesStream, episodes: VTopmoviesEpisodes },
  { value: "world4u", name: "World4uFree", posts: VWorld4uPosts, meta: VWorld4uMeta, stream: VWorld4uStream, episodes: VWorld4uEpisodes },
  { value: "zeefliz", name: "Zeefliz", posts: VZeeflizPosts, meta: VZeeflizMeta, stream: VZeeflizStream, episodes: VZeeflizEpisodes },
  { value: "luxMovies", name: "RogMovies", posts: VLuxMoviesPosts, meta: VLuxMoviesMeta, stream: VLuxMoviesStream, episodes: VLuxMoviesEpisodes },
  { value: "drive", name: "MoviesDrive", posts: VDrivePosts, meta: VDriveMeta, stream: VDriveStream, episodes: VDriveEpisodes },
  { value: "eonMovies", name: "EonMovies", posts: VEonMoviesPosts, meta: VEonMoviesMeta, stream: VEonMoviesStream, episodes: null },
  { value: "Joya9tv", name: "Joya9tv", posts: VJoya9tvPosts, meta: VJoya9tvMeta, stream: VJoya9tvStream, episodes: VJoya9tvEpisodes },
  { value: "ringz", name: "Ringz", posts: VRingzPosts, meta: VRingzMeta, stream: VRingzStream, episodes: null },
  { value: "showbox", name: "ShowBox", posts: VShowboxPosts, meta: VShowboxMeta, stream: VShowboxStream, episodes: VShowboxEpisodes },
  { value: "guardahd", name: "GuardaHD", posts: VGuardahdPosts, meta: VGuardahdMeta, stream: VGuardahdStream, episodes: null },
  { value: "ridoMovies", name: "RidoMovies", posts: VRidoMoviesPosts, meta: VRidoMoviesMeta, stream: VRidoMoviesStream, episodes: null },
  { value: "autoEmbed", name: "MultiStream", posts: VAutoEmbedPosts, meta: VAutoEmbedMeta, stream: VAutoEmbedStream, episodes: null },
  { value: "everything", name: "Everything", posts: VEverythingPosts, meta: VEverythingMeta, stream: VEverythingStream, episodes: null },
  { value: "protonMovies", name: "ProtonMovies", posts: VProtonMoviesPosts, meta: VProtonMoviesMeta, stream: VProtonMoviesStream, episodes: null },
  { value: "katmovies", name: "KatMoviesHd", posts: VKatmoviesPosts, meta: VKatmoviesMeta, stream: VKatmoviesStream, episodes: VKatmoviesEpisodes },
  { value: "katMovieFix", name: "KatMovieFix", posts: VKatMovieFixPosts, meta: VKatMovieFixMeta, stream: VKatMovieFixStream, episodes: VKatMovieFixEpisodes },
  { value: "movieBoxWeb", name: "MovieBox Web", posts: VMovieBoxWebPosts, meta: VMovieBoxWebMeta, stream: VMovieBoxWebStream, episodes: VMovieBoxWebEpisodes },
  { value: "a111477", name: "A.111477", posts: VA111477Posts, meta: VA111477Meta, stream: VA111477Stream, episodes: VA111477Episodes },
  { value: "anikoto", name: "Anikoto", posts: VAnikotoPosts, meta: VAnikotoMeta, stream: VAnikotoStream, episodes: null },
  { value: "animetsu", name: "Animetsu", posts: VAnimetsuPosts, meta: VAnimetsuMeta, stream: VAnimetsuStream, episodes: null },
  { value: "cinefreak", name: "CineFreak", posts: VCinefreakPosts, meta: VCinefreakMeta, stream: VCinefreakStream, episodes: null },
  { value: "cinemaLuxe", name: "CinemaLuxe", posts: VCinemaLuxePosts, meta: VCinemaLuxeMeta, stream: VCinemaLuxeStream, episodes: VCinemaLuxeEpisodes },
  { value: "dooflix", name: "Dooflix", posts: VDooflixPosts, meta: VDooflixMeta, stream: VDooflixStream, episodes: null },
  { value: "filmyfly", name: "FilmyFly", posts: VFilmyflyPosts, meta: VFilmyflyMeta, stream: VFilmyflyStream, episodes: VFilmyflyEpisodes },
  { value: "flixhq", name: "FlixHQ", posts: VFlixhqPosts, meta: VFlixhqMeta, stream: VFlixhqStream, episodes: null },
  { value: "gokuHD", name: "GokuHD", posts: VGokuHDPosts, meta: VGokuHDMeta, stream: VGokuHDStream, episodes: VGokuHDEpisodes },
  { value: "hiAnime", name: "HiAnime", posts: VHiAnimePosts, meta: VHiAnimeMeta, stream: VHiAnimeStream, episodes: null },
  { value: "kickAssAnime", name: "KickAssAnime", posts: VKickAssAnimePosts, meta: VKickAssAnimeMeta, stream: VKickAssAnimeStream, episodes: null },
  { value: "kissKh", name: "KissKh", posts: VKissKhPosts, meta: VKissKhMeta, stream: VKissKhStream, episodes: null },
  { value: "kmMovies", name: "KmMovies", posts: VKmMoviesPosts, meta: VKmMoviesMeta, stream: VKmMoviesStream, episodes: VKmMoviesEpisodes },
  { value: "mkvDrama", name: "MKVDrama", posts: VMkvDramaPosts, meta: VMkvDramaMeta, stream: VMkvDramaStream, episodes: VMkvDramaEpisodes },
  { value: "mod", name: "MoviesMod", posts: VModPosts, meta: VModMeta, stream: VModStream, episodes: VModEpisodes },
  { value: "movieBox", name: "MovieBox App", posts: VMovieBoxPosts, meta: VMovieBoxMeta, stream: VMovieBoxStream, episodes: VMovieBoxEpisodes },
  { value: "netflixMirror", name: "NetflixMirror", posts: VNetflixMirrorPosts, meta: VNetflixMirrorMeta, stream: VNetflixMirrorStream, episodes: VNetflixMirrorEpisodes },
  { value: "ogomovies", name: "Ogomovies", posts: VOgomoviesPosts, meta: VOgomoviesMeta, stream: VOgomoviesStream, episodes: null },
  { value: "primeMirror", name: "PrimeMirror", posts: VPrimeMirrorPosts, meta: VPrimeMirrorMeta, stream: VPrimeMirrorStream, episodes: VPrimeMirrorEpisodes },
  { value: "primewire", name: "Primewire", posts: VPrimewirePosts, meta: VPrimewireMeta, stream: VPrimewireStream, episodes: null },
  { value: "skyMovieHD", name: "SkyMovieHD", posts: VSkyMovieHDPosts, meta: VSkyMovieHDMeta, stream: VSkyMovieHDStream, episodes: VSkyMovieHDEpisodes },
  { value: "tokyoInsider", name: "TokyoInsider", posts: VTokyoInsiderPosts, meta: VTokyoInsiderMeta, stream: VTokyoInsiderStream, episodes: null },
  { value: "uhd", name: "UHDMovies", posts: VUhdPosts, meta: VUhdMeta, stream: VUhdStream, episodes: null },
  { value: "uniquestream", name: "AnimeStream", posts: VUniquestreamPosts, meta: VUniquestreamMeta, stream: VUniquestreamStream, episodes: VUniquestreamEpisodes },
  { value: "vadapav", name: "VadaPav", posts: VVadapavPosts, meta: VVadapavMeta, stream: VVadapavStream, episodes: VVadapavEpisodes },
  { value: "1cinevood", name: "Cinewood", posts: V1cinevoodPosts, meta: V1cinevoodMeta, stream: V1cinevoodStream, episodes: V1cinevoodEpisodes },
  { value: "4khdhub", name: "4khdHub", posts: V4khdhubPosts, meta: V4khdhubMeta, stream: V4khdhubStream, episodes: null },
  { value: "hdhub4u", name: "HdHub4u", posts: VHdhub4uPosts, meta: VHdhub4uMeta, stream: VHdhub4uStream, episodes: null },
  { value: "moviezwap", name: "MoviezWap", posts: VMoviezwapPosts, meta: VMoviezwapMeta, stream: VMoviezwapStream, episodes: VMoviezwapEpisodes },
];

export const VEGA_PROVIDER_VALUES = PROVIDERS.map((p) => p.value);
export const VEGA_PROVIDER_COUNT = PROVIDERS.length;

/* ---- axios-compatible shim on fetch ---- */
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

/* per-provider context: relative urls resolve against the provider's
 * own origin, captured from its first absolute request (the search).
 * budget caps total fetches per request (Cloudflare free tier allows
 * ~50 subrequests per invocation; exhausting it throws a tagged error
 * so the route can retry that provider on the NEXT request) */
type OriginRef = { base: string | null };
type Budget = { left: number };
const makeContext = (origin: OriginRef, budget: Budget) => {
  const resolve = (url: string): string => {
    if (/^https?:/i.test(url)) return url;
    if (url.startsWith("//")) return "https:" + url;
    if (origin.base) {
      try { return new URL(url, origin.base).toString(); } catch { return url; }
    }
    return url;
  };
  const doReq = async (url: string, config: any = {}) => {
    if (budget.left <= 0) {
      const err: any = new Error("subrequest budget exceeded");
      err.__budget = true;
      throw err;
    }
    budget.left--;
    const u = resolve(url);
    const res = await doRequest(u, config);
    if (!origin.base) {
      try { origin.base = new URL(u).origin; } catch {}
    }
    return res;
  };
  const ax: any = (u: string, c?: any) => doReq(u, c);
  ax.get = (u: string, c?: any) => doReq(u, c);
  ax.post = (u: string, d?: any, c?: any) => doReq(u, { ...(c || {}), method: "POST", data: d });
  ax.head = (u: string, c?: any) => doReq(u, { ...(c || {}), method: "HEAD" });
  return { axios: ax, cheerio, commonHeaders: COMMON_HEADERS, kvStore: memoryKV() };
};

const norm = (x: string) => (x ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/* match the POST the site made for THIS title: these sites format
 * posts as "<Name> (Year) quality..." so the post title should START
 * with the movie name; fallback = every word present + exact year
 * (kills near-misses like "Raat Jawan Hai" for the movie "Jawan") */
function postMatches(title: string, wantTitle: string, year: number): boolean {
  const t = norm(String(title || "").replace(/^download\s+/i, ""));
  const want = norm(wantTitle);
  if (!t || !want) return false;
  const years = (String(title).match(/\b(19|20)\d{2}\b/g) ?? []).map(Number);
  const yearOk = (exact: boolean) =>
    !year || !years.length || years.some((y) => (exact ? y === year : Math.abs(y - year) <= 1));
  if (t.startsWith(want) && yearOk(false)) return true;
  const tokens = want.split(" ").filter((w) => w.length > 3);
  if (!tokens.length || !years.length) return false;
  return tokens.every((tk) => t.includes(tk)) && yearOk(true);
}

const absolutize = (link: string, origin: OriginRef): string => {
  if (link?.startsWith("//")) return "https:" + link;
  if (!link || /^https?:/i.test(link) || !origin.base) return link;
  try { return new URL(link, origin.base).toString(); } catch { return link; }
};

/* hosts that 403 Cloudflare-worker egress (WSMBG lesson) - skipped on
 * the deployed site, kept for the desktop exe (user IP works) */
const SITE_DEAD_HOSTS = /hubcloud\.|zcloud\.|gdflix/i;
/* cheap extractors first: direct-ish hosts = 1-2 subrequests, gofile
 * needs 3-4 (wt.obf + account + contents + link) */
const hostCost = (link: string): number =>
  /pixeldrain|fastdl|drive\.google|gd\.|1fichier|mega\.nz|mediafire|cfile/i.test(link) ? 0 :
  /gofile/i.test(link) ? 1 : 2;
const siteSkip = (link: string | null | undefined, siteMode: boolean): boolean =>
  !!siteMode && !!link && SITE_DEAD_HOSTS.test(link);

/* returns { link } on success; { skippedAll: true } when every
 * candidate host is site-dead (counts as done, not a retry) */
async function resolveEpisodeLink(
  m: ProviderMod, link: string, season: number, episode: number,
  signal: AbortSignal, origin: OriginRef, budget: Budget, siteMode: boolean
): Promise<{ link: string } | { skippedAll: true } | null> {
  if (!m.meta) return null;
  const info = await m.meta.getMeta({ link: absolutize(link, origin), providerContext: makeContext(origin, budget), signal });
  const seasons = info?.linkList ?? [];
  if (!seasons.length) return null;
  const sNum = new RegExp("(^|[^0-9])0*" + season + "([^0-9]|$)", "i");
  const sEntry =
    seasons.find((s: any) => sNum.test(s?.title ?? "")) ??
    seasons.find((s: any) => /all|every|complete/i.test(s?.title ?? "")) ??
    seasons[0];
  if (!sEntry) return null;
  if (Array.isArray(sEntry.directLinks) && sEntry.directLinks.length) {
    const cands = sEntry.directLinks.filter((x: any) => episodeNum(x?.title) === episode);
    const pool = cands.length ? cands : sEntry.directLinks;
    const ok = pool.find((x: any) => x?.link && !siteSkip(x.link, siteMode));
    if (ok) return { link: absolutize(ok.link, origin) };
    return pool.some((x: any) => x?.link) ? { skippedAll: true } : null;
  }
  if (sEntry.episodesLink && m.episodes?.getEpisodes) {
    const eps = await m.episodes.getEpisodes({ url: absolutize(sEntry.episodesLink, origin), providerContext: makeContext(origin, budget), signal });
    const cands = (eps ?? []).filter((x: any) => episodeNum(x?.title) === episode);
    const pool = cands.length ? cands : (eps ?? []);
    const ok = pool.find((x: any) => x?.link && !siteSkip(x.link, siteMode));
    if (ok) return { link: absolutize(ok.link, origin) };
    return pool.some((x: any) => x?.link) ? { skippedAll: true } : null;
  }
  return null;
}

const episodeNum = (title: string | null | undefined): number | null => {
  const m = String(title ?? "").match(/(?:^|[^0-9])0*(\d{1,3})(?:[^0-9]|$)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  return n >= 1 && n <= 500 ? n : null;
};

export type VegaMeta = { title: string; year: number };

export type VegaOpts = { siteMode?: boolean; maxFetches?: number };

/* run the engine for a SUBSET of providers (batching keeps us under
 * the Cloudflare free-tier 50-subrequests-per-invocation limit; the
 * desktop exe's local server has no such limit and runs "all") */
export async function listAll(
  meta: VegaMeta,
  type: "movie" | "tv",
  season?: number,
  episode?: number,
  only?: string[],
  dbg?: VegaDebug[],
  opts?: VegaOpts
): Promise<VegaChip[]> {
  const signal = AbortSignal.timeout(24000);
  const siteMode = !!opts?.siteMode;
  const budget: Budget = { left: opts?.maxFetches ?? 2000 };
  const mods = only ? PROVIDERS.filter((p) => only.includes(p.value)) : PROVIDERS;
  const jobs = mods.map(async (m): Promise<VegaChip[]> => {
    const d: VegaDebug = { provider: m.value, posts: 0, titles: [], matched: null, chips: 0, err: null };
    dbg?.push(d);
    const origin: OriginRef = { base: null };
    try {
      const posts = await m.posts.getSearchPosts({
        searchQuery: meta.title, page: 1, providerValue: m.value, signal, providerContext: makeContext(origin, budget),
      });
      const clean = (posts ?? []).filter((p: any) => p?.link && p?.title);
      d.posts = clean.length;
      d.titles = clean.slice(0, 3).map((p: any) => String(p.title).slice(0, 60));
      const hit = clean.find((p: any) => postMatches(p.title, meta.title, meta.year));
      d.matched = hit?.title ?? null;
      if (!hit) return [];
      let streamErr: string | null = null;
      const runStream = async (rawLink: string): Promise<any[]> => {
        const link = absolutize(rawLink, origin);
        try {
          const streams = await m.stream.getStream({
            link, type: type === "tv" ? "series" : "movie", signal,
            providerContext: makeContext(origin, budget), isDownload: false,
          });
          return (streams ?? []).filter((x: any) => x?.link);
        } catch (e: any) {
          if (e?.__budget) { d.budget = true; throw e; }
          streamErr = streamErr ?? String(e?.message ?? e).slice(0, 120);
          return [];
        }
      };
      const toChips = (raw: any[]): VegaChip[] =>
        raw
          .map((s: any) => {
            let url: string = s?.link ?? "";
            if (url.startsWith("//")) url = "https:" + url;
            if (url && !/^https?:/i.test(url) && origin.base) {
              try { url = new URL(url, origin.base).toString(); } catch {}
            }
            return { s, url };
          })
          .filter((x: any) => x.url && /^https?:/i.test(x.url) && x.s)
          .map((x: any) => ({
            provider: m.value, server: x.s.server ?? m.name, link: x.url, type: x.s.type ?? "",
            quality: x.s.quality || (typeof x.s.title === "string" ? (x.s.title.match(/480|720|1080|2160|4k/i)?.[0] ?? "") : ""),
            title: hit.title, headers: x.s.headers, subtitles: x.s.subtitles,
          }));

      let chips: VegaChip[] = [];
      if (type === "tv") {
        const ep = await resolveEpisodeLink(m, hit.link, season ?? 1, episode ?? 1, signal, origin, budget, siteMode);
        if (!ep) { d.err = "episode not resolved"; return []; }
        if ("skippedAll" in ep) { d.err = "site-skip"; return []; }
        chips = toChips(await runStream(ep.link));
      } else {
        /* linkList-style: post page -> quality entries -> host links.
         * Take up to 2 hosts per quality entry (max 3 entries, cap 4
         * targets) - each host extraction costs several subrequests */
        let entries: any[] = [];
        if (m.meta) {
          try {
            const info = await m.meta.getMeta({ link: absolutize(hit.link, origin), providerContext: makeContext(origin, budget), signal });
            entries = (info?.linkList ?? []).filter((e: any) => e);
          } catch { entries = []; }
        }
        const targets: string[] = [];
        let skippedHosts = 0;
        if (entries.length) {
          for (const e of entries.slice(0, 3)) {
            const dls = Array.isArray(e.directLinks) ? e.directLinks : [];
            if (dls.length) {
              /* one host per quality entry, cheapest extractor first */
              const ok = dls
                .filter((dl: any) => dl?.link && !siteSkip(dl.link, siteMode))
                .sort((a: any, b: any) => hostCost(a.link) - hostCost(b.link));
              if (ok.length) targets.push(ok[0].link);
              else skippedHosts++;
            } else if (e.link && !siteSkip(e.link, siteMode)) targets.push(e.link);
            else if (e.link) skippedHosts++;
            if (targets.length >= 3) break;
          }
        }
        if (targets.length) {
          const batches = await Promise.all(targets.map((t) => runStream(t)));
          chips = toChips(batches.flat());
        } else if (skippedHosts && entries.length) {
          /* only hubcloud/zcloud hosts (site-dead) - done, not retried */
          d.err = "site-skip";
          return [];
        } else {
          /* embed-style provider: stream straight off the post page */
          chips = toChips(await runStream(hit.link));
        }
        if (chips.length > 12) chips = chips.slice(0, 12);
      }
      d.chips = chips.length;
      d.err = chips.length ? null : (d.err === "site-skip" ? d.err : streamErr ?? d.err);
      return chips;
    } catch (e: any) {
      if (e?.__budget) d.budget = true;
      d.err = String(e?.message ?? e).slice(0, 140);
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
