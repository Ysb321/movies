# Server 11 hub embed — how the in-site browser works

Tap a DesiDDL row → the hub page (V-Cloud / HubCloud / GDFlix / G-Direct)
opens **inside our site**, the user clicks the hub's own Download / FSL /
Generate buttons, and the resulting file **auto-plays in the site player**.
Server-side cracking lost to live bot-walls, so the human drives and the
code just watches — this doc is the map for future work on it.

## Pieces

- `src/app/api/desiddl/embed/route.ts` (edge) — the proxy. Fetches hub
  pages server-side, rewrites them, injects the bootstrap. Same SSRF guard
  as the resolver: entry must be a hub host, every hop https + off
  private IPs + on a hub-ish host.
- `src/components/DdlSources.tsx` — the embed view: sandboxed iframe
  (`allow-scripts allow-same-origin allow-forms`: popups, downloads and
  top-navigation blocked), Back/Reload/address chrome, message listener,
  location poll, paste box, raw-page fallback.

## Message protocol (iframe → parent, `postMessage`)

| type | payload | meaning |
|---|---|---|
| `yetflix-file` | `url` (https) | playable file found → auto-play |
| `yetflix-navigate` | `url` (`/api/desiddl/embed?url=…`) | decoded hub redirect → re-point frame |
| `yetflix-embed-left` | — | frame is leaving (self-corrects if still ours) |
| `yetflix-embed-ready` | — | bootstrap alive → hide loader |
| `yetflix-embed-error` | `message` | proxy failed → offer raw page + paste |

## Capture points (every hub flow ends in ≥1)

1. **Proxy, pre-render** — entry/redirect/`hx-redirect` already a file
   (G-Direct `dl.php?link=`, CDN hrefs, `video/*` responses) → file shell.
2. **Proxy, page-chains** — walks to the button page: meta refresh, vcloud
   double-atob `var url`, hubcloud plain `var url`, `/video/` links,
   HubCloud `/drive/` search results (≤4 hops).
3. **Bootstrap clicks** — anchor clicks / submits / `window.open` checked
   against the file test; hub popups become in-frame proxied navigation.
4. **Bootstrap `__yf_prox`** — every rewritten JS navigation sink goes
   through it: files are reported, hub pages re-proxied, externals pass.
5. **Bootstrap fetch/XHR wraps** — hub API calls stay in-proxy; responses
   <400 KB sniffed for file URLs for 6 s after a user click — this is
   what cracks JS "Generate" buttons (e.g. FAST CLOUD).
6. **Bootstrap atob watch** — decoded `http(s)`/`/video|drive|…` targets
   re-point the frame via `yetflix-navigate`.
7. **Server JS rewrite** — `location.href=` / `replace()` / `assign()` /
   `window.location=` (simple shapes only, reads untouched) wrapped in
   `__yf_prox(...)`.
8. **Parent poll** — iframe location watched for file / `?link=` hops;
   also drives the address line and the left-the-embed notice.
9. **Paste box** — universal backstop, works with the raw page and new tabs.

Rewriting rules: only hub-ish URLs are pulled into the proxy; external
links keep their URL and gain `target=_blank` (site nav/ads can't hijack
the frame); hub `Content-Security-Policy` metas are stripped (they would
kill the bootstrap); file links are never proxied (captured on click).

## Prior art (where the design comes from)

- **testcafe-hammerhead** (`DevExpress/testcafe-hammerhead`) — the core
  idea: a URL-rewriting proxy plus an injected client script, so the page
  "does not know it is under proxy". Rammerhead packages it as a login-
  syncing proxy browser (`Sch00l-Proxy-Hub/RammerHead`, demo
  `demo-opensource.rammerhead.org`, polished `browser.rammerhead.org`).
- **Ultraviolet** (Titanium Network) — service-worker interception proxy
  (`uv.bundle.js`/`uv.sw.js` rewrite in-browser) + bare/wisp server for
  transport. Too heavy for us (needs the bare server + SW scope), but its
  checklist — rewrite JS sinks, wrap fetch/XHR/WebSocket, proxy
  everything same-origin — is exactly what the bootstrap implements.
- Guide that explains UV's moving parts well:
  `crllect/How-to-make-an-ultraviolet-proxy` ("Only use UV inside an
  iFrame" — same conclusion we reached independently).

## Known limits / future work

- External `<script src>` is not rewritten (inline hubs scripts carry the
  flows so far); AST-level JS rewriting à la UV is the eventual fix for
  exotic redirect shapes and string-literal false matches.
- No cookie jar / session sync (Rammerhead's headline feature) — hub
  flows here are token-URL based, so nothing breaks yet; login-walled
  buttons (GDFlix "Login To DL") stay unsupported.
- No WebSocket/EventSource handling (hubs don't use them).
- If the proxy itself is walled, auto-capture degrades to copy-paste
  (raw page in-frame, or new tab for X-Frame-Options hubs).
- Wrong-movie defense lives one layer up: `pickHit` requires every
  significant title word + year, and `verifyPost` re-checks the post's
  own `<title>`/`<h1>` before any rows are built.
