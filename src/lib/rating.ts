// Rating estimates.
//  - From games: the ratings the sites recorded for the player and each opponent give the current
//    rating and the performance rating (what rating the recent results correspond to).
//  - From puzzles: an Elo-style rating against the puzzles' own difficulty ratings.
import { load, save } from "./storage";

export interface RatedGame {
  t: number;
  score: number; // 1 / 0.5 / 0
  r?: number; // the player's rating at the time
  or?: number; // the opponent's rating
  sp?: string; // time class
}

const SPEED_JA: Record<string, string> = { ultraBullet: "ウルトラバレット", bullet: "バレット", blitz: "ブリッツ", rapid: "ラピッド", classical: "クラシカル", correspondence: "通信", daily: "デイリー（通信）" };
const ORDER = ["rapid", "classical", "blitz", "bullet", "ultraBullet", "daily", "correspondence"];
export const speedJa = (sp: string) => SPEED_JA[sp] ?? sp;

/** Performance rating: the opponents' average, shifted by what the score says (the standard logistic rule). */
export function performance(games: RatedGame[]) {
  const gs = games.filter((g) => typeof g.or === "number" && g.or > 0);
  if (!gs.length) return null;
  const avgOpp = gs.reduce((a, g) => a + g.or!, 0) / gs.length;
  const score = gs.reduce((a, g) => a + g.score, 0) / gs.length;
  // 100% or 0% would be infinite: cap at the value for one half-point short of it
  const p = Math.min(Math.max(score, 0.5 / gs.length), 1 - 0.5 / gs.length);
  return { perf: Math.round(avgOpp - 400 * Math.log10(1 / p - 1)), avgOpp: Math.round(avgOpp), score, n: gs.length };
}

export interface RatingRow {
  speed: string;
  n: number; // games of this time class with ratings
  current?: number; // the player's rating in the latest game
  perf?: number; // performance over the latest `window` games (not given below MIN_GAMES: one or two results say nothing)
  window: number;
  avgOpp: number;
  score: number;
  /** performance of the newer half minus the older half (only with enough games) */
  trend?: number;
}
const WINDOW = 50;
export const MIN_GAMES = 5;
export const SOLID_GAMES = 15; // below this the performance is shown as a rough guide only

/** One row per time class, most "serious" class first. */
export function ratingRows(games: RatedGame[]): RatingRow[] {
  const by = new Map<string, RatedGame[]>();
  for (const g of games) if (g.sp && typeof g.or === "number") by.set(g.sp, [...(by.get(g.sp) ?? []), g]);
  const rows: RatingRow[] = [];
  for (const [speed, all] of by) {
    const gs = [...all].sort((a, b) => a.t - b.t);
    const recent = gs.slice(-WINDOW);
    const p = performance(recent);
    if (!p) continue;
    const half = Math.floor(recent.length / 2);
    const older = recent.length >= 30 ? performance(recent.slice(0, half)) : null;
    const newer = recent.length >= 30 ? performance(recent.slice(half)) : null;
    rows.push({ speed, n: gs.length, current: [...gs].reverse().find((g) => g.r)?.r, perf: p.n >= MIN_GAMES ? p.perf : undefined, window: p.n, avgOpp: p.avgOpp, score: p.score, trend: older && newer ? newer.perf - older.perf : undefined });
  }
  return rows.sort((a, b) => (ORDER.indexOf(a.speed) + 1 || 99) - (ORDER.indexOf(b.speed) + 1 || 99));
}

// ── tactics rating from the aim drill ──
const TACTIC_KEY = "dojo.aim.rating";
export interface TacticRating {
  r: number;
  n: number; // puzzles counted (first attempts only)
  best: number;
}
export const loadTactic = (): TacticRating => ({ r: 1200, n: 0, best: 0, ...load<Partial<TacticRating>>(TACTIC_KEY, {}) });

/** One first-attempt result against a puzzle of known difficulty. Big steps at first, smaller once settled. */
export function updateTactic(puzzleRating: number, solved: boolean): TacticRating {
  const t = loadTactic();
  const expected = 1 / (1 + 10 ** ((puzzleRating - t.r) / 400));
  const k = t.n < 15 ? 48 : t.n < 50 ? 28 : 16;
  const r = Math.round(t.r + k * ((solved ? 1 : 0) - expected));
  const next = { r, n: t.n + 1, best: Math.max(t.best, t.n + 1 >= 15 ? r : 0) };
  save(TACTIC_KEY, next);
  return next;
}
export const TACTIC_PROVISIONAL = 15; // fewer puzzles than this: the number is still jumping around
