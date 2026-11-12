// Playing-style statistics from game records alone (no engine): what a player tends to do,
// measured the same way for the user's games and for the GM collections.
// Shared by scripts/build-styles.ts (Node) and the 診断 mode (browser).
import { Chess, type Color } from "chess.js";
import { getNode, openingOf } from "./tree.ts";

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const FILES = "abcdefgh";

export interface GameInput {
  moves: string[]; // SAN
  color: Color; // the side whose style we measure
  result: "1-0" | "0-1" | "1/2-1/2";
  timeLoss?: boolean; // lost on time (if the source says so)
}

export interface GameStats {
  score: number; // 1 / 0.5 / 0 for the measured side
  color: Color;
  plies: number;
  myMoves: number;
  checks: number;
  captures: number;
  mateWin: boolean;
  mated: boolean;
  pieceMoves: Record<string, number>;
  queenMoves30: number;
  moves30: number;
  earlyQueen: boolean;
  castleMove: number | null; // own move number of castling
  opposite: boolean;
  queensOffPly: number | null;
  endgamePly: number | null;
  storm: number;
  pressure: number | null;
  space: number | null;
  tradeRate: number | null; // captures per ply (both sides) during moves 11–30
  wasDown2: boolean;
  up3: boolean;
  down3: boolean;
  lossEvents: [number, number, number]; // opening / middlegame / endgame
  gainEvents: number;
  bookPlies: number;
  opening: string;
  first: string; // "W:e4", "B:e4 c5" …
  timeLoss: boolean;
  devBy10: number; // minor pieces off the back rank by my 10th move (0–4)
  advance: number | null; // how far forward my pieces go (average rank of piece moves, moves 10–30)
  openFiles: number | null; // files without any pawn (sampled in the middlegame)
  bishopPair: boolean | null; // still both bishops at my 20th move
  rook7: boolean; // a rook reached the 7th rank
  gambit: boolean; // a pawn (or more) down after 8 moves
}

/** Replay one game and measure the given side. null = unusable record. */
export function analyzeGame(g: GameInput): GameStats | null {
  const me = g.color;
  const opp: Color = me === "w" ? "b" : "w";
  const c = new Chess();
  const mat = { w: 39, b: 39 };
  const nonPawn = { w: 31, b: 31 };
  const queens = { w: 1, b: 1 };
  const kingSq = { w: "e1", b: "e8" };
  const castled: { w: string | null; b: string | null } = { w: null, b: null };
  const diff: number[] = [];
  const movers: Color[] = [];
  const s: GameStats = {
    score: g.result === "1/2-1/2" ? 0.5 : (g.result === "1-0") === (me === "w") ? 1 : 0,
    color: me, plies: 0, myMoves: 0, checks: 0, captures: 0, mateWin: false, mated: false,
    pieceMoves: { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 }, queenMoves30: 0, moves30: 0, earlyQueen: false,
    castleMove: null, opposite: false, queensOffPly: null, endgamePly: null, storm: 0, pressure: null, space: null,
    tradeRate: null, wasDown2: false, up3: false, down3: false, lossEvents: [0, 0, 0], gainEvents: 0,
    bookPlies: 0, opening: "", first: "", timeLoss: !!g.timeLoss,
    devBy10: 0, advance: null, openFiles: null, bishopPair: null, rook7: false, gambit: false,
  };
  const home = me === "w" ? ["b1", "g1", "c1", "f1"] : ["b8", "g8", "c8", "f8"];
  const developed = new Set<string>();
  let bishops = 2, advSum = 0, advN = 0, openSum = 0;
  let inBook = true, trades = 0, pressSum = 0, pressN = 0, spaceSum = 0, spaceN = 0;
  let lastSan = "", lastMover: Color = "w";

  for (let i = 0; i < g.moves.length; i++) {
    let m;
    try {
      m = c.move(g.moves[i]);
    } catch {
      if (i < 16) return null;
      break;
    }
    const mover = m.color;
    const other: Color = mover === "w" ? "b" : "w";
    if (m.captured === "b" && other === me) bishops--;
    if (m.captured) {
      mat[other] -= VAL[m.captured];
      if (m.captured !== "p") nonPawn[other] -= VAL[m.captured];
      if (m.captured === "q") queens[other]--;
      if (i >= 20 && i < 60) trades++;
    }
    if (m.promotion) {
      mat[mover] += VAL[m.promotion] - 1;
      nonPawn[mover] += VAL[m.promotion];
      if (m.promotion === "q") queens[mover]++;
    }
    if (m.piece === "k") kingSq[mover] = m.to;
    if (m.flags.includes("k") || m.flags.includes("q")) castled[mover] = m.flags.includes("k") ? "k" : "q";

    if (mover === me) {
      s.myMoves++;
      s.pieceMoves[m.piece]++;
      if (m.san.includes("+") || m.san.includes("#")) s.checks++;
      if (m.captured) s.captures++;
      if (s.myMoves <= 30) {
        s.moves30++;
        if (m.piece === "q") s.queenMoves30++;
      }
      if (m.piece === "q" && s.myMoves <= 7) s.earlyQueen = true;
      if (castled[me] && s.castleMove === null) s.castleMove = s.myMoves;
      const relTo = me === "w" ? +m.to[1] : 9 - +m.to[1];
      if ((m.piece === "n" || m.piece === "b") && home.includes(m.from)) developed.add(m.from);
      if (s.myMoves <= 10) s.devBy10 = developed.size;
      if (s.myMoves >= 10 && s.myMoves <= 30 && m.piece !== "p" && m.piece !== "k") {
        advSum += relTo;
        advN++;
      }
      if (m.piece === "r" && relTo === 7) s.rook7 = true;
      if (s.myMoves === 20) s.bishopPair = bishops >= 2;
      // Pawn storm: my pawn reaches the 5th rank or beyond on the wing where their king lives, queens still on.
      if (m.piece === "p" && queens.w > 0 && queens.b > 0 && i < 60) {
        const kf = FILES.indexOf(kingSq[opp][0]);
        const wing = kf >= 5 ? [5, 6, 7] : kf <= 2 ? [0, 1, 2] : [];
        const rel = me === "w" ? +m.to[1] : 9 - +m.to[1];
        if (rel >= 5 && wing.includes(FILES.indexOf(m.to[0]))) s.storm++;
      }
      if (s.myMoves >= 10 && s.myMoves <= 30 && s.myMoves % 2 === 0) {
        // Pieces (not pawns) bearing on the squares around their king.
        const kf = FILES.indexOf(kingSq[opp][0]), kr = +kingSq[opp][1];
        const att = new Set<string>();
        for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
          const f = kf + df, r = kr + dr;
          if (f < 0 || f > 7 || r < 1 || r > 8) continue;
          for (const a of c.attackers(`${FILES[f]}${r}` as never, me)) {
            const t = c.get(a)?.type;
            if (t && t !== "p" && t !== "k") att.add(a);
          }
        }
        pressSum += att.size;
        pressN++;
        // Space: my pawns past the middle minus theirs.
        let sp = 0;
        const pawnFiles = new Set<string>();
        for (const row of c.board()) for (const p of row) {
          if (!p || p.type !== "p") continue;
          pawnFiles.add(p.square[0]);
          const rel = p.color === "w" ? +p.square[1] : 9 - +p.square[1];
          if (rel >= 5) sp += p.color === me ? 1 : -1;
        }
        spaceSum += sp;
        openSum += 8 - pawnFiles.size;
        spaceN++;
      }
    }
    if (s.queensOffPly === null && queens.w === 0 && queens.b === 0) s.queensOffPly = i;
    if (s.endgamePly === null && nonPawn.w <= 13 && nonPawn.b <= 13) s.endgamePly = i;
    diff.push(mat[me] - mat[opp]);
    movers.push(mover);
    if (inBook) {
      const node = getNode(c.fen());
      if (node) {
        s.bookPlies = i + 1;
        s.opening = openingOf(c.fen())?.info?.name ?? s.opening;
      } else inBook = false;
    }
    if (i === 0) s.first = me === "w" ? `W:${m.san}` : "";
    if (i === 1 && me === "b") s.first = `B:${g.moves[0]} ${m.san}`;
    lastSan = m.san;
    lastMover = mover;
    s.plies = i + 1;
  }
  if (s.plies < 16) return null;

  s.mateWin = lastSan.includes("#") && lastMover === me;
  s.mated = lastSan.includes("#") && lastMover !== me;
  s.opposite = !!castled.w && !!castled.b && castled.w !== castled.b;
  s.pressure = pressN ? pressSum / pressN : null;
  s.space = spaceN ? spaceSum / spaceN : null;
  s.openFiles = spaceN ? openSum / spaceN : null;
  s.advance = advN ? advSum / advN : null;
  s.gambit = diff.length > 15 && diff[15] <= -1;
  s.tradeRate = s.plies > 30 ? trades / (Math.min(s.plies, 60) - 20) : null;

  // Material swings: net change over my move + their reply + my answer (so even trades don't count).
  let own = 0;
  for (let p = 0; p < diff.length; p++) {
    const before = p > 0 ? diff[p - 1] : 0;
    const after = diff[Math.min(p + 2, diff.length - 1)];
    if (movers[p] === me) {
      own++;
      if (after - before <= -2) s.lossEvents[own <= 12 ? 0 : s.endgamePly !== null && p >= s.endgamePly ? 2 : 1]++;
    } else if (after - before >= 2) s.gainEvents++;
  }
  const longest = (ok: (d: number) => boolean) => {
    let best = 0, run = 0;
    for (const d of diff) {
      run = ok(d) ? run + 1 : 0;
      if (run > best) best = run;
    }
    return best;
  };
  s.wasDown2 = longest((d) => d <= -2) >= 4;
  s.up3 = longest((d) => d >= 3) >= 6;
  s.down3 = longest((d) => d <= -3) >= 6;
  return s;
}

// ───────────────────────── aggregate ─────────────────────────
export const METRICS = {
  checks: { ja: "チェックの頻度", unit: "手あたり", pct: true },
  pressure: { ja: "相手キング周りを狙う駒の数", unit: "枚", pct: false },
  storm: { ja: "相手キング側へのポーン突き", unit: "回/局", pct: false },
  opposite: { ja: "反対側キャスリングの割合", unit: "", pct: true },
  invested: { ja: "駒損の状態から勝った割合（捨て駒・逆転）", unit: "勝局中", pct: true },
  queenShare: { ja: "クイーンを動かす割合（30手まで）", unit: "", pct: true },
  earlyQueen: { ja: "7手目までにクイーンを出す割合", unit: "", pct: true },
  queensOff25: { ja: "25手までにクイーン交換する割合", unit: "", pct: true },
  endgame: { ja: "エンドゲームまで行く割合", unit: "", pct: true },
  tradeRate: { ja: "駒交換の速さ（11〜30手）", unit: "取り/手", pct: false },
  space: { ja: "スペース（進んだポーンの差）", unit: "枚", pct: false },
  castleMove: { ja: "キャスリングする手数", unit: "手目", pct: false },
  knightPref: { ja: "ナイト寄りか（ビショップ比）", unit: "", pct: true },
  pawnShare: { ja: "ポーンを動かす割合", unit: "", pct: true },
  kingShare: { ja: "キングを動かす割合", unit: "", pct: true },
  winLength: { ja: "勝局の平均手数", unit: "手", pct: false },
  length: { ja: "平均手数", unit: "手", pct: false },
  e4: { ja: "白番で 1.e4 を指す割合", unit: "", pct: true },
  sicilian: { ja: "1.e4 にシシリアンで応じる割合", unit: "", pct: true },
  openFiles: { ja: "中盤でポーンのない列の数", unit: "列", pct: false },
  advance: { ja: "駒を前に出す度合い（平均の段）", unit: "段目", pct: false },
  capRate: { ja: "駒を取る手の割合", unit: "", pct: true },
  bishopPair: { ja: "20手目に二枚ビショップを保つ割合", unit: "", pct: true },
  rookShare: { ja: "ルークを動かす割合", unit: "", pct: true },
  rook7: { ja: "ルークが 7 段目に入る割合", unit: "", pct: true },
  repFocus: { ja: "初手・応手を固定している度合い", unit: "", pct: true },
  gambit: { ja: "8手目でポーン損になっている割合", unit: "", pct: true },
  devSpeed: { ja: "10手目までに出した小駒の数", unit: "枚", pct: false },
  drawRate: { ja: "引き分けの割合", unit: "", pct: true },
  // quality-flavoured: shown, but not used for the GM similarity
  mateWin: { ja: "詰ませて勝つ割合", unit: "勝局中", pct: true },
  mated: { ja: "詰まされて負ける割合", unit: "敗局中", pct: true },
  lossEv: { ja: "駒損の回数", unit: "回/局", pct: false },
  gainEv: { ja: "駒得の回数", unit: "回/局", pct: false },
  bookDepth: { ja: "定跡どおりに進む手数", unit: "手", pct: false },
} as const;
export type MetricKey = keyof typeof METRICS;

/** Metrics that describe taste rather than strength — used to find the nearest GM. */
export const STYLE_KEYS: MetricKey[] = [
  "checks", "pressure", "storm", "opposite", "invested", "queenShare", "earlyQueen", "queensOff25", "endgame",
  "tradeRate", "space", "castleMove", "knightPref", "pawnShare", "kingShare", "winLength", "e4", "sicilian",
  "openFiles", "advance", "capRate", "bishopPair", "rookShare", "rook7", "repFocus",
];

export interface Split {
  n: number;
  score: number; // 0..1
}
export interface Profile {
  n: number;
  score: number;
  m: Record<MetricKey, number>;
  splits: {
    white: Split; black: Split;
    endgame: Split; noEndgame: Split;
    queensOff: Split; queensOn: Split;
    opposite: Split; sameSide: Split;
    uncastled: Split;
    up3: Split; down3: Split;
    openings: (Split & { name: string })[];
  };
  loss: { opening: number; middle: number; endgame: number }; // events per game
  timeLossRate: number; // among losses
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs: number[]) => {
  const v = [...xs].sort((a, b) => a - b);
  return v.length ? (v.length % 2 ? v[(v.length - 1) / 2] : (v[v.length / 2 - 1] + v[v.length / 2]) / 2) : 0;
};
/** Share of the single most common first move / reply (null with too few games). */
function topShare(gs: GameStats[]): number | null {
  if (gs.length < 4) return null;
  const freq = new Map<string, number>();
  for (const g of gs) freq.set(g.first, (freq.get(g.first) ?? 0) + 1);
  return Math.max(...freq.values()) / gs.length;
}
const split = (gs: GameStats[]): Split => ({ n: gs.length, score: mean(gs.map((g) => g.score)) });

export function aggregate(gs: GameStats[]): Profile {
  const n = gs.length;
  const sum = (f: (g: GameStats) => number) => gs.reduce((a, g) => a + f(g), 0);
  const rate = (f: (g: GameStats) => boolean, of: GameStats[] = gs) => (of.length ? of.filter(f).length / of.length : 0);
  const wins = gs.filter((g) => g.score === 1), losses = gs.filter((g) => g.score === 0);
  const myMoves = sum((g) => g.myMoves) || 1;
  const piece = (t: string) => sum((g) => g.pieceMoves[t]) / myMoves;
  const whites = gs.filter((g) => g.color === "w"), blacks = gs.filter((g) => g.color === "b");
  const vsE4 = blacks.filter((g) => g.first.startsWith("B:e4 "));
  const defined = <K extends keyof GameStats>(k: K) => gs.filter((g) => g[k] !== null).map((g) => g[k] as number);

  const byOpening = new Map<string, GameStats[]>();
  for (const g of gs) if (g.opening) byOpening.set(g.opening, [...(byOpening.get(g.opening) ?? []), g]);

  return {
    n,
    score: mean(gs.map((g) => g.score)),
    m: {
      checks: sum((g) => g.checks) / myMoves,
      pressure: mean(defined("pressure")),
      storm: sum((g) => g.storm) / (n || 1),
      opposite: rate((g) => g.opposite),
      invested: rate((g) => g.wasDown2, wins),
      queenShare: sum((g) => g.queenMoves30) / (sum((g) => g.moves30) || 1),
      earlyQueen: rate((g) => g.earlyQueen),
      queensOff25: rate((g) => g.queensOffPly !== null && g.queensOffPly < 50),
      endgame: rate((g) => g.endgamePly !== null),
      tradeRate: mean(defined("tradeRate")),
      space: mean(defined("space")),
      castleMove: mean(defined("castleMove")),
      knightPref: piece("n") - piece("b"),
      pawnShare: piece("p"),
      kingShare: piece("k"),
      winLength: mean(wins.map((g) => g.plies / 2)),
      length: mean(gs.map((g) => g.plies / 2)),
      e4: rate((g) => g.first === "W:e4", whites),
      sicilian: rate((g) => g.first === "B:e4 c5", vsE4),
      mateWin: rate((g) => g.mateWin, wins),
      mated: rate((g) => g.mated, losses),
      lossEv: sum((g) => g.lossEvents[0] + g.lossEvents[1] + g.lossEvents[2]) / (n || 1),
      gainEv: sum((g) => g.gainEvents) / (n || 1),
      bookDepth: mean(gs.map((g) => g.bookPlies / 2)),
      openFiles: mean(defined("openFiles")),
      advance: mean(defined("advance")),
      capRate: sum((g) => g.captures) / myMoves,
      bishopPair: rate((g) => g.bishopPair === true, gs.filter((g) => g.bishopPair !== null)),
      rookShare: piece("r"),
      rook7: rate((g) => g.rook7),
      repFocus: mean([topShare(whites), topShare(vsE4), topShare(blacks.filter((g) => g.first.startsWith("B:d4 ")))].filter((x): x is number => x !== null)),
      gambit: rate((g) => g.gambit),
      devSpeed: mean(gs.map((g) => g.devBy10)),
      drawRate: rate((g) => g.score === 0.5),
    },
    splits: {
      white: split(whites), black: split(blacks),
      endgame: split(gs.filter((g) => g.endgamePly !== null)), noEndgame: split(gs.filter((g) => g.endgamePly === null)),
      queensOff: split(gs.filter((g) => g.queensOffPly !== null && g.queensOffPly < 60)), queensOn: split(gs.filter((g) => g.queensOffPly === null || g.queensOffPly >= 60)),
      opposite: split(gs.filter((g) => g.opposite)), sameSide: split(gs.filter((g) => !g.opposite)),
      uncastled: split(gs.filter((g) => g.castleMove === null || g.castleMove > 15)),
      up3: split(gs.filter((g) => g.up3)), down3: split(gs.filter((g) => g.down3)),
      openings: [...byOpening.entries()].map(([name, xs]) => ({ name, ...split(xs) })).sort((a, b) => b.n - a.n).slice(0, 12),
    },
    loss: { opening: sum((g) => g.lossEvents[0]) / (n || 1), middle: sum((g) => g.lossEvents[1]) / (n || 1), endgame: sum((g) => g.lossEvents[2]) / (n || 1) },
    timeLossRate: rate((g) => g.timeLoss, losses),
  };
}

// ───────────────────────── comparison with the GMs ─────────────────────────
export type GmStyles = Record<string, Record<MetricKey, number>>;

export function baseline(gms: GmStyles) {
  const ids = Object.keys(gms);
  const out = {} as Record<MetricKey, { mean: number; sd: number }>;
  for (const k of Object.keys(METRICS) as MetricKey[]) {
    // Median and median absolute deviation: one extreme player (Morphy, 19th-century opposition)
    // must not stretch the scale and flatten the differences between everyone else.
    const xs = ids.map((id) => gms[id][k]);
    const mu = median(xs);
    const mad = 1.4826 * median(xs.map((x) => Math.abs(x - mu)));
    out[k] = { mean: mu, sd: Math.max(mad, Math.abs(mu) * 0.08, 1e-6) };
  }
  return out;
}

/** How far a value sits from the typical GM, in units of the GMs' spread (clamped). */
export const zOf = (v: number, b: { mean: number; sd: number }) => Math.max(-3, Math.min(3, (v - b.mean) / b.sd));

/** Similarity of the direction of bias (cosine over the style metrics), -1..1, best first. */
export function nearestGms(m: Record<MetricKey, number>, gms: GmStyles): { id: string; sim: number }[] {
  const b = baseline(gms);
  const mine = STYLE_KEYS.map((k) => zOf(m[k], b[k]));
  const norm = (v: number[]) => Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1;
  return Object.keys(gms)
    .map((id) => {
      const g = STYLE_KEYS.map((k) => zOf(gms[id][k], b[k]));
      return { id, sim: mine.reduce((a, x, i) => a + x * g[i], 0) / (norm(mine) * norm(g)) };
    })
    .sort((a, b2) => b2.sim - a.sim);
}

export const AXES = [
  // 総合 — the five headline axes
  { id: "attack", group: "総合", ja: "攻撃性", plus: ["checks", "pressure", "storm", "opposite", "invested", "invested"], minus: [], hi: "相手キングに駒を向け、チェックと捨て駒で決めにいく", lo: "攻めを急がず、安全を優先する" },
  { id: "squeeze", group: "総合", ja: "締め付け（アナコンダ）", plus: ["space", "winLength"], minus: ["tradeRate", "checks"], hi: "駒を交換せずにスペースを取り、じわじわ相手を窒息させる", lo: "締め付けるより、早く局面を動かして決着をつける" },
  { id: "solid", group: "総合", ja: "堅実さ", plus: [], minus: ["castleMove", "invested", "earlyQueen", "opposite", "storm"], hi: "早く囲い、リスクの高い形を避ける", lo: "キングの安全より主導権を取りにいく" },
  { id: "endgame", group: "総合", ja: "エンドゲーム志向", plus: ["endgame", "queensOff25", "kingShare", "length"], minus: [], hi: "クイーン交換をいとわず、長い終盤で勝負する", lo: "中盤で決着をつけたがる" },
  { id: "queen", group: "総合", ja: "クイーン依存", plus: ["queenShare", "earlyQueen"], minus: ["queensOff25"], hi: "クイーンを早く出してよく動かし、交換を避ける", lo: "クイーンは温存し、ほかの駒で戦う" },

  { id: "kingHunt", group: "攻め方", ja: "キングへの集中", plus: ["pressure", "checks"], minus: [], hi: "相手キングの周りに駒を集め、チェックを多用する", lo: "キングを直接狙うことは少ない" },
  { id: "sac", group: "攻め方", ja: "捨て駒・リスク", plus: ["invested", "gambit"], minus: [], hi: "駒損を受け入れて攻めや主導権を買う（または駒損から逆転する）", lo: "駒の損得をきっちり守る" },
  { id: "storm", group: "攻め方", ja: "ポーンの突撃", plus: ["storm"], minus: [], hi: "相手キング側のポーンを突いて攻め筋をこじ開ける", lo: "ポーンでは攻めず、駒で攻める" },
  { id: "race", group: "攻め方", ja: "攻め合い（反対側キャスリング）", plus: ["opposite"], minus: [], hi: "キングを反対側に囲い、互いに攻め合う展開を選ぶ", lo: "同じ側に囲う落ち着いた形が多い" },
  { id: "forward", group: "攻め方", ja: "前に出る", plus: ["advance", "capRate"], minus: [], hi: "駒を敵陣に送り込み、積極的に駒を取りにいく", lo: "自陣で形を整えてから動く" },

  { id: "open", group: "局面の好み", ja: "開いた局面", plus: ["openFiles"], minus: [], hi: "ポーンを交換して列を開け、駒の利きで戦う", lo: "ポーンが残る閉じた局面が多い" },
  { id: "space", group: "局面の好み", ja: "スペース", plus: ["space"], minus: [], hi: "ポーンを進めて陣地を広げる", lo: "陣地を広げず、相手の出方を待つ" },
  { id: "simplify", group: "局面の好み", ja: "駒交換（単純化）", plus: ["tradeRate", "queensOff25"], minus: [], hi: "早めに駒を交換して局面を単純にする", lo: "交換を避けて複雑さを保つ" },
  { id: "long", group: "局面の好み", ja: "長期戦", plus: ["length", "winLength"], minus: [], hi: "手数の長い対局が多く、時間をかけて勝つ", lo: "短手数で決着することが多い" },

  { id: "knight", group: "駒の使い方", ja: "ナイト派（⇔ビショップ派）", plus: ["knightPref"], minus: ["bishopPair"], hi: "ナイトをよく動かす。二枚ビショップにこだわらない", lo: "ビショップを好み、二枚ビショップを保つ" },
  { id: "rook", group: "駒の使い方", ja: "ルークの活用", plus: ["rookShare", "rook7"], minus: [], hi: "ルークをよく働かせ、7 段目に侵入する", lo: "ルークが働く前に勝負が決まることが多い" },
  { id: "pawn", group: "駒の使い方", ja: "ポーンで戦う", plus: ["pawnShare"], minus: [], hi: "ポーンの手が多い（陣形づくり、突き崩し）", lo: "ポーンをあまり動かさず、駒を動かす" },
  { id: "king", group: "駒の使い方", ja: "キングの活動", plus: ["kingShare"], minus: [], hi: "キングもよく動く（終盤で前に出る、または追われている）", lo: "キングはほとんど動かない" },

  { id: "castle", group: "試合運び", ja: "囲いの速さ", plus: ["devSpeed"], minus: ["castleMove"], hi: "小駒を早く出し、早く囲う", lo: "展開や囲いが遅い" },
  { id: "draw", group: "試合運び", ja: "引き分けの多さ", plus: ["drawRate"], minus: [], hi: "引き分けが多い", lo: "勝ち負けがはっきり付く" },

  { id: "e4", group: "序盤", ja: "1.e4 派（開放型の序盤）", plus: ["e4"], minus: [], hi: "白番は 1.e4 が中心", lo: "白番は 1.d4 や 1.c4 など、閉じた序盤が中心" },
  { id: "sharp", group: "序盤", ja: "黒番の鋭さ（シシリアン）", plus: ["sicilian"], minus: [], hi: "1.e4 にシシリアンで反撃する", lo: "1.e4 には 1…e5 など堅い応手が中心" },
  { id: "focus", group: "序盤", ja: "レパートリーの固定度", plus: ["repFocus"], minus: [], hi: "いつも同じ初手・応手を指す", lo: "いろいろな序盤を指し分ける" },
  { id: "theory", group: "序盤", ja: "定跡の深さ", plus: ["bookDepth"], minus: [], hi: "定跡どおりに長く進む", lo: "早く定跡を外れる" },
] as const;
export const AXIS_GROUPS = ["攻め方", "局面の好み", "駒の使い方", "試合運び", "序盤"] as const;
export type AxisId = (typeof AXES)[number]["id"];

/** Axis scores: 50 = the typical GM (median), ±18 per unit of spread, clamped to 0..100. */
export function axisScores(m: Record<MetricKey, number>, gms: GmStyles): Record<AxisId, number> {
  const b = baseline(gms);
  const out = {} as Record<AxisId, number>;
  for (const a of AXES) {
    const zs = [...a.plus.map((k) => zOf(m[k as MetricKey], b[k as MetricKey])), ...a.minus.map((k) => -zOf(m[k as MetricKey], b[k as MetricKey]))];
    out[a.id] = Math.max(0, Math.min(100, 50 + 18 * mean(zs)));
  }
  return out;
}
