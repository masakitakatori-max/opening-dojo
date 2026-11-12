// 局面練習: set up any position, then play it out against the engine — again and again.
import { Chess, type Color } from "chess.js";
import { BASE } from "../lib/asset";
import { useEffect, useMemo, useRef, useState } from "react";
import Board, { type Arrow, type BadgeKind } from "../components/Board";
import { Reasons, VerdictCard } from "../components/panels";
import { explainMove } from "../lib/explain";
import { cloneMove, exploits, traits, type ClonePick } from "../lib/clone";
import { engine, type EngineLine } from "../lib/engine";
import { loadStore, windowOf } from "../lib/myGames";
import { aggregate } from "../lib/style";
import { bestMoveArrow, explainReview, povEval, reviewMove } from "../lib/review";
import { sfx } from "../lib/sound";
import { load, save } from "../lib/storage";
import { hangingPieces, VERDICT_LABEL, winPct } from "../lib/tactics";
import { ArtCard, ArtToast, useArt } from "../lib/useArt";
import { useScrollTop } from "../lib/useScrollTop";

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const SAVED_KEY = "dojo.spar.saved";
const FILES = "abcdefgh";
const STRENGTHS = [
  { id: 0, ja: "やさしい", hint: "ときどき緩い手を指す" },
  { id: 1, ja: "ふつう", hint: "最善に近い手から選ぶ" },
  { id: 2, ja: "最強", hint: "常に最善手" },
  { id: 3, ja: "🪞 過去の自分", hint: "タイプ診断で貯めた対局から、あなたの序盤・クセ・ミスの頻度を再現した分身" },
  { id: 4, ja: "👥 セルフ", hint: "白も黒も自分で指す（1 人 2 役）" },
] as const;
const CLONE = 3;
const SELF = 4;

/** Time controls: minutes + increment seconds. null = no clock. */
type TC = { m: number; inc: number } | null;
const TCS: { tc: TC; ja: string }[] = [
  { tc: null, ja: "なし" },
  { tc: { m: 3, inc: 2 }, ja: "3+2" },
  { tc: { m: 5, inc: 3 }, ja: "5+3" },
  { tc: { m: 10, inc: 5 }, ja: "10+5" },
  { tc: { m: 15, inc: 10 }, ja: "15+10" },
];
const fmtClock = (ms: number) => {
  const s = Math.max(0, ms) / 1000;
  if (s < 10) return `0:0${s.toFixed(1)}`;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
};

/** Which helpers are shown while playing. Analysis keeps running quietly either way, for the review. */
interface Assist {
  on: boolean;
  verdict: boolean; // grade of each move, best-move arrow
  eval: boolean; // evaluation of the position
  threat: boolean; // what the last move is aiming at
  rings: boolean; // pieces that can be taken for free
}
const ASSIST_KEY = "dojo.spar.assist";
const ASSIST_ITEMS: [keyof Omit<Assist, "on">, string, string][] = [
  ["verdict", "判定", "一手ごとの判定（?? など）と、最善手の矢印"],
  ["eval", "形勢", "局面の評価値"],
  ["threat", "直前の手の狙い", "直前に指された手が何を狙っているか"],
  ["rings", "危険な駒", "タダで取られる駒（赤）・取れる駒（緑）の輪"],
];

export interface SparPos {
  id: string;
  name: string;
  fen: string;
  side: Color;
  note: string;
  level: number;
  attempts: number;
  saved?: boolean;
}

// ── position <-> placement helpers ──
type Placement = Record<string, string>; // "e1" -> "wK"

function fromFen(fen: string): { pl: Placement; turn: Color } {
  const [rows, turn] = fen.split(" ");
  const pl: Placement = {};
  rows.split("/").forEach((row, ri) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) f += +ch;
      else {
        pl[`${FILES[f]}${8 - ri}`] = (ch === ch.toUpperCase() ? "w" : "b") + ch.toUpperCase();
        f++;
      }
    }
  });
  return { pl, turn: turn === "b" ? "b" : "w" };
}

function toFen(pl: Placement, turn: Color): string {
  const rows: string[] = [];
  for (let r = 8; r >= 1; r--) {
    let row = "", empty = 0;
    for (let f = 0; f < 8; f++) {
      const p = pl[`${FILES[f]}${r}`];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p[0] === "w" ? p[1] : p[1].toLowerCase();
    }
    rows.push(row + (empty || ""));
  }
  // Castling is allowed whenever king and rook stand on their original squares.
  const castle =
    (pl.e1 === "wK" && pl.h1 === "wR" ? "K" : "") + (pl.e1 === "wK" && pl.a1 === "wR" ? "Q" : "") +
    (pl.e8 === "bK" && pl.h8 === "bR" ? "k" : "") + (pl.e8 === "bK" && pl.a8 === "bR" ? "q" : "");
  return `${rows.join("/")} ${turn} ${castle || "-"} - 0 1`;
}

/** null = playable; otherwise the reason it isn't. */
function problemWith(fen: string): string | null {
  let c: Chess;
  try {
    c = new Chess(fen);
  } catch {
    const { pl } = fromFen(fen);
    const kings = (k: string) => Object.values(pl).filter((p) => p === k).length;
    if (kings("wK") !== 1 || kings("bK") !== 1) return "白と黒のキングを 1 枚ずつ置いてください。";
    return "この配置は指せません（ポーンが 1 段目・8 段目にある、など）。";
  }
  const other: Color = c.turn() === "w" ? "b" : "w";
  for (const row of c.board()) for (const p of row) if (p && p.type === "k" && p.color === other && c.isAttacked(p.square, c.turn())) return "手番でない側のキングにチェックがかかっています。手番を入れ替えてください。";
  if (c.isGameOver()) return "この局面はすでに終局しています（詰み・ステイルメイトなど）。";
  return null;
}

/** Accepts a FEN or a game record (PGN / move list); a game record gives its final position. */
function parseInput(text: string): string | null {
  const t = text.trim();
  if (!t) return null;
  try {
    return new Chess(t).fen();
  } catch {
    /* not a FEN */
  }
  try {
    const c = new Chess();
    c.loadPgn(t);
    if (c.history().length) return c.fen();
  } catch {
    /* not a PGN */
  }
  return null;
}

const selfPos = (): SparPos => ({ id: `self${Date.now()}`, name: "セルフ対局", fen: START, side: "w", note: "白も黒も自分で指す。席が替わるたびに、直前の自分の狙いを潰す手から考える", level: SELF, attempts: 0 });

export default function Spar({ initialFen, quick, start }: { initialFen?: string; quick?: { side: Color; nonce: number }; start?: "self" }) {
  const [saved, setSaved] = useState<SparPos[]>(() => load(SAVED_KEY, []));
  const [active, setActive] = useState<SparPos | null>(() => (start === "self" ? selfPos() : null));
  useEffect(() => save(SAVED_KEY, saved), [saved]);
  // "Play my past self" from the diagnosis page: straight into a game from the starting position.
  useEffect(() => {
    if (quick) setActive({ id: `clone${quick.nonce}`, name: "過去の自分と対局", fen: START, side: quick.side, note: "分身の弱点を突く（右の「突き方」を参照）", level: CLONE, attempts: 0 });
  }, [quick]);

  const update = (p: SparPos) => {
    setActive(p);
    if (p.saved) setSaved((list) => (list.some((x) => x.id === p.id) ? list.map((x) => (x.id === p.id ? p : x)) : [p, ...list]));
  };

  if (active) return <Session key={`${active.id}-${active.attempts}`} pos={active} onBack={() => setActive(null)} onUpdate={update} />;
  return (
    <Setup
      initialFen={initialFen}
      defaultLevel={start === "self" ? SELF : 1}
      saved={saved}
      onStart={(p) => update(p)}
      onDelete={(id) => setSaved((list) => list.filter((x) => x.id !== id))}
    />
  );
}

// ───────────────────────── setup ─────────────────────────
const PALETTE = ["wK", "wQ", "wR", "wB", "wN", "wP", "bK", "bQ", "bR", "bB", "bN", "bP"];

function Setup({ initialFen, defaultLevel, saved, onStart, onDelete }: { initialFen?: string; defaultLevel: number; saved: SparPos[]; onStart: (p: SparPos) => void; onDelete: (id: string) => void }) {
  const init = useMemo(() => fromFen(initialFen ?? START), [initialFen]);
  const [pl, setPl] = useState<Placement>(init.pl);
  const [turn, setTurn] = useState<Color>(init.turn);
  const [side, setSide] = useState<Color>(init.turn);
  const [tool, setTool] = useState<string>("move");
  const [held, setHeld] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [textErr, setTextErr] = useState<string>();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [level, setLevel] = useState(defaultLevel);
  const hasClone = useMemo(() => !!loadStore(), []);
  useEffect(() => {
    setPl(init.pl);
    setTurn(init.turn);
    setSide(init.turn);
  }, [init]);

  const fen = toFen(pl, turn);
  const problem = problemWith(fen);

  const click = (sq: string) => {
    if (tool === "erase") {
      const { [sq]: _gone, ...rest } = pl;
      return setPl(rest);
    }
    if (tool === "move") {
      if (held && held !== sq) {
        const { [held]: piece, ...rest } = pl;
        setPl({ ...rest, [sq]: piece });
        return setHeld(null);
      }
      return setHeld(pl[sq] && held !== sq ? sq : null);
    }
    if (pl[sq] === tool) {
      const { [sq]: _gone, ...rest } = pl;
      return setPl(rest);
    }
    setPl({ ...pl, [sq]: tool });
  };

  const loadText = () => {
    const f = parseInput(text);
    if (!f) return setTextErr("FEN としても棋譜としても読めませんでした。");
    setTextErr(undefined);
    const x = fromFen(f);
    setPl(x.pl);
    setTurn(x.turn);
    setSide(x.turn);
  };

  const start = (keep: boolean) => {
    if (problem) return;
    onStart({ id: `p${Date.now()}`, name: name.trim() || "名前なしの局面", fen, side, note: note.trim(), level, attempts: 0, saved: keep });
  };

  const squares = [];
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = side === "w" ? col : 7 - col;
      const r = side === "w" ? 8 - row : row + 1;
      const sq = `${FILES[f]}${r}`;
      const piece = pl[sq];
      squares.push(
        <div key={sq} className={`sq ${(f + r) % 2 === 1 ? "dark" : "light"}`} onClick={() => click(sq)}>
          {held === sq && <div className="hl-sel" />}
          {col === 0 && <span className={`coord rank ${(f + r) % 2 === 1 ? "on-dark" : "on-light"}`}>{r}</span>}
          {row === 7 && <span className={`coord file ${(f + r) % 2 === 1 ? "on-dark" : "on-light"}`}>{FILES[f]}</span>}
          {piece && <img className="piece" src={`${BASE}pieces/${piece}.svg`} draggable={false} alt="" />}
        </div>,
      );
    }
  }

  return (
    <div className="picker spar-setup">
      <header className="picker-head">
        <h1>局面練習</h1>
        <p>
          <strong>好きな局面を再現して、そこから何度でも指し直す。</strong>相手はエンジンが務め、あなたの一手ごとに判定と理由が出ます。
          「この形からどう攻めるか」「この有利を勝ちきれるか」を、同じ局面で繰り返して体に入れる練習です。
        </p>
      </header>

      <div className="spar-grid">
        <div>
          <div className="board spar-board">{squares}</div>
          <div className="spar-palette">
            <button className={`pal ${tool === "move" ? "on" : ""}`} onClick={() => setTool("move")} title="駒をクリック → 移動先をクリック">✋ 動かす</button>
            {PALETTE.map((p) => (
              <button key={p} className={`pal ${tool === p ? "on" : ""}`} onClick={() => { setTool(p); setHeld(null); }}><img src={`${BASE}pieces/${p}.svg`} alt={p} /></button>
            ))}
            <button className={`pal ${tool === "erase" ? "on" : ""}`} onClick={() => { setTool("erase"); setHeld(null); }}>🗑 消す</button>
          </div>
          <div className="spar-row">
            <button className="chip" onClick={() => { const x = fromFen(START); setPl(x.pl); setTurn("w"); }}>初期配置</button>
            <button className="chip" onClick={() => setPl({ e1: "wK", e8: "bK" })}>キングだけ残す</button>
          </div>
        </div>

        <div className="spar-form">
          <div className="card">
            <div className="card-title">貼り付けて再現 <span className="muted">— FEN または棋譜（PGN。最後の局面になります）</span></div>
            <textarea value={text} onChange={(e) => { setText(e.target.value); setTextErr(undefined); }} placeholder="例：r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3　／　1. e4 e5 2. Nf3 Nc6 3. Bc4" rows={3} />
            <div className="spar-row">
              <button className="chip on" onClick={loadText}>読み込む</button>
              {textErr && <span className="tone-neg small">{textErr}</span>}
            </div>
          </div>

          <div className="card">
            <div className="card-title">設定</div>
            <div className="spar-row"><span className="spar-label">手番</span>
              {(["w", "b"] as Color[]).map((c) => <button key={c} className={`chip ${turn === c ? "on" : ""}`} onClick={() => setTurn(c)}>{c === "w" ? "白から" : "黒から"}</button>)}
            </div>
            <div className="spar-row"><span className="spar-label">あなた</span>
              {(["w", "b"] as Color[]).map((c) => <button key={c} className={`chip ${side === c ? "on" : ""}`} onClick={() => setSide(c)}>{c === "w" ? "白を持つ" : "黒を持つ"}</button>)}
            </div>
            <div className="spar-row"><span className="spar-label">相手</span>
              {STRENGTHS.map((s) => <button key={s.id} className={`chip ${level === s.id ? "on" : ""}`} disabled={s.id === CLONE && !hasClone} onClick={() => setLevel(s.id)} title={s.id === CLONE && !hasClone ? "先に「タイプ診断」で自分の対局を取り込んでください" : s.hint}>{s.ja}</button>)}
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="局面の名前（例：ナイドルフ 6.Be3 の中盤）" />
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="今回の狙い（例：…b5-b4 でクイーンサイドから攻める）" />
            <div className="spar-fen muted small">{fen}</div>
            {problem && <div className="tone-neg small">{problem}</div>}
            <div className="fb-actions">
              <button className="primary" disabled={!!problem} onClick={() => start(true)}>保存して練習開始 ▶</button>
              <button disabled={!!problem} onClick={() => start(false)}>保存せずに開始</button>
            </div>
          </div>
        </div>
      </div>

      {saved.length > 0 && (
        <section>
          <h3 className="picker-group">保存した局面</h3>
          <div className="course-grid">
            {saved.map((p) => (
              <div key={p.id} className="course spar-saved">
                <button className="spar-open" onClick={() => onStart(p)}>
                  <div className="course-title">{p.name}</div>
                  <div className="course-sub">{p.note || "（狙いメモなし）"}</div>
                  <div className="muted small" style={{ marginTop: 8 }}>{p.side === "w" ? "白" : "黒"}を持つ ・ 相手 {STRENGTHS[p.level]?.ja} ・ 挑戦 {p.attempts} 回</div>
                </button>
                <button className="link" onClick={() => onDelete(p.id)}>削除</button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ───────────────────────── session ─────────────────────────
interface Mv {
  san: string;
  from: string;
  to: string;
  before: string;
  fen: string;
  by: "me" | "opp";
  pick?: ClonePick; // how the clone chose this move
}

/** Engine reply by strength: best move, or a random one among those close enough to the best. */
function chooseReply(lines: EngineLine[], color: Color, level: number): EngineLine {
  if (level >= 2 || lines.length === 1) return lines[0];
  const wp = (l: EngineLine) => winPct(l.cp, l.mate, color);
  const best = wp(lines[0]);
  const margin = level === 1 ? 5 : 14;
  const ok = lines.filter((l) => best - wp(l) <= margin);
  // "ふつう" still prefers the better moves; "やさしい" picks evenly.
  const weights = ok.map((_, i) => (level === 1 ? 1 / (i + 1) : 1));
  let x = Math.random() * weights.reduce((a, b) => a + b, 0);
  for (let i = 0; i < ok.length; i++) if ((x -= weights[i]) <= 0) return ok[i];
  return ok[0];
}

const plyAfter = (fenAfter: string) => {
  const [, turn, , , , full] = fenAfter.split(" ");
  return turn === "b" ? +full * 2 - 1 : (+full - 1) * 2;
};

function Session({ pos, onBack, onUpdate }: { pos: SparPos; onBack: () => void; onUpdate: (p: SparPos) => void }) {
  useScrollTop();
  const [moves, setMoves] = useState<Mv[]>([]);
  const [level, setLevel] = useState(pos.level);
  // The clone opponent: the user's stored games, summarised once per session.
  const clone = useMemo(() => {
    if (level !== CLONE) return null;
    const st = loadStore();
    if (!st) return null;
    const games = windowOf(st);
    const p = aggregate(games);
    return { p, book: st.book, who: st.who, n: games.length, traits: traits(p), exploits: exploits(p) };
  }, [level]);
  const self = level === SELF;
  const [assist, setAssistState] = useState<Assist>(() => ({ on: true, verdict: true, eval: true, threat: true, rings: true, ...load<Partial<Assist>>(ASSIST_KEY, {}) }));
  const setAssist = (a: Assist) => {
    setAssistState(a);
    save(ASSIST_KEY, a);
  };
  const show = { verdict: assist.on && assist.verdict, eval: assist.on && assist.eval, threat: assist.on && assist.threat, rings: assist.on && assist.rings, hint: assist.on };
  // The board stays put by default: a view that turns every move is hard to follow. Opt in to turn it.
  const [autoFlip, setAutoFlip] = useState<boolean>(() => load("dojo.self.autoflip", false));
  const [manualSide, setManualSide] = useState<Color>(pos.side);
  const [copied, setCopied] = useState(false);
  // 芸術点: named moves and formations played by a human (both sides in self mode). Points only without assists.
  const art = useArt();
  const [hint, setHint] = useState(false);
  const [hints, setHints] = useState(0);
  const [evalVer, bump] = useState(0);
  const [thinking, setThinking] = useState(false);
  const [animKey, setAnimKey] = useState(0);
  const me = pos.side;
  const fen = moves.length ? moves[moves.length - 1].fen : pos.fen;
  const chess = useMemo(() => new Chess(fen), [fen]);
  const turn = chess.turn();

  // Game clock: starts with the first move; the side that just moved gets the increment.
  const [tc, setTcState] = useState<TC>(() => load<TC>("dojo.spar.clock", null));
  const [clock, setClock] = useState<{ w: number; b: number }>(() => ({ w: (tc?.m ?? 0) * 60e3, b: (tc?.m ?? 0) * 60e3 }));
  const [flag, setFlag] = useState<Color>();
  const tick = useRef(0);
  const flagRef = useRef<Color>();
  flagRef.current = flag;
  const setTc = (t: TC) => {
    setTcState(t);
    save("dojo.spar.clock", t);
    setClock({ w: (t?.m ?? 0) * 60e3, b: (t?.m ?? 0) * 60e3 });
    setFlag(undefined);
  };
  const over = chess.isGameOver() || !!flag;
  const clockOn = !!tc && moves.length > 0 && !over;
  useEffect(() => {
    if (!tc || !moves.length) return;
    const mover = moves[moves.length - 1].before.split(" ")[1] as Color;
    setClock((c) => ({ ...c, [mover]: c[mover] + tc.inc * 1000 }));
    tick.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moves.length]);
  useEffect(() => {
    if (!clockOn) return;
    tick.current = Date.now();
    const id = setInterval(() => {
      const t = Date.now();
      const dt = t - tick.current;
      tick.current = t;
      setClock((c) => {
        const left = c[turn] - dt;
        if (left <= 0) setFlag(turn);
        return { ...c, [turn]: Math.max(0, left) };
      });
    }, 100);
    return () => clearInterval(id);
  }, [clockOn, turn]);

  // Every new position is analysed once: it grades the move just played, and gives the opponent's reply.
  useEffect(() => {
    if (over) return;
    let live = true;
    const started = Date.now();
    setThinking(true);
    engine.run({ fen, multipv: clone ? 8 : 4, depth: clone ? 11 : 13 }).then((lines) => {
      if (!live) return;
      setThinking(false);
      bump((n) => n + 1);
      if (self || turn === me || !lines.length) return; // self mode: nobody answers for you
      const pick = clone ? cloneMove(fen, lines, clone.p, clone.book, +fen.split(" ")[5] || 1) ?? undefined : undefined;
      const uci = pick?.uci ?? chooseReply(lines, turn, Math.min(level, 1)).pv[0];
      setTimeout(() => {
        if (!live || flagRef.current) return;
        const c = new Chess(fen);
        const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
        setMoves((ms) => [...ms, { san: m.san, from: m.from, to: m.to, before: fen, fen: c.fen(), by: "opp", pick }]);
        setAnimKey((k) => k + 1);
        (m.captured ? sfx.capture : sfx.move)();
      }, Math.max(0, 500 - (Date.now() - started)));
    });
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fen, self]);

  const onMove = (from: string, to: string, promotion?: string) => {
    if ((!self && turn !== me) || over) return;
    const c = new Chess(fen);
    const m = c.move({ from, to, promotion });
    art.move(fen, c.fen(), { from, to, promotion }, m.color, !assist.on);
    setMoves((ms) => [...ms, { san: m.san, from: m.from, to: m.to, before: fen, fen: c.fen(), by: "me" }]);
    setHint(false);
    setAnimKey((k) => k + 1);
    (m.captured ? sfx.capture : sfx.move)();
  };

  const takeBack = () => {
    setHint(false);
    setMoves((ms) => {
      let n = ms.length;
      if (self) return ms.slice(0, Math.max(0, n - 1)); // one move at a time when you play both sides
      if (n && ms[n - 1].by === "opp") n--;
      if (n && ms[n - 1].by === "me") n--;
      return ms.slice(0, n);
    });
  };

  const reviews = useMemo(
    () => moves.map((m) => (m.by === "me" ? reviewMove(m.before, m.fen, { from: m.from, to: m.to }, false) : undefined)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [moves, evalVer],
  );
  let lastMine = -1;
  for (let k = moves.length - 1; k >= 0; k--) if (moves[k].by === "me") { lastMine = k; break; }
  const lastReview = lastMine >= 0 ? reviews[lastMine] : undefined;
  const lastMv = lastMine >= 0 ? moves[lastMine] : undefined;
  const colorOf = (m: Mv) => m.before.split(" ")[1] as Color;
  // A sacrifice the engine approves of (!!) is only known once the analysis arrives.
  useEffect(() => {
    reviews.forEach((r, k) => {
      if (r?.verdict === "brilliant" && moves[k]?.by === "me") art.brilliant(colorOf(moves[k]), !assist.on, moves[k].before, moves[k]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviews]);
  useEffect(() => {
    if (over) art.finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [over]);
  const count = (vs: string[], c?: Color) => reviews.filter((r, k) => r && vs.includes(r.verdict) && (!c || colorOf(moves[k]) === c)).length;
  const mineCount = moves.filter((m) => m.by === "me").length;
  const tally = (c?: Color) => `最善・良い手 ${count(["brilliant", "best", "good"], c)} ／ 疑問手 ${count(["inaccuracy"], c)} ／ 悪手 ${count(["mistake"], c)} ／ ブランダー ${count(["blunder"], c)}`;

  const pov: Color = self ? "w" : me; // self mode has no "my side": show White's view
  const startEval = povEval(engine.cached(pos.fen)?.[0], pov);
  const nowLine = engine.cached(fen)?.[0];
  const nowEval = povEval(nowLine, pov);
  const myMove = (self || turn === me) && !over;
  const best = myMove ? nowLine?.pv[0] : undefined;
  const orientation: Color = self ? (autoFlip ? turn : manualSide) : me;

  let arrows: Arrow[] = [];
  if (show.hint && hint && best) arrows = [{ from: best.slice(0, 2), to: best.slice(2, 4), color: "#4f8ef7", width: 16, opacity: 0.85 }];
  const wrongArrow = show.verdict && moves.length && moves[moves.length - 1].by === "me" ? bestMoveArrow(lastReview) : undefined;
  const last = moves[moves.length - 1];
  const badge: { sq: string; kind: BadgeKind } | undefined =
    show.verdict && last?.by === "me" && lastReview && lastReview.verdict !== "book" ? { sq: last.to, kind: lastReview.verdict } : undefined;
  const rings = show.rings && myMove ? (() => {
    const h = hangingPieces(fen);
    return [...h.mine.map((sq) => ({ sq, kind: "mine" as const })), ...h.theirs.map((sq) => ({ sq, kind: "theirs" as const }))];
  })() : [];
  // What the last move is up to — the opponent's move, or in self mode the move you just made for the other side.
  const threatOf = show.threat && last && !over && (last.by === "opp" || self) ? explainMove(last.before, last.from + last.to, engine.evalsOf(last.before)?.get(last.from + last.to)) : undefined;

  let result: string | undefined;
  if (flag) {
    result = self ? `${flag === "w" ? "黒" : "白"}の勝ち（時間切れ）` : flag === me ? "負け（時間切れ）" : "勝ち（相手の時間切れ）";
  } else if (over) {
    if (chess.isCheckmate()) result = self ? `${turn === "w" ? "黒" : "白"}の勝ち（チェックメイト）` : turn === me ? "負け（チェックメイトされました）" : "勝ち（チェックメイト！）";
    else result = "引き分け";
  }
  if (wrongArrow) arrows = [...arrows, wrongArrow];

  const copyPgn = () => {
    const parts: string[] = [];
    moves.forEach((m, k) => {
      const [, t, , , , full] = m.before.split(" ");
      parts.push(t === "w" ? `${full}. ${m.san}` : k === 0 ? `${full}... ${m.san}` : m.san);
    });
    const head = pos.fen === START ? "" : `[SetUp "1"]\n[FEN "${pos.fen}"]\n\n`;
    void navigator.clipboard?.writeText(head + parts.join(" ")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="board-stack">
          {tc && <ClockBar ms={clock[orientation === "w" ? "b" : "w"]} on={clockOn && turn !== orientation} label={self ? (orientation === "w" ? "黒" : "白") : "相手"} />}
          <Board
            fen={fen}
            orientation={orientation}
            lastMove={last ? { from: last.from, to: last.to } : undefined}
            movable={myMove ? turn : "none"}
            onMove={onMove}
            arrows={arrows}
            rings={rings}
            banner={<ArtToast art={art} />}
            badge={badge}
            animKey={animKey}
            glow={false}
          />
          {tc && <ClockBar ms={clock[orientation]} on={clockOn && turn === orientation} label={self ? (orientation === "w" ? "白" : "黒") : "あなた"} />}
          <div className="legend">
            <span className="muted small">
              {self
                ? over ? "終局" : `${turn === "w" ? "白" : "黒"}の番です（両方あなたが指します）。`
                : <>あなたは{me === "w" ? "白" : "黒"}。{over ? "終局" : turn === me ? "あなたの番です。" : "相手が考えています…"}</>}
              {show.hint && thinking && myMove ? "（エンジンが局面を読んでいます）" : ""}
            </span>
            <span className="legend-sep" />
            {self && <button className={`chip ${autoFlip ? "on" : ""}`} onClick={() => { save("dojo.self.autoflip", !autoFlip); setAutoFlip(!autoFlip); }} title="ON にすると、手番が替わるたびに盤をその側から見た向きに回します">盤を手番に合わせる</button>}
            {self && !autoFlip && <button className="chip" onClick={() => setManualSide(manualSide === "w" ? "b" : "w")} title="盤を反転（白側／黒側から見る）">⇅ 反転</button>}
            {show.hint && <button className="chip" disabled={!best} onClick={() => { if (!hint) setHints((h) => h + 1); setHint(!hint); }}>💡 ヒント</button>}
            <button className="chip" disabled={!moves.length} onClick={takeBack}>↩ 1 手戻す</button>
            <button className="chip" onClick={() => onUpdate({ ...pos, level, attempts: pos.attempts + 1 })}>⟲ 最初から</button>
          </div>
        </div>
      </div>

      <aside className="panel">
        <div className="panel-scroll">
          <div className="card">
            <div className="drill-head">
              <button className="link" onClick={onBack}>← 局面の設定</button>
              <span className="muted small">挑戦 {pos.attempts + 1} 回目</span>
            </div>
            <h2 className="op-name">{pos.name}</h2>
            {pos.note && <div className="idea"><span className="idea-move">今回の狙い</span><span>{pos.note}</span></div>}
            <div className="spar-row" style={{ marginTop: 10 }}><span className="spar-label">相手</span>
              {STRENGTHS.map((s) => <button key={s.id} className={`chip ${level === s.id ? "on" : ""}`} disabled={s.id === CLONE && !loadStore()} onClick={() => setLevel(s.id)} title={s.hint}>{s.ja}</button>)}
              {!pos.saved && <button className="chip" style={{ marginLeft: "auto" }} onClick={() => onUpdate({ ...pos, level, saved: true })}>この局面を保存</button>}
            </div>
            <div className="spar-row"><span className="spar-label">時計</span>
              {TCS.map((x) => (
                <button key={x.ja} className={`chip ${(tc?.m ?? 0) === (x.tc?.m ?? 0) ? "on" : ""}`} disabled={moves.length > 0 && !over} onClick={() => setTc(x.tc)} title={x.tc ? `持ち時間 ${x.tc.m} 分、1 手ごとに ${x.tc.inc} 秒加算` : "時計を使わない"}>{x.ja}</button>
              ))}
              {tc && <span className="muted small">最初の一手から動きます{moves.length > 0 && !over ? "（対局中は変更できません）" : ""}</span>}
            </div>
          </div>

          <div className="card assist-card">
            <div className="spar-row" style={{ marginTop: 0 }}>
              <span className="spar-label">補助</span>
              <button className={`chip ${assist.on ? "on" : ""}`} onClick={() => { setHint(false); setAssist({ ...assist, on: !assist.on }); }}>{assist.on ? "ON" : "OFF"}</button>
              {assist.on && ASSIST_ITEMS.map(([k, ja, tip]) => (
                <button key={k} className={`chip ${assist[k] ? "on" : ""}`} title={tip} onClick={() => setAssist({ ...assist, [k]: !assist[k] })}>{ja}</button>
              ))}
            </div>
            {!assist.on && <div className="muted small" style={{ marginTop: 6 }}>補助なしで指しています。採点は裏で続けているので、ON にすると、ここまでの全部の手の判定が出ます（振り返り）。</div>}
          </div>

          <ArtCard art={art} assistOn={assist.on} both={self} />

          {self && assist.on && last && !over && (
            <div className="card coach-card">
              <b>いまは{turn === "w" ? "白" : "黒"}番。</b>
              <div className="small">まず、直前の{turn === "w" ? "黒" : "白"}の手 {last.san} の狙いを言葉にする。それを受けるか、上回る手から考える。</div>
            </div>
          )}

          {level === CLONE && !clone && <div className="card tone-neg small">分身のデータがありません。「タイプ診断」で自分の対局を取り込んでください。それまでは「ふつう」の強さで指します。</div>}
          {clone && (() => {
            let k = -1;
            for (let i = moves.length - 1; i >= 0; i--) if (moves[i].by === "opp" && moves[i].pick) { k = i; break; }
            const mv = k >= 0 ? moves[k] : undefined;
            // A slip is only named once the user has answered it — spotting it is the exercise.
            const answered = k >= 0 && (k < moves.length - 1 || over);
            const reply = k >= 0 ? reviews[k + 1] : undefined;
            const slips = moves.map((m, i) => ({ m, i })).filter((x) => x.m.pick?.kind === "slip" && moves[x.i + 1]);
            const slipOk = (i: number) => ["best", "good", "brilliant"].includes(reviews[i + 1]?.verdict ?? "");
            const punished = slips.filter((x) => slipOk(x.i)).length;
            const lastSlip = slips[slips.length - 1];
            return (
              <div className="card clone-card">
                <div className="card-title">🪞 分身：過去の{clone.who} <span className="muted">— 直近 {clone.n} 局から再現</span></div>
                {mv?.pick && (
                  <div className={`clone-move k-${mv.pick.kind}`}>
                    <b>分身の一手：{mv.san}</b>
                    <div className="small">
                      {mv.pick.kind !== "slip" ? mv.pick.why : answered ? mv.pick.why : "理由は、あなたが次の一手を指したあとに表示します。"}
                    </div>
                    {mv.pick.kind === "slip" && answered && reply && reply.verdict !== "book" && (
                      <div className="small">{["best", "good", "brilliant"].includes(reply.verdict) ? "✓ あなたはこのミスを咎めました。" : `✗ 咎め損ねました${reply.bestSan ? `（最善は ${reply.bestSan}）` : ""}。`}</div>
                    )}
                  </div>
                )}
                {lastSlip && lastSlip.i !== k && (
                  <div className="clone-move k-slip" style={{ marginTop: 6 }}>
                    <b>直近のミスの再現：{lastSlip.m.san}</b>
                    <div className="small">{lastSlip.m.pick!.why}</div>
                    <div className="small">{slipOk(lastSlip.i) ? "✓ あなたはこのミスを咎めました。" : `✗ 咎め損ねました${reviews[lastSlip.i + 1]?.bestSan ? `（最善は ${reviews[lastSlip.i + 1]!.bestSan}）` : ""}。`}</div>
                  </div>
                )}
                {slips.length > 0 && <div className="muted small" style={{ marginTop: 6 }}>分身のミス {slips.length} 回のうち、咎めたのは {punished} 回</div>}
                {clone.exploits.length > 0 && (
                  <>
                    <div className="plans-title" style={{ marginTop: 10 }}>過去のあなたの弱点と、突き方</div>
                    <ul className="plan-list">{clone.exploits.map((e) => <li key={e.weak}><b>{e.weak}</b><br /><span className="muted">→ {e.how}</span></li>)}</ul>
                  </>
                )}
                {clone.traits.length > 0 && (
                  <>
                    <div className="plans-title" style={{ marginTop: 10 }}>再現しているクセ</div>
                    <div className="gm-chips">{clone.traits.map((t) => <span key={t} className="gm-chip">{t}</span>)}</div>
                  </>
                )}
                {clone.n < 30 && <div className="tone-neg small" style={{ marginTop: 8 }}>対局が {clone.n} 局と少ないので、分身の再現度はまだ低めです。</div>}
              </div>
            );
          })()}

          {(show.eval || show.verdict) && (
            <div className="card">
              {show.eval && (
                <>
                  <div className="card-title">形勢 <span className="muted">— {self ? "白から見た評価（＋白有利／−黒有利）" : "あなたから見た評価（＋有利／−不利）"}</span></div>
                  <div className="spar-eval">
                    <span>開始時 <b className={`tone-${startEval.tone}`}>{startEval.text}</b></span>
                    <span>→</span>
                    <span>いま <b className={`tone-${nowEval.tone}`}>{over ? "終局" : nowEval.text}</b></span>
                  </div>
                </>
              )}
              {show.verdict && mineCount > 0 && (
                <div className="muted small" style={{ marginTop: 6 }}>
                  {self ? <>白：{tally("w")}<br />黒：{tally("b")}</> : <>あなたの {mineCount} 手：{tally()}</>} ・ ヒント {hints} 回
                </div>
              )}
            </div>
          )}

          {result && (
            <div className={`card feedback ${result.includes("勝ち") ? "fb-done" : "fb-soft"}`}>
              <div className="fb-title">{result}</div>
              <div className="fb-actions">
                <button className="primary" onClick={() => onUpdate({ ...pos, level, attempts: pos.attempts + 1 })}>同じ局面をもう一度 ▶</button>
                <button onClick={onBack}>別の局面へ</button>
              </div>
            </div>
          )}

          {show.verdict && lastMv && <VerdictCard review={lastReview} san={lastMv.san} ply={plyAfter(lastMv.fen)} ex={explainReview(lastMv.before, lastReview, lastMv)} />}
          {show.verdict && lastMv && !lastReview && !over && <div className="card muted small">{lastMv.san} を採点中…</div>}
          {threatOf && last && !(self && show.verdict && lastReview) && (
            <div className="card">
              <div className="card-title">{self ? "直前の手" : "相手の一手"} {last.san} の狙い</div>
              <Reasons ex={threatOf} max={4} />
            </div>
          )}

          <div className="card">
            <div className="card-title">棋譜 <button className="link" style={{ float: "right" }} disabled={!moves.length} onClick={copyPgn}>{copied ? "コピーしました" : "棋譜をコピー"}</button></div>
            {moves.length === 0 && <div className="muted small">{myMove ? "最初の一手をどうぞ。" : "相手の手を待っています…"}</div>}
            <div className="seq">
              {moves.map((m, k) => {
                const v = reviews[k]?.verdict;
                const bad = v === "inaccuracy" || v === "mistake" || v === "blunder" || v === "brilliant";
                return (
                  <span key={k} className={`seq-m shown ${(self ? colorOf(m) === "w" : m.by === "me") ? "mine" : "opp"}`}>
                    {m.san}
                    {show.verdict && v && v !== "book" && bad && <b style={{ color: VERDICT_LABEL[v].color }}>{VERDICT_LABEL[v].sym}</b>}
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}


function ClockBar({ ms, on, label }: { ms: number; on: boolean; label: string }) {
  return (
    <div className={`clock-bar ${on ? "on" : ""} ${ms < 20e3 ? "low" : ""}`}>
      <span className="clock-label">{label}</span>
      <span className="clock-time">{fmtClock(ms)}</span>
    </div>
  );
}
