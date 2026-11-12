// Offline: the service worker (public/sw.js) caches what has been used. This saves the rest
// (every GM ghost file, the puzzle data, the engine) in one go, so the app works in a tunnel.
import { BASE } from "./asset";
import { GHOST_PLAYERS } from "./ghosts";

const CACHE = "dojo-v1";
export const offlineFiles = () => [
  `${BASE}aims.json`,
  `${BASE}openings.json`,
  `${BASE}engine/stockfish-18-lite-single.js`,
  `${BASE}engine/stockfish-18-lite-single.wasm`,
  ...GHOST_PLAYERS.map((p) => `${BASE}ghosts/${p.id}.json`),
];

export const offlineSupported = () => typeof caches !== "undefined" && "serviceWorker" in navigator;
export const swActive = async () => !!(await navigator.serviceWorker?.getRegistration?.(BASE))?.active;

/** How many of the offline files are already cached. */
export async function offlineStatus(): Promise<{ have: number; total: number }> {
  const files = offlineFiles();
  if (typeof caches === "undefined") return { have: 0, total: files.length };
  const c = await caches.open(CACHE);
  let have = 0;
  for (const f of files) if (await c.match(f)) have++;
  return { have, total: files.length };
}

/** Put every offline file in the cache (directly, so it works even before the worker takes control). */
export async function saveOffline(onProgress: (k: number, n: number) => void, force = false) {
  const files = offlineFiles();
  const c = await caches.open(CACHE);
  let k = 0;
  for (const f of files) {
    if (force || !(await c.match(f))) {
      const res = await fetch(f, { cache: "reload" });
      if (!res.ok) throw new Error(`${f} を取得できませんでした（${res.status}）`);
      await c.put(f, res);
    }
    onProgress(++k, files.length);
  }
}
