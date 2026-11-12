import { Chess } from "chess.js";
import { getNode, posKey } from "../lib/tree.ts";

export interface Course {
  id: string;
  title: string;
  sub: string;
  side: "w" | "b";
  root: string; // SAN prefix both sides must follow
  prefer?: string[]; // lines whose moves the learner should choose (GM repertoire)
  gm?: string;
  minShare?: number; // opponent replies with at least this share are drilled
  maxOpp?: number; // max opponent branches per node
  maxPly?: number;
  tag: string;
}

const NAJ = "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6";

export const COURSES: Course[] = [
  { id: "ruy", tag: "1.e4", title: "ルイ・ロペス", sub: "白番：500 年続く王道", side: "w", root: "e4 e5 Nf3 Nc6 Bb5" },
  { id: "italian", tag: "1.e4", title: "イタリアン・ゲーム", sub: "白番：f7 を狙う基本の型", side: "w", root: "e4 e5 Nf3 Nc6 Bc4", minShare: 0.1 },
  { id: "open-sic", tag: "1.e4", title: "オープン・シシリアン", sub: "白番：シシリアンの全主要型と戦う", side: "w", root: "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3", minShare: 0.1, maxOpp: 4 },
  { id: "qg", tag: "1.d4", title: "クイーンズ・ギャンビット", sub: "白番：QGD・スラヴ・QGA を一気に", side: "w", root: "d4 d5 c4", maxOpp: 3 },
  { id: "london", tag: "1.d4", title: "ロンドン・システム", sub: "白番：形で覚える最効率の型", side: "w", root: "d4 d5 Bf4", minShare: 0 },
  { id: "najdorf", tag: "vs 1.e4", title: "シシリアン・ナイドルフ", sub: "黒番：フィッシャーとカスパロフの剣", side: "b", root: NAJ, maxOpp: 5, minShare: 0.08 },
  { id: "caro", tag: "vs 1.e4", title: "カロ・カン", sub: "黒番：崩れない堅陣", side: "b", root: "e4 c6 d4 d5", minShare: 0.1 },
  { id: "french", tag: "vs 1.e4", title: "フレンチ・ディフェンス", sub: "黒番：ポーン鎖の根元を叩く", side: "b", root: "e4 e6 d4 d5", minShare: 0.1, maxOpp: 4 },
  { id: "e5black", tag: "vs 1.e4", title: "1…e5 で受ける", sub: "黒番：ルイ・ロペス／イタリアン／スコッチ対策", side: "b", root: "e4 e5", maxOpp: 4, maxPly: 14 },
  { id: "kid", tag: "vs 1.d4", title: "キングズ・インディアン", sub: "黒番：閉鎖して王を狙う", side: "b", root: "d4 Nf6 c4 g6 Nc3 Bg7", minShare: 0.1 },
  { id: "slav", tag: "vs 1.d4", title: "スラヴ・ディフェンス", sub: "黒番：ビショップを閉じ込めない堅陣", side: "b", root: "d4 d5 c4 c6", minShare: 0.1 },
  { id: "nimzo", tag: "vs 1.d4", title: "ニムゾ・インディアン", sub: "黒番：構造で勝つ", side: "b", root: "d4 Nf6 c4 e6 Nc3 Bb4", minShare: 0.1 },

  // ── GM repertoires ──
  {
    id: "fischer-w", tag: "GM", gm: "ボビー・フィッシャー", title: "フィッシャーの白番", sub: "1.e4 ベスト・バイ・テスト／エクスチェンジ・ルイ／ソージン", side: "w", root: "e4",
    prefer: [
      "e4 e5 Nf3 Nc6 Bb5 a6 Bxc6 dxc6 O-O",
      `${NAJ} Bc4 e6 Bb3`,
      "e4 c5 Nf3 Nc6 d4 cxd4 Nxd4",
      "e4 c5 Nf3 e6 d4 cxd4 Nxd4",
      "e4 e6 d3 d5 Nd2 Nf6 Ngf3 c5 g3 Nc6 Bg2 Be7 O-O O-O e5",
      "e4 c6 Nc3 d5 Nf3 Bg4 h3 Bxf3 Qxf3",
    ],
    maxOpp: 3, maxPly: 18,
  },
  {
    id: "fischer-b", tag: "GM", gm: "ボビー・フィッシャー", title: "フィッシャーの黒番", sub: "ナイドルフ／ポイズンド・ポーン／KID／グリュンフェルト", side: "b", root: "",
    prefer: [
      `${NAJ} Bg5 e6 f4 Qb6 Qd2 Qxb2 Rb1 Qa3`,
      `${NAJ} Be3 e5`,
      `${NAJ} Be2 e5`,
      "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5",
      "d4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O",
      "Nf3 Nf6 c4 g6 Nc3 Bg7 d4 O-O Bf4 d5",
      "c4 Nf6 Nc3 g6 e4 d6 d4 Bg7",
      "d4 Nf6 Nf3 g6 g3 Bg7 Bg2 O-O O-O d6",
      "Nf3 Nf6 d4 g6",
    ],
    maxOpp: 3, maxPly: 18,
  },
  {
    id: "kasparov-b", tag: "GM", gm: "ガルリ・カスパロフ", title: "カスパロフの黒番", sub: "ナイドルフ／スケベニンゲン／グリュンフェルト", side: "b", root: "",
    prefer: [
      `${NAJ} Be3 e5 Nb3 Be6 f3`,
      "e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6",
      "d4 Nf6 c4 g6 Nc3 d5",
      "Nf3 Nf6 c4 g6",
      "c4 Nf6 Nc3 g6",
    ],
    maxOpp: 3, maxPly: 16,
  },
  {
    id: "kasparov-w", tag: "GM", gm: "ガルリ・カスパロフ", title: "カスパロフのスコッチ", sub: "白番：1990 年代に復活させたスコッチ・ゲーム", side: "w", root: "e4 e5 Nf3 Nc6",
    prefer: ["e4 e5 Nf3 Nc6 d4 exd4 Nxd4"],
    maxOpp: 3,
  },
  {
    id: "carlsen", tag: "GM", gm: "マグヌス・カールセン", title: "カールセンのスヴェシニコフ", sub: "黒番：2018 年世界選手権の主力兵器", side: "b", root: "e4 c5 Nf3 Nc6",
    prefer: ["e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Bxf6 gxf6 Nd5 f5", "e4 c5 Nf3 Nc6 Bb5 g6"],
  },
  {
    id: "capablanca", tag: "GM", gm: "ホセ・ラウル・カパブランカ", title: "カパブランカの QGD", sub: "黒番：解放手順で窮屈さを消す", side: "b", root: "d4 d5 c4 e6 Nc3 Nf6",
    prefer: ["d4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 Nbd7 Rc1 c6 Bd3 dxc4 Bxc4 Nd5 Bxe7 Qxe7 O-O Nxc3 Rxc3 e5"],
  },
  {
    id: "kramnik", tag: "GM", gm: "ウラジーミル・クラムニク", title: "クラムニクのベルリンの壁", sub: "黒番：カスパロフから王座を奪った型", side: "b", root: "e4 e5 Nf3 Nc6 Bb5 Nf6",
    prefer: ["e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8"],
    minShare: 0,
  },
  {
    id: "tal", tag: "GM", gm: "ミハイル・タリ", title: "タリのモダン・ベノニ", sub: "黒番：不均衡こそ力", side: "b", root: "d4 Nf6 c4 c5 d5 e6",
  },
];

export interface DrillLine {
  key: string;
  moves: string[]; // full SAN from start
}

/** Expand a course into concrete lines: learner plays the preferred/main move, opponent branches. */
export function courseLines(c: Course): DrillLine[] {
  const rootMoves = c.root.split(/\s+/).filter(Boolean);
  const chess = new Chess();
  for (const m of rootMoves) chess.move(m);
  const minShare = c.minShare ?? 0.12;
  const maxOpp = c.maxOpp ?? 3;
  const maxPly = c.maxPly ?? 28;
  const out: DrillLine[] = [];
  const prefer = (c.prefer ?? []).map((l) => l.split(/\s+/));

  const walk = (moves: string[], fen: string) => {
    const node = getNode(fen);
    const turn = fen.split(" ")[1] as "w" | "b";
    const kids = node?.children ?? [];
    if (!kids.length || moves.length >= maxPly || out.length > 60) {
      finish(moves);
      return;
    }
    const total = kids.reduce((s, k) => s + k.w, 0);
    if (turn === c.side) {
      let pick = kids[0];
      for (const p of prefer) {
        if (p.length > moves.length && moves.every((m, i) => p[i] === m)) {
          const f = kids.find((k) => k.san === p[moves.length]);
          if (f) { pick = f; break; }
        }
      }
      const ch = new Chess(fen);
      ch.move(pick.san);
      walk([...moves, pick.san], ch.fen());
    } else {
      let opts = kids.filter((k) => k.w / total >= minShare).slice(0, maxOpp);
      if (prefer.length) {
        // GM repertoire: keep opponent moves that lead toward a preferred line first.
        const toward = kids.filter((k) => prefer.some((p) => p.length > moves.length && moves.every((m, i) => p[i] === m) && p[moves.length] === k.san));
        const pastEnd = prefer.some((p) => moves.length >= p.length && p.every((m, i) => moves[i] === m));
        if (toward.length) opts = [...new Set([...toward, ...opts])].slice(0, Math.max(maxOpp, toward.length));
        else if (!pastEnd && moves.length > rootMoves.length) opts = opts.slice(0, 1);
      }
      if (!opts.length) opts = [kids[0]];
      for (const k of opts) {
        const ch = new Chess(fen);
        ch.move(k.san);
        walk([...moves, k.san], ch.fen());
      }
    }
  };

  const finish = (moves: string[]) => {
    let m = moves;
    // End on the learner's move so every line closes with something to recall.
    const learnerParity = c.side === "w" ? 1 : 0; // white moves are at odd lengths
    if (m.length % 2 !== learnerParity) m = m.slice(0, -1);
    if (m.length <= rootMoves.length) return;
    const key = m.join(" ");
    if (!out.some((l) => l.key === key || l.key.startsWith(key + " "))) {
      // drop shorter lines that are prefixes of this one
      for (let i = out.length - 1; i >= 0; i--) if (key.startsWith(out[i].key + " ")) out.splice(i, 1);
      out.push({ key, moves: m });
    }
  };

  walk(rootMoves, chess.fen());
  return out;
}

export function courseStartKey(c: Course) {
  const ch = new Chess();
  for (const m of c.root.split(/\s+/).filter(Boolean)) ch.move(m);
  return posKey(ch.fen());
}
