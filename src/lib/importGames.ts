// Bring the user's own games in: chess.com / Lichess public APIs, or pasted PGN.
import type { GameInput } from "./style";

export interface Imported extends GameInput {
  id: string; // stable per game, so the same game is never counted twice
  t: number; // when it was played (ms)
  speed?: string;
}

/** Short stable hash for games that come without an id (pasted PGN). */
function hashOf(text: string) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
export type Speed = "all" | "blitz+" | "rapid+";
const speedOk = (speed: string | undefined, want: Speed) =>
  want === "all" || !speed || (want === "blitz+" ? !/bullet|ultra/i.test(speed) : /rapid|classical|daily|correspondence/i.test(speed));

/** SAN tokens from PGN movetext (comments, variations, move numbers, NAGs and the result removed). */
export function sanTokens(text: string): string[] {
  let t = text.replace(/\{[^}]*\}/g, " ").replace(/;[^\n]*/g, " ");
  while (/\([^()]*\)/.test(t)) t = t.replace(/\([^()]*\)/g, " ");
  return t
    .replace(/\$\d+/g, " ")
    .replace(/\d+\.+/g, " ")
    .split(/\s+/)
    .filter((x) => x && !/^(1-0|0-1|1\/2-1\/2|\*)$/.test(x))
    .map((x) => x.replace(/[!?]+$/, ""));
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** `since` (ms): only games played after that moment — used to add just the new ones. */
export async function fromLichess(user: string, max: number, speed: Speed, since?: number): Promise<Imported[]> {
  const perf = speed === "all" ? "ultraBullet,bullet,blitz,rapid,classical,correspondence" : speed === "blitz+" ? "blitz,rapid,classical,correspondence" : "rapid,classical,correspondence";
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=${max}&perfType=${perf}&moves=true${since ? `&since=${since + 1}` : ""}`, { headers: { Accept: "application/x-ndjson" } });
  if (res.status === 404) throw new Error("Lichess にそのユーザー名が見つかりません。");
  if (!res.ok) throw new Error(`Lichess から取得できませんでした（${res.status}）。少し待ってからもう一度。`);
  const out: Imported[] = [];
  for (const line of (await res.text()).split("\n")) {
    if (!line.trim()) continue;
    let g;
    try {
      g = JSON.parse(line);
    } catch {
      continue;
    }
    if (g.variant !== "standard" || !g.moves) continue;
    const white = g.players?.white?.user?.name ?? "", black = g.players?.black?.user?.name ?? "";
    const color = same(white, user) ? "w" : same(black, user) ? "b" : null;
    if (!color) continue;
    const result = g.winner === "white" ? "1-0" : g.winner === "black" ? "0-1" : "1/2-1/2";
    const lost = (result === "1-0") !== (color === "w") && result !== "1/2-1/2";
    out.push({ id: `li:${g.id}`, t: g.createdAt ?? Date.now(), moves: g.moves.split(" "), color, result, timeLoss: lost && g.status === "outoftime", speed: g.speed });
  }
  return out;
}

/**
 * `since` (ms) + `known` ids: when updating, take only games played after the newest stored one.
 * (A game that is merely missing from the store but older than that is NOT new — it was outside the first fetch.)
 */
export async function fromChessCom(user: string, max: number, speed: Speed, onProgress?: (n: number) => void, known?: Set<string>, since?: number): Promise<Imported[]> {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.trim().toLowerCase())}`;
  const arc = await fetch(`${base}/games/archives`);
  if (arc.status === 404) throw new Error("chess.com にそのユーザー名が見つかりません。");
  if (!arc.ok) throw new Error(`chess.com から取得できませんでした（${arc.status}）。少し待ってからもう一度。`);
  const months: string[] = (await arc.json()).archives ?? [];
  const out: Imported[] = [];
  // newest month first, newest game first, until we have enough (at most 24 months back)
  for (const url of months.reverse().slice(0, 24)) {
    const res = await fetch(url);
    if (!res.ok) continue;
    const games: any[] = (await res.json()).games ?? [];
    let caughtUp = false;
    for (const g of games.reverse()) {
      const id = `cc:${g.uuid ?? g.url}`;
      const played = (g.end_time ?? 0) * 1000;
      if (since && played && played < since) {
        caughtUp = true; // everything from here on is older than what is stored
        break;
      }
      if (known?.has(id)) continue;
      if (g.rules !== "chess" || !g.pgn || !speedOk(g.time_class, speed)) continue;
      const color = same(g.white?.username ?? "", user) ? "w" : same(g.black?.username ?? "", user) ? "b" : null;
      if (!color) continue;
      const result = g.white?.result === "win" ? "1-0" : g.black?.result === "win" ? "0-1" : "1/2-1/2";
      const mine = color === "w" ? g.white : g.black;
      const body = String(g.pgn).split(/\n\s*\n/).slice(1).join(" ");
      out.push({ id, t: (g.end_time ?? 0) * 1000 || Date.now(), moves: sanTokens(body), color, result, timeLoss: mine?.result === "timeout", speed: g.time_class });
      if (out.length >= max) break;
    }
    onProgress?.(out.length);
    if (out.length >= max) break;
    if (caughtUp) break;
  }
  return out;
}

/** Pasted PGN (one or many games). `me` = the player's name as written in the White/Black tags. */
export function fromPgn(text: string, me?: string): { games: Imported[]; name: string } {
  const chunks = text.replace(/\r/g, "").split(/\n(?=\[Event )/).filter((c) => c.trim());
  const tag = (g: string, t: string) => g.match(new RegExp(`\\[${t} "([^"]*)"\\]`))?.[1] ?? "";
  let name = me?.trim() ?? "";
  if (!name) {
    const freq = new Map<string, number>();
    for (const g of chunks) for (const t of ["White", "Black"]) if (tag(g, t)) freq.set(tag(g, t), (freq.get(tag(g, t)) ?? 0) + 1);
    name = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  }
  const games: Imported[] = [];
  for (const g of chunks) {
    const result = tag(g, "Result");
    if (result !== "1-0" && result !== "0-1" && result !== "1/2-1/2") continue;
    if (/\[(FEN|SetUp) /.test(g)) continue;
    const white = tag(g, "White"), black = tag(g, "Black");
    const color = name && same(white, name) ? "w" : name && same(black, name) ? "b" : !white && !black ? "w" : null;
    if (!color) continue;
    const body = g.split("\n").filter((l) => !l.startsWith("[")).join(" ");
    const lost = (result === "1-0") !== (color === "w") && result !== "1/2-1/2";
    const moves = sanTokens(body);
    const date = Date.parse((tag(g, "UTCDate") || tag(g, "Date")).replace(/\./g, "-"));
    games.push({ id: `pgn:${hashOf(moves.join(" "))}`, t: Number.isFinite(date) ? date : Date.now(), moves, color, result, timeLoss: lost && /time/i.test(tag(g, "Termination")) });
  }
  return { games, name };
}
