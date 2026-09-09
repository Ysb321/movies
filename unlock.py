import sys

def rep(path, old, new, expect=1):
    with open(path) as f:
        s = f.read()
    n = s.count(old)
    if n != expect:
        print(f"ASSERT FAIL {path}: found {n}, expected {expect} for: {old[:90]!r}")
        sys.exit(1)
    with open(path, "w") as f:
        f.write(s.replace(old, new))
    print(f"OK {path}: {old[:60]!r}...")

def span(path, start_mark, end_mark, new_text):
    with open(path) as f:
        s = f.read()
    i = s.find(start_mark)
    j = s.find(end_mark)
    if i < 0 or j < 0 or j < i:
        print(f"ASSERT FAIL {path}: span marks ({start_mark[:40]!r} -> {end_mark[:40]!r})")
        sys.exit(1)
    s = s[:i] + new_text + s[j:]
    with open(path, "w") as f:
        f.write(s)
    print(f"OK {path}: span {start_mark[:40]!r}...")

S = "src/app/api/netmirror/stream/[kind]/[id]/route.ts"
N = "src/app/api/netmirror/native/[kind]/[id]/route.ts"
D = "docs/netmirror.md"

# R1: +mobidetect.click (from the RE report's bundle strings)
rep(S, '  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo=",\n];',
    '  "aHR0cHM6Ly9tb2JpZGV0ZWN0cy54eXo=",\n  "aHR0cHM6Ly9tb2JpZGV0ZWN0LmNsaWNr",\n];')

# R2a: base cache var
rep(S, 'let newTvApi = ""; /* resolved per isolate */',
    "let newTvBases: string[] = []; /* all discovered bases, per isolate */")

# R2b: resolveNewTv -> discoverNewTv (multi-base + cookie harvest)
span(S, "async function resolveNewTv(", "const num = (v: unknown)",
"""const shortHost = (u: string): string => {
  try {
    return new URL(u).hostname.replace(/^www\\./, "");
  } catch {
    return "?";
  }
};

/* discovery: collect up to 3 distinct bases (gating may differ per
 * backend host) + harvest every Set-Cookie checknewtv plants - the
 * verify wall 403s our edge, but this endpoint answers 200 */
async function discoverNewTv(notes?: string[]): Promise<string[]> {
  if (newTvBases.length > 0) {
    notes?.push(`base:cached(${newTvBases.length})`);
    return newTvBases;
  }
  const bases: string[] = [];
  const jar: string[] = [];
  let tried = 0;
  let lastErr = "";
  for (const b64 of NEW_TV_DOMAINS_B64) {
    if (bases.length >= 3) break;
    let domain = "";
    try {
      tried++;
      domain = atob(b64);
      const res = await fetch(`${domain}/checknewtv.php`, {
        headers: newTvHeaders("nf"),
        signal: AbortSignal.timeout(5000),
      });
      for (const c of jarCookies(res.headers)) {
        const k = c.split("=")[0];
        const i = jar.findIndex((x) => x.split("=")[0] === k);
        if (i >= 0) jar[i] = c;
        else jar.push(c);
      }
      const data = await res.json();
      if (data && data.token_hash) {
        const base = atob(data.token_hash).replace(/\\/$/, "");
        if (base && !bases.includes(base)) bases.push(base);
      } else {
        lastErr = `http ${res.status} no-token`;
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message.slice(0, 40) : "err";
    }
  }
  if (bases.length === 0)
    throw new Error(`newtv discovery failed (${tried} domains, last: ${lastErr})`);
  newTvBases = bases;
  newTvJar = jar.join("; ");
  notes?.push(
    `bases:${bases.map(shortHost).join("+")} jar:${jar.map((c) => c.split("=")[0]).join(",") || "none"}`
  );
  return bases;
}

""")

# R3: delete warmNewTv (root-walk 403s - harvest replaces it)
span(S, "async function warmNewTv(", "const newTvHeaders = (ott")
rep(S, """/* warmup: walk the api base root (manual hops, accumulating cookies) so
 * search/post/player carry the session a browser would. The backend
 * 403s bare NewTV calls from edge IPs; the reference client always has
 * ambient cookies, so we mint our own. Cached per isolate. */
let newTvJar = "";""",
    'let newTvJar = ""; /* checknewtv harvest, set by discovery */')

# R3-i/ii: per-base search loop with static cookies
rep(S, """    const api = await resolveNewTv(notes);
    const jar = await warmNewTv(api, notes);""",
"""    const bases = await discoverNewTv(notes);
    const jar = [newTvJar, "hd=on", "ott=nf"].filter(Boolean).join("; ");
    let api = bases[0];""")
rep(S, """    const searchRes = await fetch(`${api}/newtv/search.php?s=${encodeURIComponent(title)}`, {
      headers: newTvHeaders(ott, { Lastep: "", Usertoken: "" }, api, jar),
      signal: AbortSignal.timeout(12000),
    });
    if (!searchRes.ok) {
      notes.push(`${platform}: search http ${searchRes.status}`);
      return [];
    }
    const search = await searchRes.json();""",
"""    /* per-base loop: gating may differ by backend host */
    let search: any = null;
    for (const b of bases) {
      api = b;
      const searchRes = await fetch(`${b}/newtv/search.php?s=${encodeURIComponent(title)}`, {
        headers: newTvHeaders(ott, { Lastep: "", Usertoken: "" }, b, jar),
        signal: AbortSignal.timeout(12000),
      });
      if (searchRes.status === 403) {
        notes.push(`${platform}: ${shortHost(b)} 403`);
        continue;
      }
      if (!searchRes.ok) {
        notes.push(`${platform}: search http ${searchRes.status}`);
        return [];
      }
      search = await searchRes.json();
      break;
    }
    if (!search) return [];""")

# R4: native route harvest-first session (replaces dead warmVerify)
span(N, "/* warmup: GET the verify page first", "async function fetchHashT()",
"""/* harvest-first session: checknewtv.php answers 200 from our edge (the
 * verify page 403s) - if it plants t_hash_t (or any session the mobile
 * surface accepts), the whole native flow unlocks verify-free */
const HARVEST_HOSTS = [
  "https://mobiledetects.com",
  "https://mobidetcts.top",
  "https://mobiledetects.top",
  "https://mobidetect.click",
];
async function harvestSession(): Promise<{ jar: string; names: string; hashT: string }> {
  const jar: string[] = [];
  for (const host of HARVEST_HOSTS) {
    try {
      const res = await fetch(`${host}/checknewtv.php`, {
        headers: { "User-Agent": UA, Accept: "application/json,*/*" },
        signal: AbortSignal.timeout(8000),
      });
      const getter = (
        res.headers as unknown as { getSetCookie?: () => string[] }
      ).getSetCookie;
      const raw: string[] =
        typeof getter === "function"
          ? getter.call(res.headers)
          : [res.headers.get("set-cookie") || ""];
      for (const c of raw) {
        const pair = (c || "").split(";")[0].trim();
        if (!pair.includes("=")) continue;
        const k = pair.split("=")[0];
        const i = jar.findIndex((x) => x.split("=")[0] === k);
        if (i >= 0) jar[i] = pair;
        else jar.push(pair);
      }
      await res.arrayBuffer().catch(() => null);
    } catch {
      /* next host */
    }
  }
  const hashT = (/t_hash_t=([^;]+)/i.exec(jar.join("; ")) || [])[1] || "";
  const names = jar.map((c) => c.split("=")[0]).join(",");
  const full = [...jar];
  if (!full.some((c) => c.startsWith("hd="))) full.push("hd=on");
  if (!full.some((c) => c.startsWith("ott="))) full.push("ott=nf");
  return { jar: full.join("; "), names, hashT };
}

""")
rep(N, "async function fetchHashT(): Promise<{ v: string; diag: string }> {",
    "async function fetchHashT(): Promise<{ v: string; diag: string; jar: string }> {")
rep(N, """  const w = await warmVerify();
  const a = await attempt("manual", w.jar);
  if (a.v) return { v: a.v, diag: `${w.d} | ${a.d}` };
  const b = await attempt("follow", w.jar);
  return { v: b.v, diag: `${w.d} | ${a.d} | ${b.d}` };""",
"""  const h = await harvestSession();
  const pre = `harvest:ck=${h.names || "none"}`;
  if (h.hashT) return { v: h.hashT, diag: `${pre} (hit)`, jar: h.jar };
  const a = await attempt("manual", h.jar);
  if (a.v)
    return { v: a.v, diag: `${pre} | ${a.d}`, jar: `t_hash_t=${a.v}; hd=on; ott=nf` };
  const b = await attempt("follow", h.jar);
  if (b.v)
    return {
      v: b.v,
      diag: `${pre} | ${a.d} | ${b.d}`,
      jar: `t_hash_t=${b.v}; hd=on; ott=nf`,
    };
  return { v: "", diag: `${pre} | ${a.d} | ${b.d}`, jar: h.jar };""")
rep(N, """    const { v: hashT, diag: hashDiag } = await fetchHashT();
    if (!hashT) throw new Error(`verify trick failed (${hashDiag})`);
    const jar = `t_hash_t=${hashT}; hd=on; ott=nf`;""",
"""    const { diag: hashDiag, jar } = await fetchHashT();
    /* proceed with whatever session exists - a hashT-less jar still gets
     * one attempt; refused stages throw with the session diag attached */
    if (!jar) throw new Error(`verify trick failed (${hashDiag})`);""")
rep(N, "    const results: Array<{ id?: string; t?: string }> = Array.isArray(",
"""    /* sessionless search degrades to Top Searches - never resolve a title
     * against that (wrong-movie rows); fail loudly instead */
    if (search && search.head === "Top Searches")
      throw new Error(`search refused (top-searches fallback) [${hashDiag}]`);
    const results: Array<{ id?: string; t?: string }> = Array.isArray(""")
rep(N, """    const postTitle: string =
      typeof post?.title === "string" && post.title ? post.title : title;""",
"""    if (post && typeof post.error === "string" && post.error)
      throw new Error(`post refused (${post.error.slice(0, 60)}) [${hashDiag}]`);
    const postTitle: string =
      typeof post?.title === "string" && post.title ? post.title : title;""")

with open(D) as f:
    s = f.read()
s += """
## Site recon: where the embed comes from (2026-09-09)

Full scrape: netmirror.center is a React SPA (Vite bundle
index-a4f9aaa1.js, ~22 chunks, mostly vendor - not worth mining
blind). SSR shells only; player loads via JS. The site HAS titles
net27 lacks (Spider-Man BND [Hindi] trends on the homepage) while
their movie/969681 page 500s for datacenter clients - so the site's
embed is NOT (only) net27. Evidence points at the NATIVE flow
(play.php -> playlist.php pv/hls HLS + subscdn subs): the mobile
catalog shape matches the site (Hindi dubs + Hollywood), and the
user-captured playlist sample is that exact format. Mobile search
works bare but degrades to Top Searches; post.php answers bare with
`Invalid User` - session is mandatory past search. Unlock attempt:
multi-base NewTV search (gating may differ per backend host),
checknewtv cookie harvest (+mobidetect.click discovery domain from
the app RE report), static hd/ott cookies, and refusal guards that
fail loudly instead of resolving wrong titles. netmirror.app is only
an APK landing page (no API); net22/net20 serve nothing; urlscan
results + OTX passive_dns are auth-walled.
"""
with open(D, "w") as f:
    f.write(s)
print("OK docs/netmirror.md: appended")
print("ALL EDITS APPLIED")
