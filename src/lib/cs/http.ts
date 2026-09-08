/* Shared HTTP helpers for the CloudStream-port providers.
 * Every request goes through a budget (Cloudflare free tier allows
 * ~50 subrequests per invocation); exhausting it throws a tagged
 * error so the API route can retry that provider on a later request. */

export type Budget = { left: number };

export class BudgetError extends Error {
  constructor() {
    super("subrequest budget exceeded");
    (this as any).__budget = true;
  }
}

export const COMMON_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
  "sec-ch-ua-mobile": "?0",
  "sec-ch-ua-platform": '"Windows"',
  "Upgrade-Insecure-Requests": "1",
};

export async function rawGet(
  url: string,
  budget: Budget,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<string> {
  if (budget.left <= 0) throw new BudgetError();
  budget.left--;
  const res = await fetch(url, {
    headers: { ...COMMON_HEADERS, ...(opts.headers ?? {}) },
    redirect: "follow",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
  });
  if (res.status < 200 || res.status >= 400) {
    throw new Error(`HTTP ${res.status} ${res.statusText} | ${url.slice(0, 90)}`);
  }
  const text = await res.text();
  /* Cloudflare "checking browser" pages come back 200 but empty of
   * content - treat as an error so the provider is retried, not
   * silently marked done-with-no-results */
  if (
    text.length < 6000 &&
    /just a moment|challenge-platform|cf-browser-verification|_cf_chl/i.test(text)
  ) {
    throw new Error(`CF challenge | ${new URL(url).hostname}`);
  }
  return text;
}

export async function rawGetJson<T = any>(
  url: string,
  budget: Budget,
  opts: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<T> {
  return JSON.parse(await rawGet(url, budget, opts)) as T;
}

/* HEAD redirect chain (max 7 hops) - the "Server : 10Gbps" cards use
 * shortener chains that end at the direct file */
export async function headFinalUrl(
  url: string,
  budget: Budget
): Promise<string | null> {
  let current = url;
  for (let i = 0; i < 7; i++) {
    if (budget.left <= 0) throw new BudgetError();
    budget.left--;
    let res: Response;
    try {
      res = await fetch(current, {
        method: "HEAD",
        redirect: "manual",
        headers: COMMON_HEADERS,
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return null;
    }
    const loc = res.headers.get("location");
    if (!loc) return current;
    current = new URL(loc, current).toString();
  }
  return current;
}

/* one-shot redirect peek (BuzzServer hx-redirect header) */
export async function buzzRedirect(
  url: string,
  budget: Budget
): Promise<string | null> {
  if (budget.left <= 0) throw new BudgetError();
  budget.left--;
  try {
    const res = await fetch(`${url}/download`, {
      redirect: "manual",
      headers: { ...COMMON_HEADERS, Referer: url },
      signal: AbortSignal.timeout(8000),
    });
    const hx = res.headers.get("hx-redirect");
    if (hx) return new URL(hx, url).toString();
    return null;
  } catch {
    return null;
  }
}

/* the CSX (magix) providers auto-update their domains via this map */
let urlsCache: { at: number; map: Record<string, string> } | null = null;
export async function csxUrls(budget: Budget): Promise<Record<string, string>> {
  if (urlsCache && Date.now() - urlsCache.at < 30 * 60 * 1000) return urlsCache.map;
  try {
    const map = await rawGetJson<Record<string, string>>(
      "https://raw.githubusercontent.com/SaurabhKaperwan/Utils/refs/heads/main/urls.json",
      budget,
      { timeoutMs: 7000 }
    );
    urlsCache = { at: Date.now(), map: map ?? {} };
    return map;
  } catch {
    return {};
  }
}

export const absolutize = (link: string | null | undefined, base: string): string => {
  if (!link) return "";
  if (/^https?:/i.test(link)) return link;
  if (link.startsWith("//")) return "https:" + link;
  try {
    return new URL(link, base).toString();
  } catch {
    return link;
  }
};

/* try candidate base urls in order with a cheap probe (search call) -
 * these sites rotate domains constantly */
export async function firstAliveBase(
  bases: string[],
  probe: (base: string) => Promise<boolean>
): Promise<string | null> {
  for (const b of bases) {
    try {
      if (await probe(b)) return b;
    } catch {
      /* next */
    }
  }
  return null;
}
