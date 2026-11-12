// Draw what a move does, for the trophy demo board: check lines, what is attacked, pins and skewers,
// who supports the moved piece, and — for a mate — why each escape square is closed.
import { Chess, type Color, type Square } from "chess.js";
import type { Arrow, SquareMark } from "../components/Board";
import { explainMove } from "./explain";

const FILES = "abcdefgh";
const F = (s: string) => FILES.indexOf(s[0]);
const R = (s: string) => +s[1];
const SQ = (f: number, r: number) => `${FILES[f]}${r}` as Square;
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 1 && r <= 8;
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };

const RED = "#e0443e", ORANGE = "#ff9a2e", PURPLE = "#c58af9", GREEN = "#81b64c", BLUE = "#4f8ef7";

export interface Picture {
  arrows: Arrow[];
  marks: SquareMark[];
  notes: string[];
  legend: { color: string; text: string }[];
}

function pieces(c: Chess, color: Color) {
  const out: { square: Square; type: string }[] = [];
  for (const row of c.board()) for (const p of row) if (p && p.color === color) out.push({ square: p.square, type: p.type });
  return out;
}
function ray(c: Chess, from: string, df: number, dr: number) {
  const out: { square: Square; type: string; color: Color }[] = [];
  for (let i = 1; i < 8 && out.length < 2; i++) {
    const f = F(from) + df * i, r = R(from) + dr * i;
    if (!onBoard(f, r)) break;
    const p = c.get(SQ(f, r));
    if (p) out.push({ square: SQ(f, r), type: p.type, color: p.color });
  }
  return out;
}
/** Squares a piece standing on `sq` attacks (empty or not). */
function controls(c: Chess, sq: Square, color: Color): Square[] {
  const out: Square[] = [];
  for (let f = 0; f < 8; f++) for (let r = 1; r <= 8; r++) {
    const s = SQ(f, r);
    if (s !== sq && c.attackers(s, color).includes(sq)) out.push(s);
  }
  return out;
}

/**
 * `trophy` tunes the picture (e.g. a knight's eight squares for the octopus).
 * `show` = squares that make up a formation, highlighted as its shape.
 */
export function illustrate(fenBefore: string, m: { from: string; to: string; promotion?: string }, trophy?: string, show?: string[]): Picture {
  const after = new Chess(fenBefore);
  let mv;
  try {
    mv = after.move(m);
  } catch {
    return { arrows: [], marks: [], notes: [], legend: [] };
  }
  const me = mv.color, them: Color = me === "w" ? "b" : "w";
  const arrows: Arrow[] = [];
  const marks: SquareMark[] = [];
  const used = new Set<string>();
  const arrow = (from: string, to: string, color: string, width: number, opacity = 0.85, dash = false) => {
    const k = `${from}${to}`;
    if (used.has(k)) return;
    used.add(k);
    arrows.push({ from, to, color, width, opacity, dash });
  };
  const legend = new Map<string, string>();
  const king = pieces(after, them).find((p) => p.type === "k")?.square;

  // 1) check lines
  const checkers = king ? after.attackers(king, me) : [];
  for (const c of checkers) arrow(c, king!, RED, 15);
  if (checkers.length) legend.set(RED, "チェックの線");

  // 2) what the moved piece hits
  for (const t of pieces(after, them)) {
    if (t.type === "k" || t.square === king) continue;
    if (!after.attackers(t.square, me).includes(mv.to as Square)) continue;
    const loose = after.attackers(t.square, them).length === 0;
    if (t.type !== "p" && (VAL[t.type] > VAL[mv.piece] || loose)) {
      arrow(mv.to, t.square, ORANGE, 11);
      legend.set(ORANGE, "狙っている駒");
    }
  }

  // 3) pins and skewers along the moved piece's lines
  if ("brq".includes(mv.piece)) {
    const dirs: [number, number][] = [];
    if (mv.piece !== "r") dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
    if (mv.piece !== "b") dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
    for (const [df, dr] of dirs) {
      const [a, b] = ray(after, mv.to, df, dr);
      if (!a || !b || a.color !== them || b.color !== them) continue;
      if (VAL[b.type] > VAL[a.type] && a.type !== "p") {
        arrow(mv.to, b.square, PURPLE, 7, 0.75, true);
        marks.push({ sq: a.square, from: a.square, kind: "rare", share: 1, label: "動けない" });
        legend.set(PURPLE, "ピン（後ろの駒が取られる線）");
      } else if (a.type === "k" || VAL[a.type] > VAL[b.type]) {
        arrow(mv.to, b.square, PURPLE, 7, 0.75, true);
        legend.set(PURPLE, "串刺し（逃げたら後ろを取る線）");
      }
    }
  }

  // 4) the shape a piece now controls
  if (trophy === "octopus" || trophy === "outpost") {
    for (const s of controls(after, mv.to as Square, me)) marks.push({ sq: s, from: mv.to, kind: "ok", share: 0.8 });
    legend.set("#ffce40", "ナイトが押さえるマス");
  }
  if (trophy === "fianchetto" || trophy === "doubleFianchetto" || trophy === "battery") {
    for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
      let end: Square | undefined;
      for (let i = 1; i < 8; i++) {
        const f = F(mv.to) + df * i, r = R(mv.to) + dr * i;
        if (!onBoard(f, r)) break;
        end = SQ(f, r);
        const p = after.get(end);
        if (p && !(trophy === "battery" && p.color === me && (p.type === "b" || p.type === "q"))) break;
      }
      if (end && Math.max(Math.abs(F(end) - F(mv.to)), Math.abs(R(end) - R(mv.to))) >= 3) arrow(mv.to, end, BLUE, 8, 0.7, true);
    }
    legend.set(BLUE, trophy === "battery" ? "バッテリーの照準" : "長い対角線");
  }
  if (trophy === "rook7" || trophy === "pigs" || trophy === "doubledRooks" || trophy === "gun") {
    for (const [df, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
      let end: Square | undefined;
      for (let i = 1; i < 8; i++) {
        const f = F(mv.to) + df * i, r = R(mv.to) + dr * i;
        if (!onBoard(f, r)) break;
        end = SQ(f, r);
        const p = after.get(end);
        if (p && !(p.color === me && "rq".includes(p.type))) break;
      }
      if (end && Math.max(Math.abs(F(end) - F(mv.to)), Math.abs(R(end) - R(mv.to))) >= 2) arrow(mv.to, end, BLUE, 8, 0.7, true);
    }
    legend.set(BLUE, "ルークの利き");
  }

  // 5) the moved piece's support
  for (const s of after.attackers(mv.to as Square, me)) {
    if (s === mv.to) continue;
    arrow(s, mv.to, GREEN, 6, 0.75, true);
    legend.set(GREEN, "その駒を守る味方");
  }

  // 6) a mate: why every escape square is closed
  if (after.isCheckmate() && king) {
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const f = F(king) + df, r = R(king) + dr;
      if (!onBoard(f, r)) continue;
      const s = SQ(f, r);
      const p = after.get(s);
      if (p && p.color === them) marks.push({ sq: s, from: s, kind: "rare", share: 1, label: "壁" });
      else marks.push({ sq: s, from: s, kind: "danger", share: 1, label: "×" });
    }
    legend.set("#ca3431", "× 逃げ道に利いている／壁 自分の駒でふさがっている");
  }

  // 7) a formation's squares
  for (const s of show ?? []) if (!marks.some((x) => x.sq === s)) marks.push({ sq: s, from: s, kind: "v-best", share: 1, label: "形" });
  if (show?.length) legend.set(GREEN, "形をつくる駒");

  const ex = explainMove(fenBefore, mv.from + mv.to + (mv.promotion ?? ""));
  return { arrows, marks, notes: ex.reasons.slice(0, 3).map((r) => `${r.horizon}・${r.text}`), legend: [...legend.entries()].map(([color, text]) => ({ color, text })) };
}
