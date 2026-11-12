// GM "ghosts": what past masters actually played in this exact position.
// Data is built by scripts/build-ghosts.ts into public/ghosts/<id>.json and loaded on demand.
import { Chess } from "chess.js";
import { BASE } from "./asset.ts";
import { INDEX_PLIES, posHash } from "./poshash.ts";

export const GHOST_PLAYERS = [
  { id: "fischer", ja: "フィッシャー", flag: "🇺🇸" },
  { id: "kasparov", ja: "カスパロフ", flag: "🇷🇺" },
  { id: "carlsen", ja: "カールセン", flag: "🇳🇴" },
  { id: "capablanca", ja: "カパブランカ", flag: "🇨🇺" },
  { id: "morphy", ja: "モーフィー", flag: "🇺🇸" },
  { id: "tal", ja: "タリ", flag: "🇱🇻" },
  { id: "karpov", ja: "カルポフ", flag: "🇷🇺" },
  { id: "alekhine", ja: "アレヒン", flag: "🇫🇷" },
  { id: "petrosian", ja: "ペトロシアン", flag: "🇦🇲" },
] as const;
export const jaName = (id: string) => GHOST_PLAYERS.find((p) => p.id === id)?.ja ?? id;

// [white, black, year, event, result, moves, gmColor]
type Row = [string, string, number, string, string, string, "w" | "b"];
interface PlayerData {
  id: string;
  gm: string;
  games: Row[];
  idx: Record<string, number[]>;
  split: (string[] | undefined)[];
  replay: Map<number, Map<string, number>>;
}
const data = new Map<string, PlayerData>();
const pending = new Map<string, Promise<boolean>>();

export function loadGhost(id: string): Promise<boolean> {
  if (data.has(id)) return Promise.resolve(true);
  let p = pending.get(id);
  if (!p) {
    p = fetch(`${BASE}ghosts/${id}.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((j) => {
        data.set(id, { ...j, split: [], replay: new Map() });
        return true;
      })
      .catch(() => false); // data not built: the app simply has no ghosts for this player
    pending.set(id, p);
  }
  return p;
}
export const ghostLoaded = (id: string) => data.has(id);
export const ghostGameCount = (id: string) => data.get(id)?.games.length ?? 0;

export interface GameRef {
  player: string;
  game: number;
}
export interface GameInfo extends GameRef {
  white: string;
  black: string;
  year: number;
  event: string;
  result: string;
  moves: string[];
  gmColor: "w" | "b";
  opponent: string;
  /** ○ win / ● loss / △ draw, from the GM's side */
  outcome: "○" | "●" | "△";
}

function movesOf(pd: PlayerData, g: number) {
  return (pd.split[g] ??= pd.games[g][5].split(" "));
}

export function gameInfo(ref: GameRef): GameInfo | undefined {
  const pd = data.get(ref.player);
  const row = pd?.games[ref.game];
  if (!pd || !row) return undefined;
  const [white, black, year, event, result, , gmColor] = row;
  const gmWon = (result === "1-0" && gmColor === "w") || (result === "0-1" && gmColor === "b");
  return {
    ...ref, white, black, year, event, result, gmColor,
    moves: movesOf(pd, ref.game),
    opponent: (gmColor === "w" ? black : white).split(",")[0],
    outcome: result === "1/2-1/2" ? "△" : gmWon ? "○" : "●",
  };
}

/** position hash → ply, for one whole game (replayed once, then cached). */
function replayMap(pd: PlayerData, g: number) {
  let m = pd.replay.get(g);
  if (m) return m;
  m = new Map();
  const c = new Chess();
  const ms = movesOf(pd, g);
  for (let i = 0; i < ms.length; i++) {
    const h = posHash(c.fen());
    if (!m.has(h)) m.set(h, i);
    try {
      c.move(ms[i]);
    } catch {
      break;
    }
  }
  const end = posHash(c.fen());
  if (!m.has(end)) m.set(end, ms.length); // final position: in the game, nothing left to play
  pd.replay.set(g, m);
  return m;
}

/** Which ply of this game has exactly this position (undefined = not in the game, or game over). */
export function plyInGame(ref: GameRef, fen: string): number | undefined {
  const pd = data.get(ref.player);
  if (!pd?.games[ref.game]) return undefined;
  return replayMap(pd, ref.game).get(posHash(fen));
}

export interface GhostHit extends GameRef {
  ply: number;
  san: string;
}

/** Every game of the given players that reached this position, with the move played next. */
export function hitsAt(ids: string[], fens: string[], ply: number): GhostHit[] {
  const out: GhostHit[] = [];
  const h = posHash(fens[ply]);
  for (const id of ids) {
    const pd = data.get(id);
    if (!pd) continue;
    const arr = pd.idx[h];
    if (arr) {
      for (let i = 0; i < arr.length; i += 2) {
        const san = movesOf(pd, arr[i])[arr[i + 1]];
        if (san) out.push({ player: id, game: arr[i], ply: arr[i + 1], san });
      }
    } else if (ply >= INDEX_PLIES && fens[INDEX_PLIES - 1]) {
      // Past the indexed depth: follow the games that were still with us at the last indexed ply.
      const cand = pd.idx[posHash(fens[INDEX_PLIES - 1])];
      if (!cand) continue;
      for (let i = 0; i < cand.length && i < 160; i += 2) {
        const p = replayMap(pd, cand[i]).get(h);
        const san = p === undefined ? undefined : movesOf(pd, cand[i])[p];
        if (san) out.push({ player: id, game: cand[i], ply: p!, san });
      }
    }
  }
  return out;
}

export interface GhostMove {
  san: string;
  from: string;
  to: string;
  piece: string; // e.g. "wN"
  n: number;
  score: number; // GM's score with this move, 0..1
  players: { id: string; n: number }[];
  samples: GameInfo[];
  more: number;
}

const BIG_EVENT = /world|wch|candidat|olympiad|interzonal|\bct\b|match/i;

/** Group hits by move — only moves the GM himself played (not his opponents'). */
export function aggregate(fen: string, hits: GhostHit[], maxSamples = 4): GhostMove[] {
  const turn = fen.split(" ")[1];
  const by = new Map<string, { infos: GameInfo[]; players: Map<string, number>; pts: number }>();
  for (const h of hits) {
    const info = gameInfo(h);
    if (!info || info.gmColor !== turn) continue;
    let e = by.get(h.san);
    if (!e) by.set(h.san, (e = { infos: [], players: new Map(), pts: 0 }));
    e.infos.push(info);
    e.players.set(h.player, (e.players.get(h.player) ?? 0) + 1);
    e.pts += info.outcome === "○" ? 1 : info.outcome === "△" ? 0.5 : 0;
  }
  const out: GhostMove[] = [];
  for (const [san, e] of by) {
    let mv;
    try {
      mv = new Chess(fen).move(san);
    } catch {
      continue;
    }
    const rank = (g: GameInfo) => (BIG_EVENT.test(g.event) ? 2 : 0) + (g.outcome === "○" ? 1 : 0);
    const samples = [...e.infos].sort((a, b) => rank(b) - rank(a) || a.year - b.year).slice(0, maxSamples);
    out.push({
      san, from: mv.from, to: mv.to, piece: mv.color + mv.piece.toUpperCase(),
      n: e.infos.length, score: e.pts / e.infos.length,
      players: [...e.players.entries()].map(([id, n]) => ({ id, n })).sort((a, b) => b.n - a.n),
      samples, more: e.infos.length - samples.length,
    });
  }
  return out.sort((a, b) => b.n - a.n);
}

// ── famous games, resolved against the loaded data ──
export interface Classic {
  player: string;
  title: string;
  opp: RegExp;
  year: number;
  result: string;
  prefix: string;
}
export const CLASSICS: Classic[] = [
  { player: "fischer", title: "世紀の一局（1956・13歳）", opp: /Byrne, D/, year: 1956, result: "0-1", prefix: "Nf3 Nf6 c4 g6" },
  { player: "fischer", title: "世界選手権 第6局（1972・対スパスキー）", opp: /Spassky/, year: 1972, result: "1-0", prefix: "c4 e6 Nf3 d5 d4 Nf6 Nc3 Be7 Bg5" },
  { player: "kasparov", title: "カスパロフの不滅局（1999・対トパロフ）", opp: /Topalov/, year: 1999, result: "1-0", prefix: "e4 d6 d4 Nf6 Nc3 g6 Be3" },
  { player: "kasparov", title: "世界選手権 第16局（1985・対カルポフ）", opp: /Karpov/, year: 1985, result: "0-1", prefix: "e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nb5 d6 c4 Nf6 N1c3 a6 Na3 d5" },
  { player: "morphy", title: "オペラ座の一局（1858）", opp: /./, year: 1858, result: "1-0", prefix: "e4 e5 Nf3 d6 d4 Bg4 dxe5 Bxf3 Qxf3 dxe5 Bc4 Nf6 Qb3 Qe7 Nc3 c6 Bg5 b5 Nxb5" },
  { player: "capablanca", title: "マーシャル・アタックを受け切る（1918・対マーシャル）", opp: /Marshall/, year: 1918, result: "1-0", prefix: "e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5" },
  { player: "tal", title: "世界選手権 第6局（1960・対ボトヴィニク）", opp: /Botvinnik/, year: 1960, result: "0-1", prefix: "c4 Nf6 Nf3 g6 g3 Bg7 Bg2 O-O d4 d6 Nc3 Nbd7" },
  { player: "carlsen", title: "13歳の快勝（2004・対エルンスト）", opp: /Ernst/, year: 2004, result: "1-0", prefix: "e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5" },
  { player: "alekhine", title: "対レティ（1925・バーデン＝バーデン）", opp: /Reti/, year: 1925, result: "0-1", prefix: "g3 e5 Nf3 e4" },
];

export function findClassic(c: Classic): GameRef | undefined {
  const pd = data.get(c.player);
  if (!pd) return undefined;
  const i = pd.games.findIndex((g) => g[2] === c.year && g[4] === c.result && g[5].startsWith(c.prefix) && c.opp.test(g[6] === "w" ? g[1] : g[0]));
  return i < 0 ? undefined : { player: c.player, game: i };
}
