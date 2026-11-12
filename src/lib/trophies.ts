// 芸術点: named moves, formations, mating patterns and openings, recognised from the board alone.
// A move earns the points only when it is played without assists.
import { Chess, type Color, type Move, type Square } from "chess.js";
import { load, save } from "./storage";
import { extraLoss } from "./tactics";
import { getNode, openingChain } from "./tree";

export type TrophyCat = "特別な手" | "戦術" | "陣形・構え" | "詰みの型" | "型（定跡）";
export interface TrophyDef {
  id: string;
  cat: TrophyCat;
  ja: string;
  pts: number;
  what: string;
}

export const TROPHIES: TrophyDef[] = [
  { id: "castle", cat: "特別な手", ja: "キャスリング", pts: 2, what: "キングを囲い、ルークを中央へ出す。" },
  { id: "castleLong", cat: "特別な手", ja: "クイーンサイド・キャスリング", pts: 3, what: "クイーン側に囲う。ルークがすぐ d 列に出る攻撃的な囲い。" },
  { id: "oppositeCastle", cat: "特別な手", ja: "反対側キャスリング", pts: 3, what: "相手と反対の側に囲う。互いにポーンを突いて攻め合う合図。" },
  { id: "enPassant", cat: "特別な手", ja: "アンパッサン", pts: 3, what: "2 マス進んで横をすり抜けたポーンを、通過中のものとして取る。" },
  { id: "promotion", cat: "特別な手", ja: "プロモーション", pts: 5, what: "ポーンを最終段まで進めて、クイーンなどに昇格させる。" },
  { id: "brilliant", cat: "特別な手", ja: "妙手（!!）", pts: 10, what: "一見は駒損なのに、エンジンが良い手と認める捨て駒。" },

  { id: "pin", cat: "戦術", ja: "ピン", pts: 2, what: "動くと後ろのキングやクイーンが取られる駒を、釘付けにする。" },
  { id: "fork", cat: "戦術", ja: "フォーク（両取り）", pts: 3, what: "1 つの駒で 2 つ以上を同時に狙う。" },
  { id: "royalFork", cat: "戦術", ja: "ロイヤル・フォーク", pts: 8, what: "ナイトでキングとクイーンを同時に狙う。" },
  { id: "skewer", cat: "戦術", ja: "スキュア（串刺し）", pts: 4, what: "価値の高い駒を攻めて逃がし、その後ろの駒を取る。" },
  { id: "discovered", cat: "戦術", ja: "ディスカバード・チェック", pts: 4, what: "駒をどかして、後ろの駒でチェックをかける。" },
  { id: "doubleCheck", cat: "戦術", ja: "ダブルチェック", pts: 6, what: "2 つの駒で同時にチェック。相手はキングを動かすしかない。" },
  { id: "greekGift", cat: "戦術", ja: "グリーク・ギフト（Bxh7+）", pts: 8, what: "ビショップを h7（h2）に捨てて、囲ったキングを引きずり出す古典的な捨て駒。" },

  { id: "fianchetto", cat: "陣形・構え", ja: "フィアンケット", pts: 2, what: "ビショップを g2・b2（g7・b7）に据えて、長い対角線を支配する。" },
  { id: "doubleFianchetto", cat: "陣形・構え", ja: "ダブル・フィアンケット", pts: 4, what: "両方のビショップをフィアンケットにする。" },
  { id: "modelOpening", cat: "陣形・構え", ja: "模範的な展開", pts: 3, what: "10 手目までに、小駒 4 枚を出してキャスリングまで済ませる。" },
  { id: "connected", cat: "陣形・構え", ja: "ルークの連結", pts: 2, what: "最下段の 2 つのルークの間に駒がなく、互いに守り合う。" },
  { id: "rook7", cat: "陣形・構え", ja: "7 段目のルーク", pts: 3, what: "ルークを 7 段目に入れて、ポーンを横から攻め、キングを閉じ込める。" },
  { id: "pigs", cat: "陣形・構え", ja: "7 段目の豚（ルーク 2 枚）", pts: 10, what: "ルーク 2 枚を 7 段目に並べる。何でも食べ尽くすので「豚」。" },
  { id: "outpost", cat: "陣形・構え", ja: "アウトポストのナイト", pts: 4, what: "敵陣の、ポーンに守られ、敵ポーンに追い払われないマスにナイトを置く。" },
  { id: "passed", cat: "陣形・構え", ja: "パスポーン", pts: 3, what: "前にも隣の列にも止める敵ポーンがいないポーンを、5 段目以上に作る。" },
  { id: "london", cat: "陣形・構え", ja: "ロンドン型", pts: 4, what: "Bf4・d4・e3・Nf3 の形（黒なら Bf5・d5・e6・Nf6）。" },
  { id: "kingsIndian", cat: "陣形・構え", ja: "キングズ・インディアン型", pts: 4, what: "Nf3・g3・Bg2・d3 と囲いの形（黒なら Nf6・g6・Bg7・d6）。" },
  { id: "stonewall", cat: "陣形・構え", ja: "ストーンウォール", pts: 5, what: "c3・d4・e3・f4（黒なら c6・d5・e6・f5）の石の壁。" },
  { id: "maroczy", cat: "陣形・構え", ja: "マロツィ・バインド", pts: 6, what: "c4 と e4 のポーンで d5 を押さえ込む（d ポーンは交換済み）。" },
  { id: "hedgehog", cat: "陣形・構え", ja: "ヘッジホッグ", pts: 8, what: "a6・b6・d6・e6 に低く構える針ねずみの陣（c ポーンは交換済み）。" },
  { id: "gun", cat: "陣形・構え", ja: "アレヒンの銃", pts: 20, what: "同じ列に、ルーク 2 枚の後ろにクイーンを並べる三段重ね。" },

  { id: "mate", cat: "詰みの型", ja: "チェックメイト", pts: 10, what: "相手のキングを詰ます。" },
  { id: "scholar", cat: "詰みの型", ja: "学者のメイト", pts: 5, what: "序盤にクイーンで f7（f2）を取って詰ます。" },
  { id: "fools", cat: "詰みの型", ja: "フールズ・メイト", pts: 10, what: "3 手以内の詰み。" },
  { id: "kiss", cat: "詰みの型", ja: "クイーンの接吻", pts: 10, what: "守られたクイーンを、キングの隣に置いて詰ます。" },
  { id: "backRank", cat: "詰みの型", ja: "バックランク・メイト", pts: 15, what: "自分のポーンに閉じ込められた最下段のキングを、ルークかクイーンで詰ます。" },
  { id: "ladder", cat: "詰みの型", ja: "はしご詰め", pts: 15, what: "ルークやクイーン 2 枚で、隣り合う 2 列を押さえて端のキングを詰ます。" },
  { id: "knightMate", cat: "詰みの型", ja: "ナイトのメイト", pts: 15, what: "ナイトのチェックで詰ます。" },
  { id: "pawnMate", cat: "詰みの型", ja: "ポーンのメイト", pts: 25, what: "ポーンのチェックで詰ます。" },
  { id: "doubleCheckMate", cat: "詰みの型", ja: "ダブルチェック・メイト", pts: 30, what: "2 つの駒の同時チェックで詰ます。" },
  { id: "epaulette", cat: "詰みの型", ja: "エポレット・メイト", pts: 30, what: "キングの両肩を自分の駒がふさいでいるところを詰ます（肩章のメイト）。" },
  { id: "arabian", cat: "詰みの型", ja: "アラビアン・メイト", pts: 30, what: "隅のキングを、ナイトに守られたルークで詰ます。" },
  { id: "anastasia", cat: "詰みの型", ja: "アナスタシアのメイト", pts: 40, what: "端の列のキングを、ナイトが逃げ道を消し、ルークかクイーンが列で詰ます。" },
  { id: "boden", cat: "詰みの型", ja: "ボーデンのメイト", pts: 50, what: "2 枚のビショップが交差する対角線で詰ます。" },
  { id: "legal", cat: "詰みの型", ja: "レガルのメイト", pts: 50, what: "f7 のビショップと 2 枚のナイトで、e7 のキングを詰ます。" },
  { id: "smothered", cat: "詰みの型", ja: "窒息メイト（スマザード）", pts: 50, what: "味方の駒に囲まれて動けないキングを、ナイトで詰ます。" },
  { id: "castleMate", cat: "詰みの型", ja: "キャスリング・メイト", pts: 60, what: "キャスリングの一手で詰ます。" },
];
const DEF = new Map(TROPHIES.map((t) => [t.id, t]));

export interface Award {
  id: string;
  cat: TrophyCat;
  ja: string;
  pts: number;
}
const award = (id: string): Award => {
  const d = DEF.get(id)!;
  return { id, cat: d.cat, ja: d.ja, pts: d.pts };
};

// ── board helpers ──
const FILES = "abcdefgh";
const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
const F = (s: string) => FILES.indexOf(s[0]);
const R = (s: string) => +s[1];
const SQ = (f: number, r: number) => `${FILES[f]}${r}` as Square;
const onBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 1 && r <= 8;
const rel = (c: Color, rank: number) => (c === "w" ? rank : 9 - rank);
/** A square given from White's point of view, mirrored for Black. */
const mine = (c: Color, sq: string) => (c === "w" ? sq : `${sq[0]}${9 - +sq[1]}`) as Square;
const is = (c: Chess, sq: Square, color: Color, type: string) => {
  const p = c.get(sq);
  return !!p && p.color === color && p.type === type;
};
function all(c: Chess, color: Color, type?: string) {
  const out: { square: Square; type: string }[] = [];
  for (const row of c.board()) for (const p of row) if (p && p.color === color && (!type || p.type === type)) out.push({ square: p.square, type: p.type });
  return out;
}
const kingOf = (c: Chess, color: Color) => all(c, color, "k")[0]?.square;
function neighbors(sq: string): Square[] {
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) if ((df || dr) && onBoard(F(sq) + df, R(sq) + dr)) out.push(SQ(F(sq) + df, R(sq) + dr));
  return out;
}
/** Pieces met along a ray from `from`, nearest first (at most two). */
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

// ── formations (true/false for one side) ──
const castledShort = (c: Chess, me: Color) => is(c, mine(me, "g1"), me, "k") && is(c, mine(me, "f1"), me, "r");
const castledLong = (c: Chess, me: Color) => is(c, mine(me, "c1"), me, "k") && is(c, mine(me, "d1"), me, "r");
const fianchettoAt = (c: Chess, me: Color, file: "b" | "g") => is(c, mine(me, `${file}2`), me, "b") && is(c, mine(me, `${file}3`), me, "p");
const FORM: Record<string, (c: Chess, me: Color) => boolean> = {
  doubleFianchetto: (c, me) => fianchettoAt(c, me, "b") && fianchettoAt(c, me, "g"),
  london: (c, me) => is(c, mine(me, "f4"), me, "b") && is(c, mine(me, "d4"), me, "p") && is(c, mine(me, "e3"), me, "p") && is(c, mine(me, "f3"), me, "n"),
  kingsIndian: (c, me) => is(c, mine(me, "f3"), me, "n") && fianchettoAt(c, me, "g") && is(c, mine(me, "d3"), me, "p") && castledShort(c, me),
  stonewall: (c, me) => ["c3", "d4", "e3", "f4"].every((s) => is(c, mine(me, s), me, "p")),
  maroczy: (c, me) => is(c, mine(me, "c4"), me, "p") && is(c, mine(me, "e4"), me, "p") && !all(c, me, "p").some((p) => p.square[0] === "d") && !all(c, me === "w" ? "b" : "w", "p").some((p) => p.square[0] === "c"),
  hedgehog: (c, me) => ["a3", "b3", "d3", "e3"].every((s) => is(c, mine(me, s), me, "p")) && !all(c, me, "p").some((p) => p.square[0] === "c"),
  modelOpening: (c, me) => +c.fen().split(" ")[5] <= 11 && (castledShort(c, me) || castledLong(c, me)) && !["b1", "g1"].some((s) => is(c, mine(me, s), me, "n")) && !["c1", "f1"].some((s) => is(c, mine(me, s), me, "b")),
  connected: (c, me) => {
    const rs = all(c, me, "r").filter((r) => rel(me, R(r.square)) === 1);
    if (rs.length !== 2) return false;
    const [a, b] = rs.map((r) => F(r.square)).sort((x, y) => x - y);
    for (let f = a + 1; f < b; f++) if (c.get(SQ(f, R(rs[0].square)))) return false;
    return true;
  },
  pigs: (c, me) => all(c, me, "r").filter((r) => rel(me, R(r.square)) === 7).length >= 2,
  gun: (c, me) => {
    const q = all(c, me, "q")[0];
    const rs = all(c, me, "r").filter((r) => q && r.square[0] === q.square[0]);
    if (!q || rs.length !== 2) return false;
    const ranks = [q, ...rs].map((p) => rel(me, R(p.square))).sort((x, y) => x - y);
    if (rel(me, R(q.square)) !== ranks[0]) return false; // the queen sits behind both rooks
    for (let r = ranks[0] + 1; r < ranks[2]; r++) {
      const p = c.get(SQ(F(q.square), me === "w" ? r : 9 - r));
      if (p && !(p.color === me && p.type === "r")) return false;
    }
    return true;
  },
  passed: (c, me) => {
    const them = me === "w" ? "b" : "w";
    const foes = all(c, them, "p");
    return all(c, me, "p").some((p) => rel(me, R(p.square)) >= 5 && !foes.some((e) => Math.abs(F(e.square) - F(p.square)) <= 1 && rel(me, R(e.square)) > rel(me, R(p.square))));
  },
};

/** Named things achieved by this move (ids are unique; the caller decides what counts). */
export function detect(fenBefore: string, m: { from: string; to: string; promotion?: string }): Award[] {
  const before = new Chess(fenBefore);
  const after = new Chess(fenBefore);
  let mv: Move;
  try {
    mv = after.move(m);
  } catch {
    return [];
  }
  const me = mv.color;
  const them: Color = me === "w" ? "b" : "w";
  const out = new Set<string>();
  const safe = extraLoss(fenBefore, mv.from, mv.to) === 0; // the move doesn't simply drop material
  const castle = mv.flags.includes("k") || mv.flags.includes("q");
  const theirKing = kingOf(after, them);

  // special moves
  if (mv.flags.includes("k")) out.add("castle");
  if (mv.flags.includes("q")) out.add("castleLong");
  if (castle && ((castledShort(after, me) && castledLong(after, them)) || (castledLong(after, me) && castledShort(after, them)))) out.add("oppositeCastle");
  if (mv.flags.includes("e")) out.add("enPassant");
  if (mv.promotion) out.add("promotion");

  // tactics
  if (safe) {
    const hit = all(after, them).filter((p) => after.attackers(p.square, me).includes(mv.to as Square));
    const targets = hit.filter((p) => p.type === "k" || (p.type !== "p" && (VAL[p.type] > VAL[mv.piece] || after.attackers(p.square, them).length === 0)));
    if (targets.length >= 2) out.add(mv.piece === "n" && targets.some((t) => t.type === "k") && targets.some((t) => t.type === "q") ? "royalFork" : "fork");
    if ("brq".includes(mv.piece)) {
      const dirs: [number, number][] = [];
      if (mv.piece !== "r") dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
      if (mv.piece !== "b") dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]);
      for (const [df, dr] of dirs) {
        const [a, b] = ray(after, mv.to, df, dr);
        if (!a || !b || a.color !== them || b.color !== them) continue;
        const hitsBack = after.attackers(mv.to as Square, them).includes(a.square);
        if (a.type !== "k" && !hitsBack && (b.type === "k" || (b.type === "q" && mv.piece !== "q" && a.type !== "p"))) out.add("pin");
        else if ((a.type === "k" && b.type !== "p") || (a.type === "q" && mv.piece !== "q" && b.type !== "p" && b.type !== "q")) out.add("skewer");
      }
    }
  }
  if (theirKing && after.inCheck() && !castle) {
    const checkers = after.attackers(theirKing, me);
    if (checkers.length >= 2) out.add("doubleCheck");
    else if (checkers.length === 1 && checkers[0] !== mv.to) out.add("discovered");
  }
  if (mv.piece === "b" && mv.captured === "p" && mv.san.includes("+") && mv.to === mine(me, "h7") && theirKing === mine(me, "g8")) out.add("greekGift");

  // formations: only at the move that completes them
  if (mv.piece === "b" && (fianchettoAt(after, me, "b") || fianchettoAt(after, me, "g")) && rel(me, R(mv.to)) === 2) out.add("fianchetto");
  for (const [id, f] of Object.entries(FORM)) if (f(after, me) && !f(before, me)) out.add(id);
  if (mv.piece === "r" && rel(me, R(mv.to)) === 7) out.add("rook7");
  if (safe && mv.piece === "n" && [5, 6].includes(rel(me, R(mv.to))) && F(mv.to) >= 2 && F(mv.to) <= 5) {
    const supported = after.attackers(mv.to as Square, me).some((s) => after.get(s)?.type === "p");
    const chased = all(after, them, "p").some((p) => Math.abs(F(p.square) - F(mv.to)) === 1 && rel(me, R(p.square)) > rel(me, R(mv.to)));
    if (supported && !chased) out.add("outpost");
  }

  // mating patterns
  if (theirKing && after.isCheckmate()) {
    out.add("mate");
    const k = theirKing;
    const checkers = after.attackers(k, me);
    const chk = checkers[0];
    const t = after.get(chk)?.type ?? "";
    const own = (s: Square) => after.get(s)?.color === them;
    const nb = neighbors(k);
    const heavy = t === "r" || t === "q";
    const back = them === "w" ? 1 : 8;
    const plies = (+fenBefore.split(" ")[5] - 1) * 2 + (me === "w" ? 1 : 2);
    if (plies <= 6) out.add("fools");
    if (castle) out.add("castleMate");
    if (checkers.length >= 2) out.add("doubleCheckMate");
    if (t === "p") out.add("pawnMate");
    if (t === "n") {
      if (nb.every(own)) out.add("smothered");
      else if (is(after, mine(me, "f7"), me, "b") && k === mine(me, "e7")) out.add("legal");
      else out.add("knightMate");
    }
    const front = nb.filter((s) => R(s) !== R(k));
    const sides = nb.filter((s) => R(s) === R(k));
    let backRank = false;
    if (heavy && R(k) === back && R(chk) === back && front.length > 0 && front.every(own)) {
      backRank = true;
      out.add("backRank");
    }
    if (heavy && !backRank) {
      const edgeRank = R(k) === 1 || R(k) === 8, edgeFile = F(k) === 0 || F(k) === 7;
      const others = all(after, me).filter((p) => (p.type === "r" || p.type === "q") && p.square !== chk);
      const nextRank = R(k) === 1 ? 2 : 7, nextFile = F(k) === 0 ? 1 : 6;
      if ((edgeRank && R(chk) === R(k) && others.some((p) => R(p.square) === nextRank)) || (edgeFile && F(chk) === F(k) && others.some((p) => F(p.square) === nextFile))) out.add("ladder");
      // the mating piece stands off, facing the king; both "shoulders" are the king's own pieces
      if (edgeRank && !nb.includes(chk) && sides.length === 2 && sides.every(own) && !front.every(own)) out.add("epaulette");
    }
    if (t === "q" && chk === mine(me, "f7") && k === mine(me, "e8") && plies <= 16) out.add("scholar");
    else if (t === "q" && nb.includes(chk) && after.attackers(chk, me).length > 0) out.add("kiss");
    const corner = (F(k) === 0 || F(k) === 7) && (R(k) === 1 || R(k) === 8);
    if (t === "r" && corner && nb.includes(chk) && (F(chk) === F(k) || R(chk) === R(k)) && after.attackers(chk, me).some((s) => after.get(s)?.type === "n")) out.add("arabian");
    if (heavy && (F(k) === 0 || F(k) === 7) && F(chk) === F(k)) {
      const inF = F(k) === 0 ? 1 : 6;
      const diag = [R(k) - 1, R(k) + 1].filter((r) => r >= 1 && r <= 8).map((r) => SQ(inF, r));
      const knightCovers = all(after, me, "n").some((n) => diag.every((s) => after.attackers(s, me).includes(n.square)));
      if (own(SQ(inF, R(k))) && diag.length > 0 && knightCovers) out.add("anastasia");
    }
    if (t === "b") {
      const other = all(after, me, "b").filter((b) => b.square !== chk);
      const free = nb.filter((s) => !own(s));
      const byBishopsOnly = free.every((s) => after.attackers(s, me).every((a) => after.get(a)?.type === "b"));
      if (other.length && byBishopsOnly && free.some((s) => other.some((b) => after.attackers(s, me).includes(b.square)))) out.add("boden");
    }
  }
  return [...out].map(award);
}

/** Reaching a named opening by your own move: deeper lines are worth more (1.e4 = 1, Sicilian = 3, …). */
export function openingAward(fenBefore: string, fenAfter: string): Award | null {
  const node = getNode(fenAfter);
  const name = node?.info?.name;
  if (!node || !name || node.depth === 0 || getNode(fenBefore)?.info?.name === name) return null;
  const depth = openingChain(node).length;
  return { id: `open:${name}`, cat: "型（定跡）", ja: name, pts: openingPoints(depth) };
}
export const openingPoints = (chainDepth: number) => [1, 3, 5, 7, 10][Math.min(Math.max(chainDepth, 1), 5) - 1];

export const brilliantAward = (): Award => award("brilliant");

// ── the record ──
const KEY = "dojo.trophies";
export interface TrophyLog {
  earned: Record<string, { n: number; first: number; ja: string; cat: TrophyCat; pts: number }>;
  total: number; // career 芸術点
  best: number; // best single game
  games: number;
}
export const loadLog = (): TrophyLog => ({ earned: {}, total: 0, best: 0, games: 0, ...load<Partial<TrophyLog>>(KEY, {}) });

export function recordAward(a: Award) {
  const log = loadLog();
  const e = log.earned[a.id];
  log.earned[a.id] = e ? { ...e, n: e.n + 1 } : { n: 1, first: Date.now(), ja: a.ja, cat: a.cat, pts: a.pts };
  log.total += a.pts;
  save(KEY, log);
}
/** Best single-game score: kept up to date as the game goes, so a closed tab doesn't lose it. */
export function recordBest(score: number) {
  const log = loadLog();
  if (score <= log.best) return;
  log.best = score;
  save(KEY, log);
}
export function recordGame(score: number) {
  if (score <= 0) return;
  const log = loadLog();
  log.games += 1;
  log.best = Math.max(log.best, score);
  save(KEY, log);
}
