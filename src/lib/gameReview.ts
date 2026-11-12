// 振り返り: the user's own games, analysed move by move. Each real mistake becomes a puzzle
// ("what should you have played?"), and the mistakes are sorted into types that point at a drill.
import { Chess, type Color } from "chess.js";
import { Engine, type EngineLine } from "./engine";
import { explainMove } from "./explain";
import type { Imported } from "./importGames";
import { load, save } from "./storage";
import { extraLoss, moveDanger, VAL, verdictOf, winPct, type Verdict } from "./tactics";

export const GAMES_KEY = "dojo.review.games";
export const ANALYSIS_KEY = "dojo.review.analysis";
export const REVIEW_STATS_KEY = "dojo.review.stats";
const KEEP_GAMES = 150;
const START_PLY = 6; // the first 3 moves are opening theory: not worth an engine verdict
const MAX_PLY = 140;
const DEPTH = 11;

export interface ReviewGame {
  id: string;
  t: number;
  color: Color;
  result: string; // "1-0" | "0-1" | "1/2-1/2"
  moves: string; // SAN, space separated
  r?: number;
  or?: number;
  sp?: string;
}

export type SlipKind = "mate-missed" | "mate-allowed" | "hung" | "tactic-allowed" | "tactic-missed" | "positional";
export type Phase = "序盤" | "中盤" | "終盤";

export interface Slip {
  ply: number; // index of the move in the game (0 = White's first move)
  fen: string; // position before the move
  played: string; // uci
  playedSan: string;
  best: string; // uci
  bestSan: string;
  pv: string[]; // engine line from `fen`, starting with the best move
  reply?: string; // the opponent's best answer to the played move (uci)
  replyPv?: string[];
  be?: { cp?: number; mate?: number }; // engine score before the move (best play), White's view
  ae?: { cp?: number; mate?: number }; // engine score after the played move, White's view
  drop: number; // win% lost
  wpBefore: number;
  verdict: Verdict;
  kind: SlipKind;
  aim?: string; // the 狙いドリル aim this mistake is about
  phase: Phase;
}

export interface GameAnalysis {
  v: 1;
  at: number;
  from: number; // first analysed ply
  ev: number[]; // White-relative centipawns for positions from..end (mate → ±10000)
  best: string[]; // best move (uci) in each of those positions
  slips: Slip[];
}

export const KIND_INFO: Record<SlipKind, { ja: string; what: string; view: "attack" | "threat" | "spar"; aim?: string }> = {
  "mate-missed": { ja: "詰みの見逃し", what: "詰ませる手順があったのに、気づかずに別の手を指した。", view: "attack", aim: "exposedKing" },
  "mate-allowed": { ja: "詰み筋の見落とし", what: "相手に詰み（または詰みに近い攻め）を許した。", view: "threat", aim: "mix" },
  hung: { ja: "駒のタダ渡し", what: "動かした駒や残した駒を、ただで取られる位置に置いた。", view: "threat", aim: "hangingPiece" },
  "tactic-allowed": { ja: "相手の戦術の見落とし", what: "相手のフォーク・ピンなどの狙いを見落とした。", view: "threat" },
  "tactic-missed": { ja: "自分の戦術の見逃し", what: "決まる戦術（駒得・フォーク・ピンなど）があったのに指さなかった。", view: "attack" },
  positional: { ja: "方針・形勢判断のミス", what: "戦術ではなく、駒の配置・ポーンの形・計画の選び方で損をした。", view: "spar" },
};

// Words the rule-based explainer uses → the aim they belong to.
const WORD_AIM: [string, string][] = [
  ["フォーク", "fork"],
  ["ピン", "pin"],
  ["串刺し", "skewer"],
  ["ディスカバード", "discoveredAttack"],
  ["サクリファイス", "sacrifice"],
  ["詰", "exposedKing"],
  ["駒得", "hangingPiece"],
];

export const loadReviewGames = () => load<ReviewGame[]>(GAMES_KEY, []);
export const loadAnalysis = () => load<Record<string, GameAnalysis>>(ANALYSIS_KEY, {});

/** Keep the move lists of fetched games (newest KEEP_GAMES), so they can be replayed and analysed. */
export function keepGames(games: Imported[]) {
  if (!games.length) return;
  const have = new Map(loadReviewGames().map((g) => [g.id, g]));
  for (const g of games) {
    if (g.moves.length < 10) continue;
    have.set(g.id, { id: g.id, t: g.t, color: g.color, result: g.result, moves: g.moves.join(" "), r: g.myRating, or: g.oppRating, sp: g.speed });
  }
  const list = [...have.values()].sort((a, b) => b.t - a.t).slice(0, KEEP_GAMES);
  save(GAMES_KEY, list);
  // Drop analyses of games that fell out of the list.
  const keep = new Set(list.map((g) => g.id));
  const an = loadAnalysis();
  if (Object.keys(an).some((id) => !keep.has(id))) save(ANALYSIS_KEY, Object.fromEntries(Object.entries(an).filter(([id]) => keep.has(id))));
}

/** Positions after each move: fens[k] = before move k. Stops at the first illegal move. */
export function positionsOf(g: ReviewGame): { fens: string[]; sans: string[]; ucis: string[] } {
  const c = new Chess();
  const fens = [c.fen()];
  const sans: string[] = [];
  const ucis: string[] = [];
  for (const san of g.moves.split(" ")) {
    try {
      const m = c.move(san);
      sans.push(m.san);
      ucis.push(m.from + m.to + (m.promotion ?? ""));
      fens.push(c.fen());
    } catch {
      break;
    }
  }
  return { fens, sans, ucis };
}

const sanOf = (fen: string, uci: string) => {
  try {
    return new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }).san;
  } catch {
    return uci;
  }
};

function phaseOf(fen: string, ply: number): Phase {
  if (ply < 20) return "序盤";
  let pieces = 0;
  for (const ch of fen.split(" ")[0]) if ("nbrqNBRQ".includes(ch)) pieces += VAL[ch.toLowerCase()];
  return pieces <= 26 ? "終盤" : "中盤";
}

const aimFrom = (texts: string[]) => {
  for (const [w, aim] of WORD_AIM) if (texts.some((t) => t.includes(w))) return aim;
  return undefined;
};

let worker: Engine | undefined;
/** A second engine, so analysing games never fights with the board's live analysis. */
const analyst = () => (worker ??= new Engine());

function evaluate(fen: string): Promise<EngineLine | undefined> {
  const c = new Chess(fen);
  if (c.isCheckmate()) return Promise.resolve({ multipv: 1, depth: 99, cp: c.turn() === "w" ? -10000 : 10000, pv: [] });
  if (c.isGameOver()) return Promise.resolve({ multipv: 1, depth: 99, cp: 0, pv: [] });
  return Promise.race([
    analyst().run({ fen, multipv: 1, depth: DEPTH }).then((ls) => ls[0]),
    new Promise<undefined>((r) => setTimeout(() => r(undefined), 20000)),
  ]);
}

const cpOf = (l?: EngineLine) => (!l ? 0 : l.mate !== undefined ? (l.mate > 0 ? 10000 : -10000) : Math.max(-10000, Math.min(10000, l.cp ?? 0)));

/** Classify one mistake: what kind of miss it was, and which drill trains it. */
function classify(fen: string, played: string, me: Color, before: EngineLine, after: EngineLine | undefined): { kind: SlipKind; aim?: string } {
  const mineMate = before.mate !== undefined && (me === "w" ? before.mate > 0 : before.mate < 0);
  if (mineMate) return { kind: "mate-missed", aim: "exposedKing" };
  const theirMate = after?.mate !== undefined && (me === "w" ? after.mate < 0 : after.mate > 0);
  if (theirMate) return { kind: "mate-allowed", aim: "mix" };
  if (extraLoss(fen, played.slice(0, 2), played.slice(2, 4)) >= 2 || (moveDanger(fen, played.slice(0, 2), played.slice(2, 4))?.loss ?? 0) >= 3) return { kind: "hung", aim: "hangingPiece" };
  const c = new Chess(fen);
  try {
    c.move({ from: played.slice(0, 2), to: played.slice(2, 4), promotion: played[4] });
  } catch {
    return { kind: "positional" };
  }
  if (after?.pv[0]) {
    const ex = explainMove(c.fen(), after.pv[0], after);
    const aim = aimFrom(ex.reasons.filter((r) => r.kind === "tactic" || r.kind === "sacrifice").map((r) => r.text));
    if (aim && aim !== "hangingPiece") return { kind: "tactic-allowed", aim };
    if (aim === "hangingPiece") return { kind: "hung", aim };
  }
  if (before.pv[0]) {
    const ex = explainMove(fen, before.pv[0], before);
    const aim = aimFrom(ex.reasons.filter((r) => r.kind === "tactic" || r.kind === "sacrifice").map((r) => r.text));
    if (aim) return { kind: "tactic-missed", aim };
  }
  return { kind: "positional" };
}

/** Analyse one game with the engine. `onPly` reports progress; `stop()` returning true aborts. */
export async function analyzeOne(g: ReviewGame, onPly?: (k: number, n: number) => void, stop?: () => boolean): Promise<GameAnalysis | undefined> {
  const { fens, ucis, sans } = positionsOf(g);
  const end = Math.min(fens.length - 1, MAX_PLY);
  const from = Math.min(START_PLY, end);
  const lines: (EngineLine | undefined)[] = [];
  for (let k = from; k <= end; k++) {
    if (stop?.()) return undefined;
    lines.push(await evaluate(fens[k]));
    onPly?.(k - from + 1, end - from + 1);
  }
  const at = (k: number) => lines[k - from];
  const slips: Slip[] = [];
  for (let k = from; k < end; k++) {
    const fen = fens[k];
    if ((fen.split(" ")[1] as Color) !== g.color) continue;
    const b = at(k), a = at(k + 1);
    if (!b || !b.pv[0] || b.pv[0] === ucis[k]) continue;
    const wpB = winPct(b.cp, b.mate, g.color);
    const wpA = a ? winPct(a.cp, a.mate, g.color) : wpB;
    const drop = wpB - wpA;
    if (drop < 10 || wpB < 10 || wpA > 85) continue;
    const { kind, aim } = classify(fen, ucis[k], g.color, b, a);
    slips.push({
      ply: k, fen, played: ucis[k], playedSan: sans[k], best: b.pv[0], bestSan: sanOf(fen, b.pv[0]), pv: b.pv.slice(0, 8),
      reply: a?.pv[0], replyPv: a?.pv.slice(0, 6), be: { cp: b.cp, mate: b.mate }, ae: a ? { cp: a.cp, mate: a.mate } : undefined, drop: Math.round(drop), wpBefore: Math.round(wpB), verdict: verdictOf(drop, false), kind, aim, phase: phaseOf(fen, k),
    });
  }
  return { v: 1, at: Date.now(), from, ev: lines.map(cpOf), best: lines.map((l) => l?.pv[0] ?? ""), slips };
}

export function saveAnalysis(id: string, a: GameAnalysis) {
  const all = loadAnalysis();
  all[id] = a;
  save(ANALYSIS_KEY, all);
}

export const isPuzzle = (s: Slip) => s.verdict === "mistake" || s.verdict === "blunder";
export const slipKey = (gameId: string, s: Slip) => `${gameId}:${s.ply}`;

export interface SlipRef {
  key: string;
  game: ReviewGame;
  slip: Slip;
}
/** Every mistake/blunder from the analysed games, newest game first. */
export function allPuzzles(games = loadReviewGames(), an = loadAnalysis()): SlipRef[] {
  const out: SlipRef[] = [];
  for (const g of games) for (const s of an[g.id]?.slips ?? []) if (isPuzzle(s)) out.push({ key: slipKey(g.id, s), game: g, slip: s });
  return out;
}

export interface Tally {
  kinds: { kind: SlipKind; n: number; aims: Record<string, number> }[];
  phases: Record<Phase, number>;
  games: number;
  total: number;
}
/** Mistakes (and blunders) by type and by phase, over the analysed games. */
export function tally(games = loadReviewGames(), an = loadAnalysis()): Tally {
  const by = new Map<SlipKind, { n: number; aims: Record<string, number> }>();
  const phases: Record<Phase, number> = { 序盤: 0, 中盤: 0, 終盤: 0 };
  let n = 0, total = 0;
  for (const g of games) {
    const a = an[g.id];
    if (!a) continue;
    n++;
    for (const s of a.slips) {
      if (!isPuzzle(s)) continue;
      total++;
      phases[s.phase]++;
      const e = by.get(s.kind) ?? { n: 0, aims: {} };
      e.n++;
      if (s.aim) e.aims[s.aim] = (e.aims[s.aim] ?? 0) + 1;
      by.set(s.kind, e);
    }
  }
  return { kinds: [...by.entries()].map(([kind, v]) => ({ kind, ...v })).sort((a, b) => b.n - a.n), phases, games: n, total };
}

/** Verdict of every analysed move of the player: ply → verdict (only the bad ones). */
export function badMoves(a?: GameAnalysis): Map<number, Slip> {
  return new Map((a?.slips ?? []).map((s) => [s.ply, s]));
}

/** Engine lines for explaining a slip: the best line from the position, and the reply line after the played move. */
export function slipLines(s: Slip): { best: EngineLine; reply?: EngineLine } {
  const best: EngineLine = { multipv: 1, depth: DEPTH, pv: s.pv, ...(s.be ?? { cp: 0 }) };
  const reply: EngineLine | undefined = s.reply ? { multipv: 1, depth: DEPTH, pv: s.replyPv ?? [s.reply], ...(s.ae ?? { cp: 0 }) } : undefined;
  return { best, reply };
}
