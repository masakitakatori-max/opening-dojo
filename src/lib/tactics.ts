// Fast, engine-free blunder detection.
// Static exchange evaluation (SEE) on legal captures: "if they start taking on this square,
// how much material do they win with best play of recaptures?" Pins are respected because
// we only ever play legal moves.
import { Chess, type Move, type Square } from "chess.js";

export const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

/** Material the side to move wins by starting a capture sequence on `sq` (>= 0). */
function see(c: Chess, sq: Square, depth = 0): number {
  const target = c.get(sq);
  if (!target || depth > 8) return 0;
  const turn = c.turn();
  const attackers = c.attackers(sq, turn);
  let best: Move | undefined;
  for (const from of attackers) {
    for (const m of c.moves({ square: from, verbose: true })) {
      if (m.to !== sq || (m.promotion && m.promotion !== "q")) continue;
      if (!best || VAL[m.piece] < VAL[best.piece]) best = m;
    }
  }
  if (!best) return 0;
  c.move(best);
  const gain = VAL[target.type] + (best.promotion ? VAL.q - VAL.p : 0) - see(c, sq, depth + 1);
  c.undo();
  return Math.max(0, gain);
}

/** Largest material gain available to the side to move, and where. */
function bestGain(c: Chess): { gain: number; sq?: string } {
  const them = c.turn() === "w" ? "b" : "w";
  let out: { gain: number; sq?: string } = { gain: 0 };
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color !== them || p.type === "k") continue;
      if (!c.isAttacked(p.square, c.turn())) continue;
      const g = see(c, p.square);
      if (g > out.gain) out = { gain: g, sq: p.square };
    }
  }
  return out;
}

export interface Danger {
  loss: number; // net material lost (pawn units) if the opponent replies well
  mate: boolean; // allows mate in one
  sq?: string; // where the material is lost
}

// Results depend only on the position, and are asked for on every render: remember them.
const dangerMemo = new Map<string, Danger | null>();
const hangingMemo = new Map<string, { mine: string[]; theirs: string[] }>();
function memo<T>(m: Map<string, T>, key: string, make: () => T): T {
  if (m.has(key)) return m.get(key) as T;
  if (m.size > 20000) m.clear();
  const v = make();
  m.set(key, v);
  return v;
}

/** What a candidate move costs: material handed over, or a mate in one allowed. */
export function moveDanger(fen: string, from: string, to: string): Danger | null {
  return memo(dangerMemo, `${fen}|${from}${to}`, () => computeDanger(fen, from, to));
}
function computeDanger(fen: string, from: string, to: string): Danger | null {
  const c = new Chess(fen);
  let mv: Move;
  try {
    mv = c.move({ from, to, promotion: "q" });
  } catch {
    return null;
  }
  if (c.isCheckmate()) return { loss: 0, mate: false };
  for (const reply of c.moves()) {
    c.move(reply);
    const mated = c.isCheckmate();
    c.undo();
    if (mated) return { loss: 99, mate: true };
  }
  const won = (mv.captured ? VAL[mv.captured] : 0) + (mv.promotion ? VAL.q - VAL.p : 0);
  const g = bestGain(c);
  return { loss: g.gain - won, mate: false, sq: g.sq };
}

const safeMemo = new Map<string, number>();
/** Least material any legal move loses here (0 = a safe move exists). */
function safestLoss(fen: string): number {
  return memo(safeMemo, fen, () => {
    const c = new Chess(fen);
    let min = Infinity;
    for (const m of c.moves({ verbose: true })) {
      c.move(m.san);
      const won = (m.captured ? VAL[m.captured] : 0) + (m.promotion ? VAL.q - VAL.p : 0);
      const loss = c.isCheckmate() ? -100 : bestGain(c).gain - won;
      c.undo();
      if (loss < min) min = loss;
      if (min <= 0) break;
    }
    return min === Infinity ? 0 : Math.max(0, min);
  });
}

/**
 * Material this move gives up BEYOND what the safest move would lose.
 * In a position where something is lost whatever you do, ordinary moves score 0 —
 * only a move that offers more than necessary is a sacrifice (or a blunder).
 */
export function extraLoss(fen: string, from: string, to: string): number {
  const d = moveDanger(fen, from, to);
  if (!d || d.mate) return 0;
  return Math.max(0, d.loss - safestLoss(fen));
}

/** Pieces that are en prise right now: mine (can be won by the opponent) and theirs (can be won by me). */
export function hangingPieces(fen: string): { mine: string[]; theirs: string[] } {
  return memo(hangingMemo, fen, () => computeHanging(fen));
}
function computeHanging(fen: string): { mine: string[]; theirs: string[] } {
  const c = new Chess(fen);
  const theirs: string[] = [];
  const mine: string[] = [];
  const me = c.turn();
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.type === "k") continue;
      if (p.color !== me && c.isAttacked(p.square, me) && see(c, p.square) > 0) theirs.push(p.square);
    }
  }
  if (!c.inCheck()) {
    const flipped = new Chess(fen);
    // "if it were their move": skip when that would be illegal (e.g. they'd be in check)
    const them = me === "w" ? "b" : "w";
    if (flipped.setTurn(them)) {
      for (const row of flipped.board()) {
        for (const p of row) {
          if (!p || p.type === "k" || p.color !== me) continue;
          if (flipped.isAttacked(p.square, them) && see(flipped, p.square) > 0) mine.push(p.square);
        }
      }
    }
  }
  return { mine, theirs };
}

// ── engine-based verdicts (after the move) ──
export type Verdict = "brilliant" | "best" | "good" | "inaccuracy" | "mistake" | "blunder";

/** Win probability (0..100) for `color`, from a White-relative score (Lichess formula). */
export function winPct(cp: number | undefined, mate: number | undefined, color: "w" | "b") {
  let v = mate !== undefined ? (mate > 0 ? 10000 : -10000) : cp ?? 0;
  if (color === "b") v = -v;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * v)) - 1);
}

export function verdictOf(drop: number, wasBest: boolean): Verdict {
  if (wasBest) return "best";
  if (drop >= 30) return "blunder";
  if (drop >= 20) return "mistake";
  if (drop >= 10) return "inaccuracy";
  return "good";
}

export const VERDICT_LABEL: Record<Verdict, { sym: string; ja: string; color: string }> = {
  brilliant: { sym: "!!", ja: "妙手（一見悪手に見える好手）", color: "#1baca6" },
  best: { sym: "★", ja: "最善手", color: "#81b64c" },
  good: { sym: "✓", ja: "良い手", color: "#95b776" },
  inaccuracy: { sym: "?!", ja: "疑問手", color: "#f7c631" },
  mistake: { sym: "?", ja: "悪手", color: "#e58f2a" },
  blunder: { sym: "??", ja: "ブランダー", color: "#ca3431" },
};
