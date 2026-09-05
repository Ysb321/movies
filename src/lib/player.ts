/** VidCore embed (https://vidcore.io) — movie & TV endpoints
 *  movie: https://vidcore.io/movie/{id}
 *  tv:    https://vidcore.io/tv/{id}/{season}/{episode}
 *  optional params: autoPlay, theme, sub, poster, title, startAt, server… */
export function vidcoreUrl(type: "movie" | "tv", id: number | string, s = 1, e = 1) {
  const base =
    type === "movie"
      ? `https://vidcore.io/movie/${id}`
      : `https://vidcore.io/tv/${id}/${s}/${e}`;
  return `${base}?autoPlay=true&theme=E50914`;
}
