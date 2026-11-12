// Opening Dojo service worker: the app keeps working without a connection (trains, tunnels).
//  - pages: network first (so a new deploy shows up), cached copy when offline
//  - built assets, engine, pieces: cache first (file names are versioned or never change)
//  - data (aims, openings, GM ghosts): cached copy at once, refreshed in the background
const CACHE = "dojo-v1";
const CORE = [
  "./",
  "./aims.json",
  "./openings.json",
  "./engine/stockfish-18-lite-single.js",
  "./engine/stockfish-18-lite-single.wasm",
  "./manifest.webmanifest",
  "./apple-touch-icon.png",
  ...["w", "b"].flatMap((c) => ["K", "Q", "R", "B", "N", "P"].map((p) => `./pieces/${c}${p}.svg`)),
];

self.addEventListener("install", (e) => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then((c) => Promise.all(CORE.map((u) => c.add(u).catch(() => undefined)))));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith("dojo-") && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put("./", res.clone());
    return res;
  } catch {
    return (await cache.match("./")) || (await cache.match(req)) || Response.error();
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req, e) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req);
  const fresh = fetch(req)
    .then((res) => {
      if (res.ok) cache.put(req, res.clone());
      return res;
    })
    .catch(() => undefined);
  if (hit) {
    e.waitUntil(fresh);
    return hit;
  }
  return (await fresh) || Response.error();
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // chess.com / Lichess APIs go straight to the network
  if (req.mode === "navigate") return e.respondWith(networkFirst(req));
  if (url.pathname.endsWith(".json")) return e.respondWith(staleWhileRevalidate(req, e));
  e.respondWith(cacheFirst(req));
});
