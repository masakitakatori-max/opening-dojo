// Rule-based "why" for a move: what it does now (tactics), what it builds (strategy),
// and — the GM view — whether an apparent loss is a sacrifice that the engine line pays back later.
import { Chess, type Color, type Move, type Square } from "chess.js";
import type { EngineLine } from "./engine";
import { extraLoss, moveDanger, VAL } from "./tactics";

export type ReasonKind = "tactic" | "strategy" | "sacrifice" | "defense" | "warning";
export interface Reason {
  kind: ReasonKind;
  horizon: "短期" | "中長期";
  text: string;
}
export interface Explanation {
  reasons: Reason[];
  sacrifice?: { lost: number; payoffPly?: number; payoffSan?: string; mate?: boolean };
  pvSan: string[];
  payoffIndex?: number; // index into pvSan where the idea cashes in
}

const NAME: Record<string, string> = { p: "ポーン", n: "ナイト", b: "ビショップ", r: "ルーク", q: "クイーン", k: "キング" };
const FILES = "abcdefgh";
const CENTER = ["d4", "e4", "d5", "e5"];

function material(c: Chess, color: Color) {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p && p.color === color && p.type !== "k") s += VAL[p.type];
  return s;
}

function attacksFrom(c: Chess, sq: string, color: Color): { sq: string; type: string }[] {
  const out: { sq: string; type: string }[] = [];
  for (const row of c.board()) {
    for (const p of row) {
      if (!p || p.color === color) continue;
      if (c.attackers(p.square, color).includes(sq as Square)) out.push({ sq: p.square, type: p.type });
    }
  }
  return out;
}

function isDefended(c: Chess, sq: string, color: Color) {
  return c.attackers(sq as Square, color).length > 0;
}

function countAttacked(c: Chess, squares: string[], color: Color) {
  return squares.reduce((n, s) => n + (c.attackers(s as Square, color).length ? 1 : 0), 0);
}

function kingZone(c: Chess, color: Color): string[] {
  let k: string | undefined;
  for (const row of c.board()) for (const p of row) if (p && p.type === "k" && p.color === color) k = p.square;
  if (!k) return [];
  const f = FILES.indexOf(k[0]), r = +k[1];
  const z: string[] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    const ff = f + df, rr = r + dr;
    if (ff >= 0 && ff < 8 && rr >= 1 && rr <= 8) z.push(`${FILES[ff]}${rr}`);
  }
  return z;
}

/** Slider through-line: first enemy piece, then the piece behind it. */
function pinOrSkewer(c: Chess, sq: string, type: string, color: Color): Reason | undefined {
  const dirs: [number, number][] = [];
  if (type === "b" || type === "q") dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
  if (type === "r" || type === "q") dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
  const f0 = FILES.indexOf(sq[0]), r0 = +sq[1];
  for (const [df, dr] of dirs) {
    let first: { sq: string; type: string; color: Color } | undefined;
    for (let i = 1; i < 8; i++) {
      const f = f0 + df * i, r = r0 + dr * i;
      if (f < 0 || f > 7 || r < 1 || r > 8) break;
      const s = `${FILES[f]}${r}` as Square;
      const p = c.get(s);
      if (!p) continue;
      if (!first) {
        if (p.color === color) break;
        first = { sq: s, type: p.type, color: p.color };
        continue;
      }
      if (p.color === color) break;
      if (VAL[p.type] > VAL[first.type] && first.type !== "p")
        return { kind: "tactic", horizon: "短期", text: `ピン：${NAME[first.type]}（${first.sq}）が動くと後ろの${NAME[p.type]}（${s}）が取られる${p.type === "k" ? "（動けない絶対ピン）" : ""}` };
      if (VAL[first.type] > VAL[p.type] && first.type !== "k")
        return { kind: "tactic", horizon: "短期", text: `串刺し（スキュア）：${NAME[first.type]}が逃げると後ろの${NAME[p.type]}を取れる` };
      if (first.type === "k" && p.type !== "p")
        return { kind: "tactic", horizon: "短期", text: `串刺し（スキュア）：チェックの後ろの${NAME[p.type]}（${s}）を狙う` };
      break;
    }
  }
  return undefined;
}

function sanLine(fen: string, pv: string[], max = 10): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv.slice(0, max)) {
    try {
      out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
    } catch {
      break;
    }
  }
  return out;
}

/**
 * Explain `uci` played in `fen`. `line` is the engine line that STARTS with this move
 * (its pv[0] === uci) — used for the sacrifice/payoff analysis.
 * `bad` = the move was judged a mistake: lost material is then a loss, never a sacrifice.
 */
const explainMemo = new Map<string, Explanation>();
export function explainMove(fen: string, uci: string, line?: EngineLine, bad = false): Explanation {
  const key = `${fen}|${uci}|${bad}|${line?.depth}|${line?.cp}|${line?.mate}|${line?.pv.join(",")}`;
  let ex = explainMemo.get(key);
  if (!ex) {
    if (explainMemo.size > 5000) explainMemo.clear();
    explainMemo.set(key, (ex = computeExplanation(fen, uci, line, bad)));
  }
  return ex;
}
function computeExplanation(fen: string, uci: string, line: EngineLine | undefined, bad: boolean): Explanation {
  const before = new Chess(fen);
  const me = before.turn();
  const them: Color = me === "w" ? "b" : "w";
  const reasons: Reason[] = [];
  let mv: Move;
  const after = new Chess(fen);
  try {
    mv = after.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || "q" });
  } catch {
    return { reasons, pvSan: [] };
  }
  const pv = line && line.pv[0] === uci ? line.pv : [uci];
  const pvSan = sanLine(fen, pv);
  const ply = before.history().length || +fen.split(" ")[5] * 2;

  // ── sacrifice & payoff along the engine line (the GM view) ──
  const startDiff = material(before, me) - material(before, them);
  const sim = new Chess(fen);
  let minDiff = startDiff;
  let payoffIndex: number | undefined;
  let mateAt: number | undefined;
  for (let i = 0; i < pv.length && i < 12; i++) {
    try {
      sim.move({ from: pv[i].slice(0, 2), to: pv[i].slice(2, 4), promotion: pv[i][4] });
    } catch {
      break;
    }
    if (sim.isCheckmate()) {
      mateAt = i;
      break;
    }
    const d = material(sim, me) - material(sim, them);
    minDiff = Math.min(minDiff, d);
    if (minDiff <= startDiff - 1 && d >= startDiff && payoffIndex === undefined && i % 2 === 0) payoffIndex = i;
  }
  const danger = moveDanger(fen, mv.from, mv.to);
  // Material offered beyond what the safest move would lose (0 when the loss is unavoidable anyway).
  const lost = extraLoss(fen, mv.from, mv.to);
  const mateForMe = line?.mate !== undefined && (me === "w" ? line.mate > 0 : line.mate < 0);
  let sacrifice: Explanation["sacrifice"];
  if (!bad && lost >= 1 && (mateForMe || mateAt !== undefined || payoffIndex !== undefined || (line && evalFor(line, me) > -0.5))) {
    if (mateAt !== undefined) {
      sacrifice = { lost, mate: true, payoffPly: mateAt, payoffSan: pvSan[mateAt] };
      reasons.push({ kind: "sacrifice", horizon: "短期", text: `サクリファイス：${lost}点分を捨てて、${Math.ceil((mateAt + 1) / 2)}手後に ${pvSan[mateAt]} で詰み` });
    } else if (payoffIndex !== undefined) {
      sacrifice = { lost, payoffPly: payoffIndex, payoffSan: pvSan[payoffIndex] };
      reasons.push({ kind: "sacrifice", horizon: "短期", text: `サクリファイス（戦術）：一見${lost}点損だが、${Math.ceil((payoffIndex + 1) / 2)}手後の ${pvSan[payoffIndex]} で取り返す` });
    } else {
      sacrifice = { lost };
      reasons.push({ kind: "sacrifice", horizon: "中長期", text: `ポジショナル・サクリファイス：${lost}点損でも、主導権・攻撃・陣形の代償でエンジン評価は ${fmt(evalFor(line!, me))}（自分から見て）` });
    }
  }
  if (mateForMe && !sacrifice) reasons.push({ kind: "tactic", horizon: "短期", text: `詰み筋：${Math.abs(line!.mate!)}手で詰む` });

  // ── short-term tactics ──
  if (after.isCheckmate()) reasons.push({ kind: "tactic", horizon: "短期", text: "チェックメイト" });
  else if (mv.san.includes("+")) reasons.push({ kind: "tactic", horizon: "短期", text: "チェック：相手の応手を限定し、テンポを得る" });
  if (mv.captured) {
    const gain = VAL[mv.captured] - (danger && !danger.mate && danger.sq === mv.to ? VAL[mv.piece] : 0);
    if (gain > 0 && (!danger || danger.loss <= 0)) reasons.push({ kind: "tactic", horizon: "短期", text: `駒得：${NAME[mv.captured]}をタダ（または得な交換）で取る` });
    else if (VAL[mv.captured] === VAL[mv.piece]) reasons.push({ kind: "strategy", horizon: "中長期", text: `交換：${NAME[mv.captured]}同士を交換して局面を整理` });
  }
  // threats from the moved piece
  const hits = attacksFrom(after, mv.to, me).filter((t) => t.type !== "k" && (VAL[t.type] > VAL[mv.piece] || !isDefended(after, t.sq, them)));
  // A check by the moved piece counts as one of the two targets (the most common fork of all).
  let theirKing: string | undefined;
  for (const row of after.board()) for (const p of row) if (p && p.type === "k" && p.color === them) theirKing = p.square;
  const checksKing = !!theirKing && after.attackers(theirKing as Square, me).includes(mv.to as Square);
  const targets = [...(checksKing ? ["キング"] : []), ...hits.map((h) => `${NAME[h.type]}（${h.sq}）`)];
  if (targets.length >= 2) reasons.push({ kind: "tactic", horizon: "短期", text: `両取り（フォーク）：${targets.join("と")}を同時に狙う` });
  else if (hits.length === 1 && !mv.captured) reasons.push({ kind: "tactic", horizon: "短期", text: `当たり：${NAME[hits[0].type]}（${hits[0].sq}）を狙う` });
  // discovered attacks
  const discovered: string[] = [];
  for (const row of after.board()) for (const p of row) {
    if (!p || p.color !== them || p.type === "k") continue;
    const nowA = after.attackers(p.square, me).filter((s) => s !== mv.to);
    const wasA = before.attackers(p.square, me);
    if (nowA.some((s) => !wasA.includes(s)) && VAL[p.type] >= 3) discovered.push(`${NAME[p.type]}（${p.square}）`);
  }
  if (discovered.length) reasons.push({ kind: "tactic", horizon: "短期", text: `ディスカバード・アタック：動いた駒の後ろから${discovered.join("・")}に利きが通る` });
  if (["b", "r", "q"].includes(mv.piece)) {
    const ps = pinOrSkewer(after, mv.to, mv.piece, me);
    if (ps) reasons.push(ps);
  }

  // ── defense ──
  const wasAttacked = before.attackers(mv.from as Square, them).length > 0;
  const wasDefended = before.attackers(mv.from as Square, me).length > 0;
  if (wasAttacked && (!wasDefended || before.attackers(mv.from as Square, them).some((s) => VAL[before.get(s)!.type] < VAL[mv.piece])) && mv.piece !== "p")
    reasons.push({ kind: "defense", horizon: "短期", text: `当たりから逃げる：${NAME[mv.piece]}が取られそうだった` });
  if (before.inCheck()) reasons.push({ kind: "defense", horizon: "短期", text: "チェックを受ける" });

  // ── long-term strategy ──
  const opening = ply < 30;
  if (mv.san === "O-O" || mv.san === "O-O-O") reasons.push({ kind: "strategy", horizon: "中長期", text: `キャスリング：キングを安全にし、ルークを中央へ${mv.san === "O-O-O" ? "（反対側キャスリングなら攻め合いの合図）" : ""}` });
  const backRank = me === "w" ? "1" : "8";
  if (opening && (mv.piece === "n" || mv.piece === "b") && mv.from[1] === backRank) reasons.push({ kind: "strategy", horizon: "中長期", text: `展開：${NAME[mv.piece]}を戦いに参加させる` });
  if (mv.piece === "b" && ["g2", "b2", "g7", "b7"].includes(mv.to)) reasons.push({ kind: "strategy", horizon: "中長期", text: "フィアンケット：長い対角線を支配する" });
  const cBefore = countAttacked(before, CENTER, me), cAfter = countAttacked(after, CENTER, me);
  if ((mv.piece === "p" && CENTER.includes(mv.to)) || cAfter > cBefore) reasons.push({ kind: "strategy", horizon: "中長期", text: "中央の支配：d4・e4・d5・e5 への利きを増やす" });
  const rel = me === "w" ? +mv.to[1] : 9 - +mv.to[1];
  if (mv.piece === "p" && rel >= 5 && !mv.captured) reasons.push({ kind: "strategy", horizon: "中長期", text: "スペースを取る：ポーンを前進させて相手の駒の居場所を狭める" });
  if (mv.piece === "p") {
    const f = FILES.indexOf(mv.to[0]);
    let passed = true;
    for (const row of after.board()) for (const p of row) {
      if (!p || p.type !== "p" || p.color !== them) continue;
      const pf = FILES.indexOf(p.square[0]);
      const ahead = me === "w" ? +p.square[1] > +mv.to[1] : +p.square[1] < +mv.to[1];
      if (Math.abs(pf - f) <= 1 && ahead) passed = false;
    }
    if (passed && rel >= 4) reasons.push({ kind: "strategy", horizon: "中長期", text: "パスポーン：止める敵ポーンがいない。終盤の切り札" });
  }
  if (mv.piece === "r") {
    let own = 0, theirs = 0;
    for (let r = 1; r <= 8; r++) {
      const p = after.get(`${mv.to[0]}${r}` as Square);
      if (p?.type === "p") p.color === me ? own++ : theirs++;
    }
    if (own === 0) reasons.push({ kind: "strategy", horizon: "中長期", text: theirs === 0 ? "オープンファイル：ポーンのない列をルークで支配" : "セミオープンファイル：相手ポーンに圧力をかける" });
  }
  if ((mv.piece === "n" || mv.piece === "b") && rel >= 4 && rel <= 6) {
    const f = FILES.indexOf(mv.to[0]);
    const pawnDefended = after.attackers(mv.to as Square, me).some((s) => after.get(s)?.type === "p");
    let chased = false;
    for (const row of after.board()) for (const p of row) {
      if (!p || p.type !== "p" || p.color !== them) continue;
      const pf = FILES.indexOf(p.square[0]);
      const ahead = me === "w" ? +p.square[1] > +mv.to[1] : +p.square[1] < +mv.to[1];
      if (Math.abs(pf - f) === 1 && ahead) chased = true;
    }
    if (pawnDefended && !chased) reasons.push({ kind: "strategy", horizon: "中長期", text: `アウトポスト：敵ポーンに追い払われない拠点に${NAME[mv.piece]}を置く` });
  }
  const kz = kingZone(after, them);
  const kzBefore = countAttacked(before, kz, me), kzAfter = countAttacked(after, kz, me);
  if (kzAfter - kzBefore >= 2) reasons.push({ kind: "strategy", horizon: "中長期", text: "キング攻撃の準備：相手キングの周りへの利きを増やす" });

  // ── warnings ──
  if (danger && !sacrifice && (danger.mate || lost >= 1)) {
    reasons.push({ kind: "warning", horizon: "短期", text: danger.mate ? "危険：相手に1手詰みを許す" : `危険：差し引き${lost}点の駒損${danger.sq ? `（${danger.sq} の駒が取られる）` : ""}` });
  }
  if (!reasons.length) reasons.push({ kind: "strategy", horizon: "中長期", text: "静かな改善手：駒の配置を良くし、相手の狙いを消す（読み筋を参照）" });

  return { reasons: dedupe(reasons), sacrifice, pvSan, payoffIndex: sacrifice?.payoffPly };
}

function dedupe(rs: Reason[]) {
  const seen = new Set<string>();
  return rs.filter((r) => (seen.has(r.text) ? false : (seen.add(r.text), true)));
}

/** Eval in pawns from `color`'s point of view. */
export function evalFor(l: EngineLine, color: Color) {
  if (l.mate !== undefined) return (l.mate > 0 ? 1 : -1) * (color === "w" ? 1 : -1) * 99;
  return ((l.cp ?? 0) / 100) * (color === "w" ? 1 : -1);
}
const fmt = (v: number) => (Math.abs(v) >= 99 ? (v > 0 ? "詰みあり" : "詰まされる") : `${v > 0 ? "+" : ""}${v.toFixed(1)}`);

export const KIND_LABEL: Record<ReasonKind, string> = { tactic: "戦術", strategy: "戦略", sacrifice: "犠牲", defense: "受け", warning: "危険" };
