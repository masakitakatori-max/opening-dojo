// The clone: an opponent that plays like the user's past self.
//  1. In positions from the user's own games it repeats the moves they actually played.
//  2. After that it picks, among the engine's candidates, the move that fits the user's habits.
//  3. It gives material away as often as the user does in that phase of the game.
// This imitates tendencies; it is not a model of the user's thinking.
import { Chess, type Move } from "chess.js";
import { GM_STYLES } from "../data/gmStyles";
import type { EngineLine } from "./engine";
import type { Book } from "./myGames";
import { posHash } from "./poshash";
import { baseline, zOf, type MetricKey, type Profile } from "./style";
import { extraLoss, winPct } from "./tactics";

export interface ClonePick {
  uci: string;
  san: string;
  kind: "book" | "style" | "slip";
  why: string;
}

const FILES = "abcdefgh";
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const PHASE_JA = { opening: "序盤", middle: "中盤", endgame: "終盤" } as const;

function phaseOf(c: Chess, myMoveNo: number): keyof typeof PHASE_JA {
  const np = { w: 0, b: 0 };
  for (const row of c.board()) for (const p of row) if (p && p.type !== "p") np[p.color] += VAL[p.type];
  if (np.w <= 13 && np.b <= 13) return "endgame";
  return myMoveNo <= 12 ? "opening" : "middle";
}

const pickWeighted = <T,>(items: T[], w: (x: T) => number): T => {
  let x = Math.random() * items.reduce((a, i) => a + w(i), 0);
  for (const i of items) if ((x -= w(i)) <= 0) return i;
  return items[items.length - 1];
};

/** How often (per own move) the user loses material in this phase. */
export function slipRate(p: Profile, phase: keyof typeof PHASE_JA) {
  const endMoves = Math.max(8, p.m.length * 0.25);
  const perGame = phase === "opening" ? p.loss.opening : phase === "endgame" ? p.loss.endgame : p.loss.middle;
  const moves = phase === "opening" ? 12 : phase === "endgame" ? endMoves : Math.max(8, p.m.length - 12 - endMoves * p.m.endgame);
  return { perGame, perMove: Math.max(0, Math.min(0.3, perGame / moves)) };
}

/**
 * The clone's move. `lines` = engine candidates for this position (MultiPV, best first).
 * `myMoveNo` = the clone's own move number (1-based).
 */
export function cloneMove(fen: string, lines: EngineLine[], p: Profile, book: Book | undefined, myMoveNo: number): ClonePick | null {
  const c = new Chess(fen);
  const turn = c.turn();

  // 1) the user's own opening moves
  const entry = book?.[posHash(fen)];
  if (entry) {
    const total = Object.values(entry).reduce((a, n) => a + n, 0);
    const san = pickWeighted(Object.keys(entry), (s) => entry[s]);
    try {
      const m = new Chess(fen).move(san);
      return { uci: m.from + m.to + (m.promotion ?? ""), san: m.san, kind: "book", why: `過去のあなたがこの局面で実際に指した手（${total} 局中 ${entry[san]} 局）` };
    } catch {
      /* stale entry: fall through */
    }
  }

  // 2) a slip, as often as the user slips in this phase
  const phase = phaseOf(c, myMoveNo);
  const slip = slipRate(p, phase);
  if (Math.random() < slip.perMove) {
    const bad = c.moves({ verbose: true }).filter((m) => {
      if (m.piece === "k" || (m.promotion && m.promotion !== "q")) return false;
      const loss = extraLoss(fen, m.from, m.to);
      return loss >= 2 && loss <= 6;
    });
    if (bad.length) {
      const m = bad[Math.floor(Math.random() * bad.length)];
      return { uci: m.from + m.to + (m.promotion ?? ""), san: m.san, kind: "slip", why: `ミスの再現：過去のあなたは${PHASE_JA[phase]}で 1 局あたり ${slip.perGame.toFixed(1)} 回、駒を損しています` };
    }
  }

  // 3) the engine candidate that best fits the user's habits
  if (!lines.length) return null;
  const b = baseline(GM_STYLES);
  const z = (k: MetricKey) => zOf(p.m[k], b[k]);
  const wp = (l: EngineLine) => winPct(l.cp, l.mate, turn);
  const best = Math.max(...lines.map(wp));
  // The looser the user's play, the further from the best move the clone may stray.
  const margin = 3 + 12 * Math.min(1, p.m.lossEv / 1.5);
  const kf = (() => {
    for (const row of c.board()) for (const q of row) if (q && q.type === "k" && q.color !== turn) return FILES.indexOf(q.square[0]);
    return 4;
  })();
  const wing = kf >= 5 ? [5, 6, 7] : kf <= 2 ? [0, 1, 2] : [];

  const scored: { m: Move; score: number; label: string }[] = [];
  for (const l of lines) {
    const drop = best - wp(l);
    if (drop > margin) continue;
    let m: Move;
    try {
      m = new Chess(fen).move({ from: l.pv[0].slice(0, 2), to: l.pv[0].slice(2, 4), promotion: l.pv[0][4] });
    } catch {
      continue;
    }
    const rel = turn === "w" ? +m.to[1] : 9 - +m.to[1];
    const castle = m.flags.includes("k") || m.flags.includes("q");
    const parts: [number, string][] = [
      [m.piece === "n" ? z("knightPref") * 0.25 : m.piece === "b" ? -z("knightPref") * 0.25 : 0, m.piece === "n" ? "ナイトをよく動かすクセ" : "ビショップをよく動かすクセ"],
      [m.piece === "q" ? z("queenShare") * 0.4 + (myMoveNo <= 7 ? z("earlyQueen") * 0.3 : 0) : 0, "クイーンをよく動かすクセ"],
      [m.piece === "r" ? z("rookShare") * 0.25 : 0, "ルークをよく動かすクセ"],
      [m.piece === "p" ? z("pawnShare") * 0.25 : 0, "ポーンの手が多いクセ"],
      [m.piece === "k" && !castle ? z("kingShare") * 0.2 : 0, "キングをよく動かすクセ"],
      [m.captured ? z("capRate") * 0.3 : 0, "駒を取りにいくクセ"],
      [m.san.includes("+") ? z("checks") * 0.4 : 0, "チェックを好むクセ"],
      [m.piece !== "p" && m.piece !== "k" ? ((rel - 4.5) / 3.5) * z("advance") * 0.3 : 0, rel >= 5 ? "駒を前に出すクセ" : "自陣で構えるクセ"],
      [castle ? (myMoveNo >= p.m.castleMove - 1 ? 0.8 : -0.8) : 0, `いつも ${Math.round(p.m.castleMove)} 手目ごろに囲うクセ`],
      [m.piece === "q" && m.captured === "q" ? z("queensOff25") * 0.5 : 0, "クイーン交換をいとわないクセ"],
      [m.piece === "p" && rel >= 5 && wing.includes(FILES.indexOf(m.to[0])) ? z("storm") * 0.3 : 0, "相手キング側のポーンを突くクセ"],
    ];
    const top = [...parts].sort((x, y) => y[0] - x[0])[0];
    scored.push({ m, score: -(drop / margin) * 2 + parts.reduce((a, x) => a + x[0], 0), label: top[0] > 0.15 ? top[1] : "" });
  }
  if (!scored.length) return null;
  const pick = pickWeighted(scored, (x) => Math.exp(x.score / 0.6));
  return { uci: pick.m.from + pick.m.to + (pick.m.promotion ?? ""), san: pick.m.san, kind: "style", why: pick.label ? `あなたのクセに合う手：${pick.label}` : "エンジンの候補から、あなたの精度の範囲で選んだ手" };
}

/** The habits the clone imitates, strongest first. */
export function traits(p: Profile): string[] {
  const b = baseline(GM_STYLES);
  const T: [MetricKey, string, string][] = [
    ["checks", "チェックを多用する", "チェックをあまり使わない"],
    ["pressure", "相手キングの周りに駒を集める", "相手キングを直接は狙わない"],
    ["queenShare", "クイーンをよく動かす", "クイーンを温存する"],
    ["earlyQueen", "クイーンを早く出す", ""],
    ["knightPref", "ナイトを優先して動かす", "ビショップを優先して動かす"],
    ["tradeRate", "駒交換を好む", "駒交換を避ける"],
    ["castleMove", `囲いが遅い（平均 ${p.m.castleMove.toFixed(0)} 手目）`, `囲いが早い（平均 ${p.m.castleMove.toFixed(0)} 手目）`],
    ["storm", "相手キング側のポーンを突く", ""],
    ["advance", "駒を前に出す", "自陣で構える"],
    ["capRate", "駒を取りにいく", "駒取りを急がない"],
    ["pawnShare", "ポーンの手が多い", "ポーンをあまり動かさない"],
    ["endgame", "エンドゲームまで行きやすい", "中盤で決着しやすい"],
    ["opposite", "反対側に囲って攻め合う", ""],
  ];
  return T.map(([k, hi, lo]) => ({ z: zOf(p.m[k], b[k]), hi, lo }))
    .filter((t) => Math.abs(t.z) >= 1 && (t.z > 0 ? t.hi : t.lo))
    .sort((x, y) => Math.abs(y.z) - Math.abs(x.z))
    .slice(0, 6)
    .map((t) => (t.z > 0 ? t.hi : t.lo));
}

/** Where the past self is weakest — and how to go after it. */
export function exploits(p: Profile): { weak: string; how: string }[] {
  const out: { weak: string; how: string }[] = [];
  const ph = (["opening", "middle", "endgame"] as const).map((k) => ({ k, v: p.loss[k] })).sort((a, b) => b.v - a.v)[0];
  if (p.m.lossEv >= 0.6) out.push({ weak: `${PHASE_JA[ph.k]}で駒を落としやすい（1 局あたり ${ph.v.toFixed(1)} 回）`, how: "毎手「タダで取れる駒はないか」を確認する。駒に当たりをかけて選択を迫る" });
  if (p.m.mated >= 0.3) out.push({ weak: `詰みを見落とす（負けの ${Math.round(p.m.mated * 100)}% が詰み）`, how: "駒得より、キングに迫る手とチェックを優先する" });
  if (p.splits.uncastled.n >= 6 && p.splits.uncastled.score < p.score - 0.08) out.push({ weak: `囲いが遅いと負けやすい（平均 ${p.m.castleMove.toFixed(0)} 手目に囲う）`, how: "囲う前に中央のポーンを交換して列を開け、キングを狙う" });
  const d = (a: { n: number; score: number }, b2: { n: number; score: number }) => (a.n >= 8 && b2.n >= 8 ? a.score - b2.score : 0);
  if (d(p.splits.endgame, p.splits.noEndgame) <= -0.1) out.push({ weak: "エンドゲームで成績が落ちる", how: "駒をどんどん交換して、終盤に持ち込む" });
  if (d(p.splits.queensOff, p.splits.queensOn) <= -0.1) out.push({ weak: "クイーン交換後に成績が落ちる", how: "クイーン交換を自分から申し込む" });
  if (d(p.splits.queensOn, p.splits.queensOff) <= -0.1) out.push({ weak: "クイーンが残ると成績が落ちる", how: "クイーン交換を避け、キングへの攻めを続ける" });
  if (d(p.splits.black, p.splits.white) <= -0.16) out.push({ weak: "黒番で成績が落ちる", how: "あなたが白を持つと、分身の苦手な黒番を相手にできる" });
  if (p.splits.up3.n >= 8 && p.splits.up3.score < 0.75) out.push({ weak: "有利な局面を勝ちきれない", how: "不利になっても投げずに、複雑な局面を保って逆転を狙う" });
  return out;
}
