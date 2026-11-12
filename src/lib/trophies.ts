// 芸術点: named moves, formations, mating patterns and openings, recognised from the board alone.
// A move earns the points only when it is played without assists.
import { Chess, type Color, type Move, type Square } from "chess.js";
import { load, save } from "./storage.ts";
import { extraLoss, moveDanger } from "./tactics.ts";
import { getNode, openingChain } from "./tree.ts";

// Grouped by WHAT carries the name (mutually exclusive): a rule, a one-move tactic, a sacrifice,
// where a piece stands, the pawn skeleton, the mating picture, an endgame technique, or an opening.
export type TrophyCat = "特別な手" | "戦術" | "捨て駒" | "駒の配置" | "ポーン構造" | "詰みの型" | "終盤の技術" | "型（定跡）";
export interface TrophyDef {
  id: string;
  cat: TrophyCat;
  ja: string;
  pts: number;
  what: string;
}

export const TROPHIES: TrophyDef[] = [
  // ルールで決まった特別な手
  { id: "castle", cat: "特別な手", ja: "キャスリング", pts: 2, what: "キングを囲い、ルークを中央へ出す。" },
  { id: "castleLong", cat: "特別な手", ja: "クイーンサイド・キャスリング", pts: 3, what: "クイーン側に囲う。ルークがすぐ d 列に出る攻撃的な囲い。" },
  { id: "oppositeCastle", cat: "特別な手", ja: "反対側キャスリング", pts: 3, what: "相手と反対の側に囲う。互いにポーンを突いて攻め合う合図。" },
  { id: "enPassant", cat: "特別な手", ja: "アンパッサン", pts: 3, what: "2 マス進んで横をすり抜けたポーンを、通過中のものとして取る。" },
  { id: "promotion", cat: "特別な手", ja: "プロモーション", pts: 5, what: "ポーンを最終段まで進めて、クイーンなどに昇格させる。" },
  { id: "underPromotion", cat: "特別な手", ja: "アンダープロモーション", pts: 10, what: "あえてクイーン以外（ナイトなど）に昇格させる。チェックやステイルメイト回避の妙技。" },

  // 一手で決まる戦術（駒の利きの形）
  { id: "fork", cat: "戦術", ja: "フォーク（両取り）", pts: 3, what: "1 つの駒で 2 つ以上を同時に狙う。" },
  { id: "pawnFork", cat: "戦術", ja: "ポーンのフォーク", pts: 4, what: "いちばん安いポーンで、2 つの駒を同時に狙う。" },
  { id: "royalFork", cat: "戦術", ja: "ロイヤル・フォーク", pts: 8, what: "ナイトでキングとクイーンを同時に狙う。" },
  { id: "familyFork", cat: "戦術", ja: "ファミリー・フォーク", pts: 12, what: "ナイトでキング・クイーン・ルークを一度に狙う。" },
  { id: "pin", cat: "戦術", ja: "ピン", pts: 2, what: "動くと後ろのキングやクイーンが取られる駒を、釘付けにする。" },
  { id: "skewer", cat: "戦術", ja: "スキュア（串刺し）", pts: 4, what: "価値の高い駒を攻めて逃がし、その後ろの駒を取る。" },
  { id: "discoveredAttack", cat: "戦術", ja: "ディスカバード・アタック", pts: 4, what: "駒をどかして、後ろの駒の利きで大駒を狙う。" },
  { id: "discovered", cat: "戦術", ja: "ディスカバード・チェック", pts: 4, what: "駒をどかして、後ろの駒でチェックをかける。" },
  { id: "doubleCheck", cat: "戦術", ja: "ダブルチェック", pts: 6, what: "2 つの駒で同時にチェック。相手はキングを動かすしかない。" },
  { id: "trapped", cat: "戦術", ja: "駒の捕獲", pts: 5, what: "逃げ場のない駒に当たりをかける。どこへ逃げても取られる。" },
  { id: "windmill", cat: "戦術", ja: "風車（ウインドミル）", pts: 25, what: "ディスカバード・チェックとチェックを交互に繰り返し、行き来するたびに駒を取る。" },

  // 捨て駒
  { id: "brilliant", cat: "捨て駒", ja: "妙手（!!）", pts: 10, what: "一見は駒損なのに、エンジンが良い手と認める捨て駒。" },
  { id: "exchangeSac", cat: "捨て駒", ja: "エクスチェンジ・サクリファイス", pts: 8, what: "ルークで守られたナイトかビショップを取り、ルークを差し出す。" },
  { id: "queenSac", cat: "捨て駒", ja: "クイーン・サクリファイス", pts: 15, what: "クイーンを捨てる。エンジンが良い手と認めたときだけ。" },
  { id: "greekGift", cat: "捨て駒", ja: "グリーク・ギフト（Bxh7+）", pts: 8, what: "ビショップを h7（h2）に捨てて、囲ったキングを引きずり出す古典的な捨て駒。" },

  // 駒の配置（どこに何を置くか）
  { id: "fianchetto", cat: "駒の配置", ja: "フィアンケット", pts: 2, what: "ビショップを g2・b2（g7・b7）に据えて、長い対角線を支配する。" },
  { id: "doubleFianchetto", cat: "駒の配置", ja: "ダブル・フィアンケット", pts: 4, what: "両方のビショップをフィアンケットにする。" },
  { id: "modelOpening", cat: "駒の配置", ja: "模範的な展開", pts: 3, what: "10 手目までに、小駒 4 枚を出してキャスリングまで済ませる。" },
  { id: "london", cat: "駒の配置", ja: "ロンドン型", pts: 4, what: "Bf4・d4・e3・Nf3 の形（黒なら Bf5・d5・e6・Nf6）。" },
  { id: "colle", cat: "駒の配置", ja: "コッレ型", pts: 4, what: "d4・e3・c3・Nf3・Bd3 の形。e4 突きで中央を開く準備。" },
  { id: "kingsIndian", cat: "駒の配置", ja: "キングズ・インディアン型", pts: 4, what: "Nf3・g3・Bg2・d3 と囲いの形（黒なら Nf6・g6・Bg7・d6）。" },
  { id: "outpost", cat: "駒の配置", ja: "アウトポストのナイト", pts: 4, what: "4〜5 段目の、ポーンに守られ敵ポーンに追い払われないマスにナイトを置く。" },
  { id: "octopus", cat: "駒の配置", ja: "オクトパス・ナイト", pts: 8, what: "敵陣の 6 段目の中央に、ポーンに守られたナイトを打ち込む。8 本の足で全方位を押さえる。" },
  { id: "battery", cat: "駒の配置", ja: "バッテリー", pts: 3, what: "クイーンとビショップを同じ斜めに重ね、相手キングの前のマスに照準を合わせる。" },
  { id: "doubledRooks", cat: "駒の配置", ja: "ルークの重ね（ダブル・ルーク）", pts: 3, what: "ポーンのない列に、ルーク 2 枚を縦に重ねる。" },
  { id: "connected", cat: "駒の配置", ja: "ルークの連結", pts: 2, what: "最下段の 2 つのルークの間に駒がなく、互いに守り合う。" },
  { id: "rook7", cat: "駒の配置", ja: "7 段目のルーク", pts: 3, what: "ルークを 7 段目に入れて、ポーンを横から攻め、キングを閉じ込める。" },
  { id: "pigs", cat: "駒の配置", ja: "7 段目の豚（ルーク 2 枚）", pts: 10, what: "ルーク 2 枚を 7 段目に並べる。何でも食べ尽くすので「豚」。" },
  { id: "gun", cat: "駒の配置", ja: "アレヒンの銃", pts: 20, what: "同じ列に、ルーク 2 枚の後ろにクイーンを並べる三段重ね。" },

  // ポーン構造（ポーンの骨格）
  { id: "passed", cat: "ポーン構造", ja: "パスポーン", pts: 3, what: "前にも隣の列にも止める敵ポーンがいないポーンを、5 段目以上に作る。" },
  { id: "protectedPasser", cat: "ポーン構造", ja: "守られたパスポーン", pts: 4, what: "4 段目以上のパスポーンを、隣のポーンで守る。" },
  { id: "connectedPassers", cat: "ポーン構造", ja: "連結パスポーン", pts: 6, what: "隣り合う列に 2 つのパスポーン（4 段目以上）を並べる。" },
  { id: "iqp", cat: "ポーン構造", ja: "孤立 d ポーン（IQP）", pts: 3, what: "隣の列にポーンのない d ポーンを 4 段目に置き、駒の活動力で戦う。" },
  { id: "hangingPawns", cat: "ポーン構造", ja: "ハンギング・ポーン", pts: 4, what: "隣にポーンのない c・d の 2 枚を 4 段目に並べる。" },
  { id: "stonewall", cat: "ポーン構造", ja: "ストーンウォール", pts: 5, what: "c3・d4・e3・f4（黒なら c6・d5・e6・f5）の石の壁。" },
  { id: "maroczy", cat: "ポーン構造", ja: "マロツィ・バインド", pts: 6, what: "c4 と e4 のポーンで d5 を押さえ込む（d ポーンは交換済み）。" },
  { id: "hedgehog", cat: "ポーン構造", ja: "ヘッジホッグ", pts: 8, what: "a6・b6・d6・e6 に低く構える針ねずみの陣（c ポーンは交換済み）。" },

  // 詰みの型（詰みの局面の形）
  { id: "mate", cat: "詰みの型", ja: "チェックメイト", pts: 10, what: "相手のキングを詰ます。" },
  { id: "scholar", cat: "詰みの型", ja: "学者のメイト", pts: 5, what: "序盤にクイーンで f7（f2）を取って詰ます。" },
  { id: "fools", cat: "詰みの型", ja: "フールズ・メイト", pts: 10, what: "3 手以内の詰み。" },
  { id: "kiss", cat: "詰みの型", ja: "クイーンの接吻", pts: 10, what: "守られたクイーンを、キングの隣に置いて詰ます。" },
  { id: "backRank", cat: "詰みの型", ja: "バックランク・メイト", pts: 15, what: "自分のポーンに閉じ込められた最下段のキングを、ルークかクイーンで詰ます。" },
  { id: "ladder", cat: "詰みの型", ja: "はしご詰め", pts: 15, what: "ルークやクイーン 2 枚で、隣り合う 2 列を押さえて端のキングを詰ます。" },
  { id: "knightMate", cat: "詰みの型", ja: "ナイトのメイト", pts: 15, what: "ナイトのチェックで詰ます。" },
  { id: "pawnMate", cat: "詰みの型", ja: "ポーンのメイト", pts: 25, what: "ポーンのチェックで詰ます。" },
  { id: "damiano", cat: "詰みの型", ja: "ダミアーノのメイト", pts: 30, what: "ポーンに守られたクイーンを、キングの斜め隣に置いて詰ます（h7 のクイーンと g6 のポーン）。" },
  { id: "lolli", cat: "詰みの型", ja: "ロリのメイト", pts: 30, what: "ポーンに守られたクイーンを、キングの真正面に置いて詰ます（g7 のクイーンと f6 のポーン）。" },
  { id: "greco", cat: "詰みの型", ja: "グレコのメイト", pts: 30, what: "隅のキングを、ビショップが g8 を消し、ルークかクイーンが h 列で詰ます。" },
  { id: "hook", cat: "詰みの型", ja: "フック・メイト", pts: 30, what: "ナイトに守られたルークを隣に置いて詰ます。そのナイトはポーンが守る。" },
  { id: "opera", cat: "詰みの型", ja: "オペラ・メイト", pts: 30, what: "ビショップに守られたルークで、最下段のキングを詰ます（モーフィーのオペラ座の一局）。" },
  { id: "morphy", cat: "詰みの型", ja: "モーフィーのメイト", pts: 30, what: "隅のキングを、ルークが隣の列を押さえ、ビショップが斜めから詰ます。" },
  { id: "doubleCheckMate", cat: "詰みの型", ja: "ダブルチェック・メイト", pts: 30, what: "2 つの駒の同時チェックで詰ます。" },
  { id: "epaulette", cat: "詰みの型", ja: "エポレット・メイト", pts: 30, what: "キングの両肩を自分の駒がふさいでいるところを詰ます（肩章のメイト）。" },
  { id: "dovetail", cat: "詰みの型", ja: "ダブテイル・メイト", pts: 30, what: "守られたクイーンを斜め隣に置き、逃げ道の 2 マスを相手自身の駒がふさいでいる。" },
  { id: "swallowsTail", cat: "詰みの型", ja: "スワローズテイル・メイト", pts: 30, what: "守られたクイーンを真正面に置き、斜め後ろの 2 マスを相手自身の駒がふさいでいる。" },
  { id: "arabian", cat: "詰みの型", ja: "アラビアン・メイト", pts: 30, what: "隅のキングを、ナイトに守られたルークで詰ます。" },
  { id: "anastasia", cat: "詰みの型", ja: "アナスタシアのメイト", pts: 40, what: "端の列のキングを、ナイトが逃げ道を消し、ルークかクイーンが列で詰ます。" },
  { id: "boden", cat: "詰みの型", ja: "ボーデンのメイト", pts: 50, what: "2 枚のビショップが交差する対角線で詰ます。" },
  { id: "legal", cat: "詰みの型", ja: "レガルのメイト", pts: 50, what: "f7 のビショップと 2 枚のナイトで、e7 のキングを詰ます。" },
  { id: "smothered", cat: "詰みの型", ja: "窒息メイト（スマザード）", pts: 50, what: "味方の駒に囲まれて動けないキングを、ナイトで詰ます。" },
  { id: "castleMate", cat: "詰みの型", ja: "キャスリング・メイト", pts: 60, what: "キャスリングの一手で詰ます。" },

  // 終盤の技術
  { id: "opposition", cat: "終盤の技術", ja: "オポジション", pts: 4, what: "キングとポーンだけの終盤で、相手キングと 1 マス空けて向かい合い、相手に手番を渡す。" },
  { id: "kqk", cat: "終盤の技術", ja: "クイーンでの基本メイト", pts: 5, what: "キングとクイーンだけで、裸のキングを詰ます。" },
  { id: "krk", cat: "終盤の技術", ja: "ルークでの基本メイト", pts: 8, what: "キングとルークだけで、裸のキングを詰ます。" },
  { id: "twoBishops", cat: "終盤の技術", ja: "2 ビショップのメイト", pts: 20, what: "キングと 2 枚のビショップだけで、裸のキングを詰ます。" },
  { id: "bishopKnight", cat: "終盤の技術", ja: "ビショップとナイトのメイト", pts: 40, what: "キングとビショップとナイトだけで、裸のキングを詰ます。最難関の基本メイト。" },
];

/** Named ideas that are left out on purpose: they depend on intent or on what was possible, not on the board. */
export const NOT_COVERED = [
  "中間手（ツヴィッシェンツーク）", "そらし・おびき寄せ・守り駒の除去（犠牲として「妙手」で拾う）", "過負荷（オーバーロード）", "妨害（インターフェアランス）",
  "X 線攻撃", "デスペラード", "予防手", "永久チェック", "ステイルメイトの罠", "ツークツワンク", "三角追い", "ルセナ／フィリドールの局面",
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
/** My passed pawns' squares. */
function passers(c: Chess, me: Color): string[] {
  const them = me === "w" ? "b" : "w";
  const foes = all(c, them, "p");
  return all(c, me, "p")
    .filter((p) => !foes.some((e) => Math.abs(F(e.square) - F(p.square)) <= 1 && rel(me, R(e.square)) > rel(me, R(p.square))))
    .map((p) => p.square);
}

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
  colle: (c, me) => ["d4", "e3", "c3"].every((q) => is(c, mine(me, q), me, "p")) && is(c, mine(me, "f3"), me, "n") && is(c, mine(me, "d3"), me, "b"),
  iqp: (c, me) => {
    const d = all(c, me, "p").find((p) => p.square[0] === "d" && rel(me, R(p.square)) === 4);
    return !!d && !all(c, me, "p").some((p) => p.square[0] === "c" || p.square[0] === "e");
  },
  hangingPawns: (c, me) => {
    const ps = all(c, me, "p");
    const four = (f: string) => ps.some((p) => p.square[0] === f && rel(me, R(p.square)) === 4);
    return four("c") && four("d") && !ps.some((p) => p.square[0] === "b" || p.square[0] === "e");
  },
  protectedPasser: (c, me) => passers(c, me).some((p) => rel(me, R(p)) >= 4 && c.attackers(p as Square, me).some((a) => c.get(a)?.type === "p")),
  connectedPassers: (c, me) => {
    const ps = passers(c, me).filter((p) => rel(me, R(p)) >= 4);
    return ps.some((a) => ps.some((b) => Math.abs(F(a) - F(b)) === 1));
  },
  doubledRooks: (c, me) => {
    const rs = all(c, me, "r");
    if (rs.length < 2 || rs[0].square[0] !== rs[1].square[0]) return false;
    const f = F(rs[0].square), [lo, hi] = [R(rs[0].square), R(rs[1].square)].sort((x, y) => x - y);
    for (let r = lo + 1; r < hi; r++) if (c.get(SQ(f, r))) return false;
    return !all(c, me, "p").some((p) => F(p.square) === f);
  },
  passed: (c, me) => {
    const them = me === "w" ? "b" : "w";
    const foes = all(c, them, "p");
    return all(c, me, "p").some((p) => rel(me, R(p.square)) >= 5 && !foes.some((e) => Math.abs(F(e.square) - F(p.square)) <= 1 && rel(me, R(e.square)) > rel(me, R(p.square))));
  },
};

export interface MoveCtx {
  /** The same side's previous moves, oldest first (only the last two are used). */
  prevOwn?: { fenBefore: string; move: { from: string; to: string; promotion?: string } }[];
}

/** Named things achieved by this move (ids are unique; the caller decides what counts). */
export function detect(fenBefore: string, m: { from: string; to: string; promotion?: string }, ctx?: MoveCtx): Award[] {
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
  if (mv.promotion) out.add(mv.promotion === "q" ? "promotion" : "underPromotion");

  // tactics
  if (safe) {
    const hit = all(after, them).filter((p) => after.attackers(p.square, me).includes(mv.to as Square));
    const targets = hit.filter((p) => p.type === "k" || (p.type !== "p" && (VAL[p.type] > VAL[mv.piece] || after.attackers(p.square, them).length === 0)));
    if (targets.length >= 2) {
      const has = (t: string) => targets.some((x) => x.type === t);
      if (mv.piece === "n" && has("k") && has("q") && has("r")) out.add("familyFork");
      else if (mv.piece === "n" && has("k") && has("q")) out.add("royalFork");
      else if (mv.piece === "p") out.add("pawnFork");
      else out.add("fork");
    }
    // a piece with nowhere to go: every move of it still loses it
    for (const p of hit) {
      if (!"nbrq".includes(p.type) || VAL[p.type] <= VAL[mv.piece]) continue;
      const escapes = after.moves({ square: p.square, verbose: true });
      if (escapes.every((e) => (moveDanger(after.fen(), e.from, e.to)?.loss ?? 0) >= VAL[p.type] - 1)) {
        out.add("trapped");
        break;
      }
    }
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
  } else if (!castle) {
    // discovered attack (no check): a line piece behind the one that moved now hits a big piece
    for (const s of all(after, me).filter((x) => "brq".includes(x.type) && x.square !== mv.to)) {
      const df = Math.sign(F(mv.from) - F(s.square)), dr = Math.sign(R(mv.from) - R(s.square));
      const straight = F(mv.from) === F(s.square) || R(mv.from) === R(s.square);
      const diag = Math.abs(F(mv.from) - F(s.square)) === Math.abs(R(mv.from) - R(s.square));
      if (!(straight ? s.type !== "b" : diag && s.type !== "r")) continue;
      let between = true;
      for (let i = 1; ; i++) {
        const sq = SQ(F(s.square) + df * i, R(s.square) + dr * i);
        if (sq === mv.from) break;
        if (!onBoard(F(sq), R(sq)) || before.get(sq)) { between = false; break; }
      }
      if (!between) continue;
      const [first] = ray(after, s.square, df, dr);
      if (first && first.color === them && (first.type === "q" || first.type === "r") && VAL[first.type] > VAL[s.type] - 0.5 && !before.attackers(first.square, me).includes(s.square)) {
        out.add("discoveredAttack");
        break;
      }
    }
  }
  // windmill: discovered check, check by the same piece, discovered check again, shuttling back and forth
  if (out.has("discovered") && ctx?.prevOwn && ctx.prevOwn.length >= 2) {
    const [p2, p1] = ctx.prevOwn.slice(-2);
    const checks = (x: { fenBefore: string; move: { from: string; to: string } }) => {
      const c = new Chess(x.fenBefore);
      try { c.move(x.move); } catch { return false; }
      return c.inCheck();
    };
    if (p1.move.to === mv.from && checks(p1) && p2.move.to === p1.move.from && detect(p2.fenBefore, p2.move).some((a) => a.id === "discovered")) out.add("windmill");
  }
  if (mv.piece === "b" && mv.captured === "p" && mv.san.includes("+") && mv.to === mine(me, "h7") && theirKing === mine(me, "g8")) out.add("greekGift");
  // exchange sacrifice: a rook takes a knight or bishop that can be taken back
  if (mv.piece === "r" && (mv.captured === "n" || mv.captured === "b") && after.attackers(mv.to as Square, them).length > 0) out.add("exchangeSac");

  // formations: only at the move that completes them
  if (mv.piece === "b" && (fianchettoAt(after, me, "b") || fianchettoAt(after, me, "g")) && rel(me, R(mv.to)) === 2) out.add("fianchetto");
  for (const [id, f] of Object.entries(FORM)) if (f(after, me) && !f(before, me)) out.add(id);
  if (mv.piece === "r" && rel(me, R(mv.to)) === 7) out.add("rook7");
  if (safe && mv.piece === "n" && [4, 5, 6].includes(rel(me, R(mv.to))) && F(mv.to) >= 2 && F(mv.to) <= 5) {
    const supported = after.attackers(mv.to as Square, me).some((s) => after.get(s)?.type === "p");
    const chased = all(after, them, "p").some((p) => Math.abs(F(p.square) - F(mv.to)) === 1 && rel(me, R(p.square)) > rel(me, R(mv.to)));
    if (supported && !chased) out.add(rel(me, R(mv.to)) === 6 ? "octopus" : "outpost");
  }
  // battery: queen and bishop stacked on one diagonal, aimed at the squares around their king
  if ((mv.piece === "q" || mv.piece === "b") && theirKing) {
    const zone = new Set([theirKing, ...neighbors(theirKing)]);
    for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
      const [a] = ray(after, mv.to, df, dr);
      const behind = ray(after, mv.to, -df, -dr)[0];
      const pair = (x?: { color: Color; type: string }) => !!x && x.color === me && (x.type === "q" || x.type === "b") && x.type !== mv.piece;
      // the moved piece is either the front or the back of the battery
      const front = pair(a) ? a!.square : mv.to;
      if (!pair(a) && !pair(behind)) continue;
      const dir: [number, number] = pair(a) ? [df, dr] : [-df, -dr];
      if (pair(a) === false && dir[0] !== -df) continue;
      let hit = false;
      for (let i = 1; i < 8; i++) {
        const f = F(front) + dir[0] * i, r = R(front) + dir[1] * i;
        if (!onBoard(f, r)) break;
        const sq = SQ(f, r);
        if (zone.has(sq)) { hit = true; break; }
        if (after.get(sq)) break;
      }
      if (hit && !detect.batteryBefore(before, me, zone)) { out.add("battery"); break; }
    }
  }

  // opposition: kings and pawns only, my king steps in front of theirs with one square between
  if (mv.piece === "k" && !castle && theirKing && all(after, me).concat(all(after, them)).every((x) => x.type === "k" || x.type === "p")) {
    const df = Math.abs(F(mv.to) - F(theirKing)), dr = Math.abs(R(mv.to) - R(theirKing));
    if ((df === 0 && dr === 2) || (dr === 0 && df === 2)) out.add("opposition");
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
    const supportedBy = (sq: Square, type: string) => after.attackers(sq, me).some((s) => after.get(s)?.type === type);
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
    if (heavy && R(k) === back && R(chk) === back && front.length > 0 && front.every(own) && !(t === "r" && supportedBy(chk, "b"))) {
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
    else if (t === "q" && nb.includes(chk) && after.attackers(chk, me).length > 0) {
      const dx = F(chk) - F(k), dy = R(chk) - R(k);
      const blocked = (f: number, r: number) => !onBoard(f, r) || own(SQ(f, r));
      // a true dovetail needs both tail squares on the board (on the edge it is Damiano's picture instead)
      if (dx !== 0 && dy !== 0 && onBoard(F(k) - dx, R(k)) && onBoard(F(k), R(k) - dy) && own(SQ(F(k) - dx, R(k))) && own(SQ(F(k), R(k) - dy))) out.add("dovetail");
      else if ((dx === 0 || dy === 0) && (dx === 0 ? [[F(k) - 1, R(k) - dy], [F(k) + 1, R(k) - dy]] : [[F(k) - dx, R(k) - 1], [F(k) - dx, R(k) + 1]]).every(([f, r]) => blocked(f, r)) && onBoard(F(k) - dx, R(k) - dy)) out.add("swallowsTail");
      else if (supportedBy(chk, "p")) out.add(dx !== 0 && dy !== 0 ? "damiano" : "lolli");
      else out.add("kiss");
    }
    if (t === "r" && nb.includes(chk) && (F(chk) === F(k) || R(chk) === R(k))) {
      const knight = after.attackers(chk, me).find((s) => after.get(s)?.type === "n");
      if (knight && supportedBy(knight, "p")) out.add("hook");
    }
    if (t === "r" && R(k) === back && R(chk) === back && supportedBy(chk, "b")) out.add("opera");
    const corner = (F(k) === 0 || F(k) === 7) && (R(k) === 1 || R(k) === 8);
    if (corner && heavy && F(chk) === F(k)) {
      const inF = F(k) === 0 ? 1 : 6, inR = R(k) === 1 ? 2 : 7;
      if (is(after, SQ(inF, inR), them, "p") && after.attackers(SQ(inF, R(k)), me).some((s) => after.get(s)?.type === "b")) out.add("greco");
    }
    if (corner && t === "b" && all(after, me, "r").some((r) => F(r.square) === (F(k) === 0 ? 1 : 6))) out.add("morphy");
    // the basic mates: nothing but the mating pieces left
    const mat = (c: Color) => all(after, c).filter((x) => x.type !== "k").map((x) => x.type).sort().join("");
    if (mat(them) === "") {
      const mine2 = mat(me);
      if (mine2 === "q") out.add("kqk");
      else if (mine2 === "r") out.add("krk");
      else if (mine2 === "bb") out.add("twoBishops");
      else if (mine2 === "bn") out.add("bishopKnight");
    }
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

/** Was there already a queen+bishop battery aimed at this zone before the move? (so only a new one counts) */
detect.batteryBefore = (c: Chess, me: Color, zone: Set<string>): boolean => {
  for (const q of all(c, me, "q")) {
    for (const [df, dr] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as [number, number][]) {
      const [a] = ray(c, q.square, df, dr);
      if (!a || a.color !== me || a.type !== "b") continue;
      for (let i = 1; i < 8; i++) {
        const f = F(a.square) + df * i, r = R(a.square) + dr * i;
        if (!onBoard(f, r)) break;
        if (zone.has(SQ(f, r))) return true;
        if (c.get(SQ(f, r))) break;
      }
    }
  }
  return false;
};

/** Extra trophies for a move the engine judged a sound sacrifice (!!). */
export function sacrificeAwards(fenBefore: string, m: { from: string; to: string }): Award[] {
  const piece = new Chess(fenBefore).get(m.from as Square)?.type;
  return [award("brilliant"), ...(piece === "q" ? [award("queenSac")] : [])];
}
