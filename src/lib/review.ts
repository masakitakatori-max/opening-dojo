import { Chess, type Color } from "chess.js";
import type { Arrow, SquareMark } from "../components/Board";
import { engine, type EngineLine } from "./engine";
import { evalFor, explainMove, type Explanation } from "./explain";
import { extraLoss, moveDanger, verdictOf, VERDICT_LABEL, winPct, type Verdict } from "./tactics";

export const uciOf = (m: { from: string; to: string; promotion?: string }) => `${m.from}${m.to}${m.promotion ?? ""}`;

/** Eval as seen by `color` (+ = good for that side), with its colour tone. */
export function povEval(l: { cp?: number; mate?: number } | undefined, color: Color): { text: string; tone: "pos" | "neg" | "zero" } {
  if (!l) return { text: "…", tone: "zero" };
  if (l.mate !== undefined) {
    const mine = color === "w" ? l.mate > 0 : l.mate < 0;
    return { text: `${mine ? "+" : "-"}M${Math.abs(l.mate)}`, tone: mine ? "pos" : "neg" };
  }
  const v = ((l.cp ?? 0) / 100) * (color === "w" ? 1 : -1);
  const r = Math.round(v * 10) / 10;
  return { text: `${r > 0 ? "+" : ""}${r.toFixed(1)}`, tone: r > 0 ? "pos" : r < 0 ? "neg" : "zero" };
}

/** Best known win% for the side to move in `fen`, using every evaluation we have. */
function bestKnown(fen: string, extra: EngineLine[] = []) {
  const color = fen.split(" ")[1] as Color;
  const all = [...(engine.cached(fen) ?? []).slice(0, 1), ...(engine.evalsOf(fen)?.values() ?? []), ...extra];
  let best: EngineLine | undefined;
  let bestWp = -1;
  for (const l of all) {
    const wp = winPct(l.cp, l.mate, color);
    if (wp > bestWp) {
      bestWp = wp;
      best = l;
    }
  }
  return best ? { line: best, wp: bestWp } : undefined;
}

/** "Looks like it loses material, engine says it's fine" → !! */
function upgrade(v: Verdict, fen: string, from: string, to: string, wpAfter: number): Verdict {
  // Giving up material while already losing is desperation, not brilliance.
  if ((v !== "best" && v !== "good") || wpAfter < 45) return v;
  // A real sacrifice: at least an exchange (2 points) more than the safest move gives up.
  return extraLoss(fen, from, to) >= 2 ? "brilliant" : v;
}

export interface Graded {
  san: string;
  uci: string;
  from: string;
  to: string;
  book: boolean;
  verdict?: Verdict;
  line?: EngineLine;
  danger?: { loss: number; mate: boolean };
}

/** Grade every move of the selected piece (engine where available, static check meanwhile). */
export function gradePiece(fen: string, sel: string, pieceLines: EngineLine[], bookSans: Set<string>): Graded[] {
  const c = new Chess(fen);
  const color = c.turn();
  const moves = c.moves({ square: sel as never, verbose: true }).filter((m) => !m.promotion || m.promotion === "q");
  const ref = bestKnown(fen, pieceLines);
  const byUci = new Map(pieceLines.map((l) => [l.pv[0], l]));
  return moves.map((m) => {
    const uci = uciOf(m);
    const line = byUci.get(uci) ?? engine.evalsOf(fen)?.get(uci);
    const g: Graded = { san: m.san, uci, from: m.from, to: m.to, book: bookSans.has(m.san), line };
    if (line && ref) {
      const wp = winPct(line.cp, line.mate, color);
      const drop = ref.wp - wp;
      g.verdict = upgrade(verdictOf(drop, drop < 2), fen, m.from, m.to, wp);
    } else {
      const d = moveDanger(fen, m.from, m.to);
      const extra = extraLoss(fen, m.from, m.to);
      if (d && (d.mate || extra >= 1)) g.danger = { loss: extra, mate: d.mate };
    }
    return g;
  });
}

export function gradedMarks(fen: string, graded: Graded[], useDanger: boolean): SquareMark[] {
  const color = fen.split(" ")[1] as Color;
  const out: SquareMark[] = [];
  for (const g of graded) {
    if (g.verdict && g.line) {
      const e = povEval(g.line, color);
      const sym = g.verdict === "good" ? "" : VERDICT_LABEL[g.verdict].sym;
      out.push({ sq: g.to, from: g.from, kind: `v-${g.verdict}`, share: 1, label: `${g.book ? "📖" : ""}${e.text}`, sym: sym || undefined, tone: e.tone });
    } else if (useDanger && g.danger && !g.book) {
      out.push({ sq: g.to, from: g.from, kind: "danger", share: 1, label: g.danger.mate ? "詰" : `-${g.danger.loss}`, tone: "neg" });
    }
  }
  return out;
}

export interface MoveReview {
  verdict: Verdict | "book";
  wpBefore?: number;
  wpAfter?: number;
  before?: EngineLine;
  after?: EngineLine;
  bestUci?: string;
  bestSan?: string;
  color?: Color;
  line?: EngineLine; // engine line starting with the played move
}

/** Judge the move that led to `fenAfter`, from whatever the engine has seen. */
export function reviewMove(fenBefore: string, fenAfter: string, move: { from: string; to: string; promotion?: string }, isBook: boolean, liveAfter?: EngineLine[]): MoveReview | undefined {
  if (isBook) return { verdict: "book" };
  const color = fenBefore.split(" ")[1] as Color;
  const ref = bestKnown(fenBefore);
  if (!ref) return undefined;
  const uci = uciOf(move);
  const direct = engine.evalsOf(fenBefore)?.get(uci);
  const afterLine = (liveAfter?.length ? liveAfter : engine.cached(fenAfter))?.[0];
  const after = direct ?? (afterLine && afterLine.depth >= 8 ? afterLine : undefined);
  if (!after) {
    if (new Chess(fenAfter).isCheckmate()) return { verdict: "best", wpBefore: ref.wp, wpAfter: 100, color };
    return undefined;
  }
  // The line that starts with the played move: either searched directly, or [move, ...reply line]
  const line: EngineLine = direct ?? { ...after, pv: [uci, ...after.pv] };
  const wpAfter = winPct(after.cp, after.mate, color);
  const drop = ref.wp - wpAfter;
  const bestUci = ref.line.pv[0];
  let bestSan: string | undefined;
  try {
    bestSan = new Chess(fenBefore).move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] }).san;
  } catch {
    /* stale line */
  }
  const verdict = upgrade(verdictOf(drop, uci === bestUci || drop < 2), fenBefore, move.from, move.to, wpAfter);
  return { verdict, wpBefore: ref.wp, wpAfter, before: ref.line, after, bestUci, bestSan, color, line };
}

export const isBad = (v?: string) => v === "inaccuracy" || v === "mistake" || v === "blunder";

export function explainReview(fenBefore: string, r: MoveReview | undefined, move: { from: string; to: string }): Explanation | undefined {
  if (!r || r.verdict === "book") return undefined;
  return explainMove(fenBefore, uciOf(move), r.line, isBad(r.verdict));
}

export function bestMoveArrow(r?: MoveReview): Arrow | undefined {
  if (!r?.bestUci || !["inaccuracy", "mistake", "blunder"].includes(r.verdict)) return;
  return { from: r.bestUci.slice(0, 2), to: r.bestUci.slice(2, 4), color: "#81b64c", width: 15, opacity: 0.9 };
}

export { evalFor };
