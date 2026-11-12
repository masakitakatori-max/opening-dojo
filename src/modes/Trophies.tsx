// トロフィー: everything that can earn 芸術点, what has been earned so far — and, on a tap,
// a small board where the named move or pattern can be tried out (for reference: no points).
import { Chess } from "chess.js";
import { useEffect, useMemo, useState } from "react";
import Board, { type Arrow } from "../components/Board";
import { TROPHY_DEMOS, type TrophyDemo } from "../data/trophyDemos";
import { sfx } from "../lib/sound";
import { namedNodes, openingChain, pathTo } from "../lib/tree";
import { detect, loadLog, openingAward, openingPoints, TROPHIES, type TrophyCat } from "../lib/trophies";

const CATS: TrophyCat[] = ["特別な手", "戦術", "陣形・構え", "詰みの型"];
type Mv = { from: string; to: string; promotion?: string };

interface Demo extends TrophyDemo {
  title: string;
  pts: number;
  what: string;
  /** Does this move, played in this position, earn the trophy? (used for the last move of the line) */
  earns: (fenBefore: string, m: Mv) => boolean;
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
      ...d, title: t.ja, pts: t.pts, what: t.what,
      // 妙手 is judged by the engine in a real game; here the move itself is the answer
      earns: (fen, m) => (t.id === "brilliant" ? m.from + m.to === last.slice(0, 4) : detect(fen, m).some((a) => a.id === t.id)),
    });
  };
  const openOpening = (o: (typeof openings)[number]) => {
    const sans = pathTo(o.node);
    const c = new Chess();
    for (const s of sans.slice(0, -1)) c.move(s);
    const fen = c.fen();
    const m = c.move(sans[sans.length - 1]);
    const so = sans.slice(0, -1).map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(" ");
    setDemo({
      fen, line: [m.from + m.to + (m.promotion ?? "")], title: o.name, pts: o.pts,
      what: "自分の一手でこの型に入ると獲得できます。",
      tip: so ? `ここまでの手順：${so}。次の一手でこの型に入ります。` : "初手でこの型に入ります。",
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
          <br /><strong>トロフィーを押すと、その手や形を見本の局面で指して確かめられます。</strong>
        </p>
      </header>

      <div className="trophy-summary">
        <div className="card"><div className="muted small">累計の芸術点</div><b>{log.total}</b></div>
        <div className="card"><div className="muted small">1 局の最高点</div><b>{log.best}</b></div>
        <div className="card"><div className="muted small">集めた種類</div><b>{earnedCount + openCount}<span className="muted"> / {TROPHIES.length + openings.length}</span></b></div>
      </div>

      {CATS.map((cat) => (
        <section key={cat}>
          <h3 className="picker-group">{cat}</h3>
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
              <button key={o.name} className={`op-chip ${e ? "got" : ""}`} title={e ? `${e.n} 回` : "未達成"} onClick={() => openOpening(o)}>
                {o.name} <b>+{o.pts}</b>
              </button>
            );
          })}
        </div>
      </section>

      {demo && <DemoModal key={demo.title} demo={demo} onClose={() => setDemo(undefined)} />}
    </div>
  );
}

/** A small board: play the move(s) of the pattern yourself. Opponent replies play themselves. */
function DemoModal({ demo, onClose }: { demo: Demo; onClose: () => void }) {
  const [step, setStep] = useState(0); // plies of the line already on the board
  const [alt, setAlt] = useState<{ fen: string; from: string; to: string }>(); // another move that also earns it
  const [auto, setAuto] = useState(false); // playing the model line
  const [hint, setHint] = useState(false);
  const [miss, setMiss] = useState<{ sq: string; n: number; san: string }>();
  const [animKey, setAnimKey] = useState(0);

  const positions = useMemo(() => {
    const c = new Chess(demo.fen);
    const out: { fen: string; from?: string; to?: string; san?: string }[] = [{ fen: c.fen() }];
    for (const u of demo.line) {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push({ fen: c.fen(), from: m.from, to: m.to, san: m.san });
    }
    return out;
  }, [demo]);
  const me = demo.fen.split(" ")[1] as "w" | "b";
  const total = demo.line.length;
  const done = !!alt || step >= total;
  const here = alt ?? positions[Math.min(step, total)];
  const myTurn = !done && !auto && step % 2 === 0;

  // the opponent's replies, and the model line, play themselves
  useEffect(() => {
    if (done || !(auto || step % 2 === 1)) return;
    const t = setTimeout(() => {
      setStep(step + 1);
      setAnimKey((k) => k + 1);
      sfx.move();
    }, auto ? 900 : 500);
    return () => clearTimeout(t);
  }, [step, auto, done]);
  useEffect(() => {
    if (done) setAuto(false);
  }, [done]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const restart = () => {
    setStep(0);
    setAlt(undefined);
    setAuto(false);
    setHint(false);
    setMiss(undefined);
  };

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!myTurn) return;
    const want = demo.line[step];
    const isLast = step === total - 1;
    const same = from + to === want.slice(0, 4);
    const c = new Chess(here.fen);
    const m = c.move({ from, to, promotion });
    if (same || (isLast && demo.earns(here.fen, { from, to, promotion }))) {
      setMiss(undefined);
      setHint(false);
      setAnimKey((k) => k + 1);
      (m.captured ? sfx.capture : sfx.move)();
      if (same) setStep(step + 1);
      else setAlt({ fen: c.fen(), from, to });
      if (isLast) sfx.good();
      return;
    }
    setMiss({ sq: to, n: Date.now(), san: m.san });
    sfx.wrong();
  };

  const want = demo.line[step];
  const arrows: Arrow[] = hint && myTurn && want ? [{ from: want.slice(0, 2), to: want.slice(2, 4), color: "#ff541c", width: 16, opacity: 0.85 }] : [];
  const sans = positions.slice(1).map((p, i) => (i % 2 === 0 ? p.san : `(${p.san})`)).join(" ");

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
            flash={miss ? { sq: miss.sq, n: miss.n } : undefined}
            badge={done && here.to ? { sq: here.to, kind: "best" } : undefined}
            animKey={animKey}
            glow={false}
          />
        </div>
        <div className={`demo-status ${done ? "ok" : miss ? "ng" : ""}`}>
          {done
            ? `✓ これが「${demo.title}」です。${total > 1 ? `手順：${sans}` : ""}`
            : auto
              ? "手本を再生中…"
              : miss
                ? `${miss.san} ではありません。もう一度どうぞ。`
                : step % 2 === 1
                  ? "相手が応じています…"
                  : `${me === "w" ? "白" : "黒"}番。${demo.tip ?? "この局面で指してみてください。"}`}
        </div>
        <div className="demo-actions">
          {!done && <button className="chip" disabled={!myTurn} onClick={() => setHint(true)}>💡 ヒント</button>}
          <button className="chip" onClick={() => { restart(); setAuto(true); }}>▶ 手本を見る</button>
          <button className="chip" onClick={restart}>⟲ やり直す</button>
          <span className="muted small">参考の盤なので、ここでは点は入りません。</span>
        </div>
      </div>
    </div>
  );
}
