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

P = "src/lib/player.ts"
S = "src/app/api/netmirror/stream/[kind]/[id]/route.ts"
B = "src/app/api/netmirror/sub/route.ts"
N = "src/app/api/netmirror/native/[kind]/[id]/route.ts"
L = "src/app/api/netmirror/hls/route.ts"
W = "src/app/watch/[type]/[id]/page.tsx"
H = "src/components/HindiSources.tsx"
E = "src/app/api/desiddl/embed/route.ts"
K = "desktop/index.js"
D = "docs/netmirror.md"

# player.ts header + entries (true pills: netmirror 10, free embeds 12-20, netembed 21, netnative 22)
rep(P, " *  - NetMirror Direct (Server 22, vlcOnly): SAME HindiSources lane as\n *    Server 19 (API-resolved",
    " *  - NetMirror Direct (Server 21, vlcOnly): SAME HindiSources lane as\n *    Server 10 (API-resolved")
rep(P, " *  - NetMirror Playlists (Server 23, vlcOnly)",
    " *  - NetMirror Playlists (Server 22, vlcOnly)")
rep(P, " *  - Servers 10-18 (free embed APIs", " *  - Servers 12-20 (free embed APIs")
rep(P, " *  - NetMirror (Server 19, vlcOnly Hindi-OTT lane)", " *  - NetMirror (Server 10, vlcOnly Hindi-OTT lane)")
rep(P, "/* Server 19 - NetMirror (vlcOnly Hindi-OTT lane", "/* Server 10 - NetMirror (vlcOnly Hindi-OTT lane")
rep(P, "/* Servers 10-18 - free TMDB-keyed embed APIs", "/* Servers 12-20 - free TMDB-keyed embed APIs")
rep(P, "/* Server 22 - NetMirror Direct (vlcOnly", "/* Server 21 - NetMirror Direct (vlcOnly")
rep(P, "     * Server 19: API-resolved signed mp4s", "     * Server 10: API-resolved signed mp4s")
rep(P, "/* Server 23 - NetMirror Playlists (vlcOnly", "/* Server 22 - NetMirror Playlists (vlcOnly")
rep(P, "     * primary NewTV + net27 fallback are our Server 19 lane)", "     * primary NewTV + net27 fallback are our Server 10 lane)")

# lane comments
rep(S, "/* Server 19 (NetMirror) stream API", "/* Server 10 (NetMirror) stream API")
rep(B, "/* Server 19 subtitle proxy", "/* Server 10 subtitle proxy")
rep(N, "/* Server 23 (NetMirror Playlists)", "/* Server 22 (NetMirror Playlists)")
rep(N, " * Server 19 lane uses the net27 embed-tmdb API", " * Server 10 lane uses the net27 embed-tmdb API")
rep(N, " * this lane honestly empties and Servers 19/22 still stand.", " * this lane honestly empties and Servers 10/21 still stand.")
rep(L, "/* HLS proxy for the native playlist lane (Server 23)", "/* HLS proxy for the native playlist lane (Server 22)")
rep(W, "Servers 19/22 still work.", "Servers 10/21 still work.")
rep(H, "/* Server 19 (NetMirror)", "/* Server 10 (NetMirror)")
rep(E, "?embed=1 site player (Server 22)", "?embed=1 site player (Server 21)")
rep(K, "Servers 10-18 embed APIs", "Servers 12-20 embed APIs")

# docs/netmirror.md renumber
rep(D, "Server 19/22 core", "Server 10/21 core")
rep(D, "19/22 stand", "10/21 stand")
rep(D, "Server 19", "Server 10", expect=3)
rep(D, "Server 22", "Server 21", expect=5)
rep(D, "Server 23", "Server 22", expect=4)

# pill-22 friendly error: verify-403 is permanent from our hosting
rep(N, """  } catch (err) {
    const msg = err instanceof Error ? err.message : "native flow failed";
    return NextResponse.json(
      { title, streams: [], captions: [], laneError: `Playlists lane: ${msg}` },
      { headers: { "cache-control": "no-store" } }
    );
  }""",
"""  } catch (err) {
    const msg = err instanceof Error ? err.message : "native flow failed";
    /* verify-403 (IP gating) is the permanent state from our hosting:
     * show a human line, keep the forensics in `diag` (console) */
    const blocked = msg.startsWith("verify trick failed");
    return NextResponse.json(
      {
        title,
        streams: [],
        captions: [],
        laneError: blocked
          ? "NetMirror blocks this flow from our servers - try Server 10 or 21 (same catalog, reachable lane)."
          : `Playlists lane: ${msg}`,
        ...(blocked ? { diag: msg.slice(0, 400) } : {}),
      },
      { headers: { "cache-control": "no-store" } }
    );
  }""")
rep(H, """        if (typeof body.laneError === "string" && body.laneError) {
          if (!alive.current) return;
          setError(body.laneError.slice(0, 160));""",
"""        if (typeof body.laneError === "string" && body.laneError) {
          if (!alive.current) return;
          if (typeof body.diag === "string" && body.diag)
            console.warn("[netmirror]", body.diag.slice(0, 400));
          setError(body.laneError.slice(0, 160));""")

print("ALL EDITS APPLIED")
