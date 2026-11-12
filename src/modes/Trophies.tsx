// トロフィー: everything that can earn 芸術点, what has been earned so far — and, on a tap,
// a board that replays the route to the moment, then lets you play the move (for reference: no points).
import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import Board, { type Arrow, type SquareMark } from "../components/Board";
import { TROPHY_DEMOS, type TrophyDemo } from "../data/trophyDemos";
import { bookMarks, engineMarksArrows } from "../components/panels";
import { engine, type EngineLine } from "../lib/engine";
import { illustrate } from "../lib/illustrate";
import { gradedMarks, gradePiece } from "../lib/review";
import { SpeedSlider, useReplaySpeed } from "../lib/replaySpeed";
import { sfx } from "../lib/sound";
import { load, save } from "../lib/storage";
import { candidates, namedNodes, openingChain, pathTo } from "../lib/tree";
import { detect, loadLog, NOT_COVERED, openingAward, openingPoints, TROPHIES, type MoveCtx, type TrophyCat } from "../lib/trophies";

const CATS: { cat: TrophyCat; what: string }[] = [
  { cat: "特別な手", what: "ルールで決まった特別な指し方" },
  { cat: "戦術", what: "一手で決まる、駒の利きの形" },
  { cat: "捨て駒", what: "駒を差し出して、それ以上を得る" },
  { cat: "駒の配置", what: "どこに何を置くか" },
  { cat: "ポーン構造", what: "ポーンの骨格" },
  { cat: "詰みの型", what: "詰んだ瞬間の形" },
  { cat: "終盤の技術", what: "駒が減ってからの決まった技" },
];
const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const EXACT = new Set(["brilliant", "queenSac"]); // judged by the engine in games: on the demo, the move itself is the answer
type Mv = { from: string; to: string; promotion?: string };

interface Demo extends TrophyDemo {
  id: string;
  title: string;
  pts: number;
  what: string;
  earns: (fenBefore: string, m: Mv, ctx: MoveCtx) => boolean;
}

export default function Trophies() {
  const [log, setLog] = useState(loadLog);
  useEffect(() => setLog(loadLog()), []); // the game just left saves its score as it closes
  const [demo, setDemo] = useState<Demo>();
  const openings = useMemo(
    () =>
      namedNodes()
        .map((n) => ({ name: n.info!.name!, pts: openingPoints(openingChain(n).length), node: n }))
        .filter((o, i, a) => a.findIndex((x) => x.name === o.name) === i)
        .sort((a, b) => a.pts - b.pts || a.name.localeCompare(b.name, "ja")),
    [],
  );
  const got = (id: string) => log.earned[id];
  const earnedCount = TROPHIES.filter((t) => got(t.id)).length;
  const openCount = openings.filter((o) => got(`open:${o.name}`)).length;

  const openTrophy = (t: (typeof TROPHIES)[number]) => {
    const d = TROPHY_DEMOS[t.id];
    if (!d) return;
    const last = d.line[d.line.length - 1];
    setDemo({
      ...d, id: t.id, title: t.ja, pts: t.pts, what: t.what,
      earns: (fen, m, ctx) => (EXACT.has(t.id) ? m.from + m.to === last.slice(0, 4) : detect(fen, m, ctx).some((a) => a.id === t.id)),
    });
  };
  const openOpening = (o: (typeof openings)[number]) => {
    const sans = pathTo(o.node);
    const c = new Chess();
    for (const s of sans.slice(0, -1)) c.move(s);
    const m = c.move(sans[sans.length - 1]);
    setDemo({
      id: `open:${o.name}`, lead: sans.slice(0, -1), line: [m.from + m.to + (m.promotion ?? "")], title: o.name, pts: o.pts,
      what: "自分の一手でこの型に入ると獲得できます。",
      tip: sans.length > 1 ? "次の一手でこの型に入ります。" : "初手でこの型に入ります。",
      earns: (f, mv) => {
        try {
          const x = new Chess(f);
          x.move(mv);
          return openingAward(f, x.fen())?.id === `open:${o.name}`;
        } catch {
          return false;
        }
      },
    });
  };

  return (
    <div className="picker trophy-page">
      <header className="picker-head">
        <h1>トロフィー</h1>
        <p>
          名前のついた手・陣形・詰みの型・定跡を、<strong>補助なしで</strong>自分で指すと「芸術点」が入ります。
          対象は「局面練習」と「セルフ対局」。補助が ON の間は、達成しても点は入りません（参考として表示だけされます）。同じものは 1 局に 1 回まで。
          <br /><strong>トロフィーを押すと、その形に至る手順をリプレイし、決め手を自分で指して確かめられます。</strong>
        </p>
      </header>

      <div className="trophy-summary">
        <div className="card"><div className="muted small">累計の芸術点</div><b>{log.total}</b></div>
        <div className="card"><div className="muted small">1 局の最高点</div><b>{log.best}</b></div>
        <div className="card"><div className="muted small">集めた種類</div><b>{earnedCount + openCount}<span className="muted"> / {TROPHIES.length + openings.length}</span></b></div>
      </div>

      {CATS.map(({ cat, what }) => (
        <section key={cat}>
          <h3 className="picker-group">{cat} <span className="muted small">— {what}</span></h3>
          <div className="trophy-grid">
            {TROPHIES.filter((t) => t.cat === cat).map((t) => {
              const e = got(t.id);
              return (
                <button key={t.id} className={`trophy ${e ? "got" : ""}`} onClick={() => openTrophy(t)}>
                  <div className="trophy-top">
                    <span className={`trophy-icon ${e ? "" : "dim"}`}>🏆</span>
                    <span className="trophy-name">{t.ja}</span>
                    <span className="trophy-pts">+{t.pts}</span>
                  </div>
                  <div className="trophy-what">{t.what}</div>
                  <div className="muted small">{e ? `${e.n} 回達成 ・ 初回 ${new Date(e.first).toLocaleDateString("ja-JP")}` : "未獲得"}<span className="trophy-try">指してみる ▶</span></div>
                </button>
              );
            })}
          </div>
        </section>
      ))}

      <section>
        <h3 className="picker-group">型（定跡）コレクション <span className="muted small">— 自分の一手でその型に入ると獲得。{openCount} / {openings.length}</span></h3>
        <div className="trophy-openings">
          {openings.map((o) => {
            const e = got(`open:${o.name}`);
            return (
              <button key={o.name} className={`op-chip ${e ? "got" : ""}`} title={e ? `${e.n} 回` : "未獲得"} onClick={() => openOpening(o)}>
                {o.name} <b>+{o.pts}</b>
              </button>
            );
          })}
        </div>
      </section>

      <p className="muted small" style={{ marginTop: 24, lineHeight: 1.8 }}>
        収録していない名前：{NOT_COVERED.join("、")}。いずれも「指した手の意図」や「ほかに何が指せたか」で決まり、盤面の形だけでは判定できないため外しています。
      </p>

      {demo && <DemoModal key={demo.id} demo={demo} onClose={() => setDemo(undefined)} />}
    </div>
  );
}

interface Pos {
  fen: string;
  from?: string;
  to?: string;
  san?: string;
}
function replay(fen: string, moves: (string | Mv)[]): Pos[] {
  const c = new Chess(fen);
  const out: Pos[] = [{ fen: c.fen() }];
  for (const x of moves) {
    const m = c.move(typeof x === "string" ? x : x);
    out.push({ fen: c.fen(), from: m.from, to: m.to, san: m.san });
  }
  return out;
}
const uciMv = (u: string): Mv => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const numbered = (ps: Pos[]) =>
  ps.slice(1).map((p, i) => {
    const [, turn, , , , full] = ps[i].fen.split(" ");
    return turn === "w" ? `${full}.${p.san}` : i === 0 ? `${full}…${p.san}` : p.san;
  }).join(" ");

/** Replay the route, then play the move(s) yourself. Opponent replies play themselves. */
function DemoModal({ demo, onClose }: { demo: Demo; onClose: () => void }) {
  const leadPos = useMemo(() => replay(demo.fen ?? START, demo.lead ?? []), [demo]);
  const moment = leadPos[leadPos.length - 1];
  const linePos = useMemo(() => replay(moment.fen, demo.line.map(uciMv)), [demo, moment]);
  const me = moment.fen.split(" ")[1] as "w" | "b";
  const total = demo.line.length;

  const [step, setStep] = useState(0); // plies of the line on the board
  const [alt, setAlt] = useState<Pos & { before: string; m: Mv }>(); // another move that also earns it
  // replaying: index into lead+line; `paused` = stepping by hand
  const [rep, setRep] = useState<{ i: number; full: boolean; paused: boolean }>();
  const [speed] = useReplaySpeed();
  const [hint, setHint] = useState(false);
  const [assist, setAssistState] = useState<boolean>(() => load("dojo.demo.assist", true));
  const setAssist = (v: boolean) => {
    setAssistState(v);
    save("dojo.demo.assist", v);
  };
  const [miss, setMiss] = useState<{ sq: string; n: number; san: string }>();
  const [animKey, setAnimKey] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [pieceLines, setPieceLines] = useState<EngineLine[]>([]);

  const done = !!alt || step >= total;
  const seq = useMemo(() => [...leadPos, ...linePos.slice(1)], [leadPos, linePos]);
  const leadLen = leadPos.length - 1;
  const here: Pos = rep ? seq[rep.i] : alt ?? linePos[Math.min(step, total)];
  const myTurn = !rep && !done && step % 2 === 0;

  // the opponent's replies play themselves
  useEffect(() => {
    if (rep || done || step % 2 === 0) return;
    const t = setTimeout(() => {
      setStep(step + 1);
      setAnimKey((k) => k + 1);
      sfx.move();
    }, Math.max(400, speed * 0.7));
    return () => clearTimeout(t);
  }, [step, rep, done, speed]);
  // replay: the route (and with "手本", the move itself)
  const repEnd = rep ? (rep.full ? seq.length - 1 : leadLen) : 0;
  const finishRep = () => {
    if (!rep) return;
    setRep(undefined);
    setStep(rep.full ? total : 0);
  };
  const stepRep = (d: number) => {
    if (!rep) return;
    const i = Math.max(0, Math.min(repEnd, rep.i + d));
    if (i === rep.i) return;
    setRep({ ...rep, i, paused: true });
    if (d > 0) {
      setAnimKey((k) => k + 1);
      sfx.move();
    }
  };
  useEffect(() => {
    if (!rep || rep.paused) return;
    if (rep.i >= repEnd) {
      const t = setTimeout(finishRep, Math.min(900, speed));
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setRep({ ...rep, i: rep.i + 1 });
      setAnimKey((k) => k + 1);
      sfx.move();
    }, rep.i < leadLen ? speed : speed * 1.3);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rep, repEnd, leadLen, speed]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => {
    setStep(0);
    setAlt(undefined);
    setRep(undefined);
    setHint(false);
    setMiss(undefined);
  };
  /** The same side's earlier moves in the line (for patterns that span moves, like the windmill). */
  const ctxAt = (k: number): MoveCtx => ({
    prevOwn: demo.line.slice(0, k).map((u, i) => ({ fenBefore: linePos[i].fen, move: uciMv(u) })).filter((_, i) => i % 2 === 0),
  });

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!myTurn) return;
    const want = demo.line[step];
    const isLast = step === total - 1;
    const same = from + to === want.slice(0, 4) && (!want[4] || want[4] === promotion);
    const c = new Chess(here.fen);
    const m = c.move({ from, to, promotion });
    if (same || (isLast && demo.earns(here.fen, { from, to, promotion }, ctxAt(step)))) {
      setMiss(undefined);
      setHint(false);
      setAnimKey((k) => k + 1);
      (m.captured ? sfx.capture : sfx.move)();
      if (same) setStep(step + 1);
      else setAlt({ fen: c.fen(), from, to, san: m.san, before: here.fen, m: { from, to, promotion } });
      if (isLast) sfx.good();
      return;
    }
    setMiss({ sq: to, n: Date.now(), san: m.san });
    sfx.wrong();
  };

  // the picture: the formation's shape before the move, what the move does after it
  let arrows: Arrow[] = [];
  let marks: SquareMark[] = [];
  let pic: ReturnType<typeof illustrate> | undefined;
  const lastIdx = rep ? (rep.i > leadLen ? rep.i - leadLen - 1 : -1) : alt ? total - 1 : step - 1;
  if (assist && !rep && done) {
    pic = alt ? illustrate(alt.before, alt.m, demo.id, demo.show) : illustrate(linePos[total - 1].fen, uciMv(demo.line[total - 1]), demo.id, demo.show);
  } else if (assist && !rep && lastIdx >= 0 && lastIdx % 2 === 0) {
    pic = illustrate(linePos[lastIdx].fen, uciMv(demo.line[lastIdx]), undefined, undefined);
  }
  if (pic) {
    arrows = pic.arrows;
    marks = pic.marks;
  } else if (assist && myTurn && demo.show) {
    marks = demo.show.map((s) => ({ sq: s, from: s, kind: "ok" as const, share: 0.7, label: "形" }));
  }
  // Square colouring, as on the explore board: where the strong moves go (book % or engine),
  // and with a piece in hand, a grade for every square it can reach.
  const fenNow = here.fen;
  const book = useMemo(() => candidates(fenNow), [fenNow]);
  const pieceUcis = useMemo(() => {
    if (!sel) return [];
    return new Chess(fenNow).moves({ square: sel as never, verbose: true }).filter((m) => !m.promotion || m.promotion === "q").map((m) => m.from + m.to + (m.promotion ?? ""));
  }, [fenNow, sel]);
  useEffect(() => {
    setLines([]);
    setPieceLines([]);
    if (!assist || !myTurn) return;
    let live = true;
    if (sel && pieceUcis.length) engine.run({ fen: fenNow, searchmoves: pieceUcis, multipv: pieceUcis.length, depth: 11 }).then((l) => live && setPieceLines(l));
    else if (!book.length) engine.run({ fen: fenNow, multipv: 4, depth: 12 }).then((l) => live && setLines(l));
    return () => {
      live = false;
    };
  }, [fenNow, assist, myTurn, sel, pieceUcis, book.length]);
  if (assist && myTurn) {
    let heat: SquareMark[] = [];
    if (sel) heat = gradedMarks(fenNow, gradePiece(fenNow, sel, pieceLines, new Set(book.map((c) => c.san))), true);
    else if (book.length) heat = bookMarks(book);
    else if (lines.length) heat = engineMarksArrows(fenNow, lines).marks;
    const shape = marks.filter((m) => !heat.some((h) => h.sq === m.sq));
    marks = [...shape, ...heat];
  }
  const want = demo.line[step];
  if (hint && myTurn && want) arrows = [...arrows, { from: want.slice(0, 2), to: want.slice(2, 4), color: "#ff541c", width: 16, opacity: 0.85 }];

  const lineText = numbered(alt ? [linePos[0], { ...alt }] : linePos.slice(0, total + 1));
  const leadText = numbered(leadPos);

  return (
    <div className="demo-backdrop" onClick={onClose}>
      <div className="demo-modal" onClick={(e) => e.stopPropagation()}>
        <div className="demo-head">
          <div>
            <div className="demo-title">{demo.title} <span className="trophy-pts">+{demo.pts}</span></div>
            <div className="muted small">{demo.what}</div>
          </div>
          <button className="demo-close" onClick={onClose} aria-label="閉じる">✕</button>
        </div>
        <div className="demo-board">
          <Board
            fen={here.fen}
            orientation={me}
            lastMove={here.from ? { from: here.from, to: here.to! } : undefined}
            movable={myTurn ? me : "none"}
            onMove={onMove}
            arrows={arrows}
            marks={marks}
            showMarks
            onSelect={setSel}
            flash={miss ? { sq: miss.sq, n: miss.n } : undefined}
            badge={done && !rep && here.to ? { sq: here.to, kind: "best" } : undefined}
            animKey={animKey}
            glow={false}
          />
        </div>

        <div className={`demo-status ${done && !rep ? "ok" : miss ? "ng" : ""}`}>
          {rep
            ? `${rep.i <= leadLen ? `${demo.source ? `${demo.source}：` : ""}ここに至る手順` : "決め手"}${rep.paused ? "（一時停止中：◀ ▶ で 1 手ずつ）" : "を再生中…"} ${rep.i}/${repEnd}${here.san ? `　${here.san}` : ""}`
            : done
              ? `✓ これが「${demo.title}」です。${total > 1 || alt ? `手順：${lineText}` : ""}`
              : miss
                ? `${miss.san} ではありません。もう一度どうぞ。`
                : step % 2 === 1
                  ? "相手が応じています…"
                  : `${me === "w" ? "白" : "黒"}番。${demo.tip ?? "この局面で指してみてください。"}`}
        </div>

        {pic && (pic.notes.length > 0 || pic.legend.length > 0) && (
          <div className="demo-pic">
            {pic.legend.map((l) => (
              <span key={l.text} className="demo-legend"><i style={{ background: l.color }} />{l.text}</span>
            ))}
            {pic.notes.length > 0 && <ul>{pic.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
          </div>
        )}

        {leadLen > 0 && (
          <div className="demo-route muted small">
            {demo.source && <b>{demo.source}　</b>}ここまでの手順：{leadText}
          </div>
        )}

        {assist && myTurn && (
          <div className="demo-legend-line muted small">
            {sel ? "選んだ駒の行き先を色で採点：緑＝良い（★最善）・黄＝疑問手・橙＝悪手・赤＝ブランダー。評価の数値は出しません。" : book.length ? "色が濃いマスほど有力（% ＝ この局面で指される割合）。駒を選ぶと、その駒の行き先を採点します。" : "色が濃いマスほど有力（数値はエンジンの評価）。駒を選ぶと、その駒の行き先を採点します。"}
          </div>
        )}
        {rep && (
          <div className="demo-player">
            <button onClick={() => setRep({ ...rep, i: 0, paused: true })} title="最初へ">⏮</button>
            <button onClick={() => stepRep(-1)} disabled={rep.i === 0} title="1 手戻る">◀</button>
            <button className="primary" onClick={() => (rep.i >= repEnd ? finishRep() : setRep({ ...rep, paused: !rep.paused }))} title={rep.paused ? "再生" : "一時停止"}>
              {rep.i >= repEnd ? "▶ 続きを指す" : rep.paused ? "▶ 再生" : "⏸ 一時停止"}
            </button>
            <button onClick={() => stepRep(1)} disabled={rep.i >= repEnd} title="1 手進む">▶</button>
            <button onClick={finishRep} title="最後へ（指す局面へ）">⏭</button>
          </div>
        )}
        {(rep || leadLen > 0 || total > 1) && <SpeedSlider compact />}
        <div className="demo-actions">
          <button className={`chip ${assist ? "on" : ""}`} onClick={() => setAssist(!assist)} title="有力なマスの着色、選んだ駒の採点、指した手の攻めの筋・チェックの線・詰みの逃げ道を盤に描く">補助：{assist ? "ON" : "OFF"}</button>
          {leadLen > 0 && <button className="chip" onClick={() => { reset(); setRep({ i: 0, full: false, paused: false }); }}>▶ ここに至る手順</button>}
          {leadLen > 0 && <button className="chip" onClick={() => { reset(); setRep({ i: 0, full: false, paused: true }); }}>👣 1 手ずつ見る</button>}
          <button className="chip" onClick={() => { reset(); setRep({ i: 0, full: true, paused: false }); }}>▶ 手本を通しで見る</button>
          {!done && !rep && <button className="chip" disabled={!myTurn} onClick={() => setHint(true)}>💡 ヒント</button>}
          <button className="chip" onClick={reset}>⟲ やり直す</button>
        </div>
        <div className="muted small" style={{ marginTop: 6 }}>参考の盤なので、ここでは点は入りません。</div>
      </div>
    </div>
  );
}
