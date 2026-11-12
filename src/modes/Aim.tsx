import { Chess } from "chess.js";
import { BASE } from "../lib/asset";
import { useEffect, useMemo, useRef, useState } from "react";
import Board, { type Arrow, type BadgeKind, type SquareMark } from "../components/Board";
import { Reasons } from "../components/panels";
import { AIMS, LEVELS, levelOf, type Aim, type AimData, type PuzzleRow } from "../data/aims";
import type { EngineLine } from "../lib/engine";
import { explainMove } from "../lib/explain";
import { sfx } from "../lib/sound";
import { useScrollTop } from "../lib/useScrollTop";
import { load, pickLine, recordResult, save, type CourseStats } from "../lib/storage";

const STATS_KEY = "dojo.aim.stats";
const MIX = "mix";
const GROUPS = ["基本の戦術", "守りを崩す", "詰みの型", "一歩先の手"] as const;
const aimById = (id: string) => AIMS.find((a) => a.id === id)!;
// Words the rule-based explainer uses for each aim, to find the move where the aim shows up.
const AIM_WORD: Record<string, string> = {
  fork: "フォーク", pin: "ピン", skewer: "串刺し", discoveredAttack: "ディスカバード", hangingPiece: "駒得",
  sacrifice: "サクリファイス", attraction: "サクリファイス", deflection: "サクリファイス", backRankMate: "チェックメイト", smotheredMate: "チェックメイト",
};

interface Item {
  key: string; // puzzle id
  row: PuzzleRow;
  aim: string;
}

function poolOf(data: AimData, aimId: string, level: number): Item[] {
  const ids = aimId === MIX ? AIMS.map((a) => a.id) : [aimId];
  const seen = new Set<string>();
  const out: Item[] = [];
  for (const id of ids) {
    for (const row of data[id] ?? []) {
      if (levelOf(row[3]) !== level || seen.has(row[0])) continue;
      seen.add(row[0]);
      out.push({ key: row[0], row, aim: id });
    }
  }
  return out;
}

export default function AimMode() {
  const [data, setData] = useState<AimData | null | undefined>(undefined);
  const [aimId, setAimId] = useState<string | null>(null);
  const [level, setLevel] = useState<number>(() => load("dojo.aim.level", 1));
  useEffect(() => save("dojo.aim.level", level), [level]);
  useEffect(() => {
    fetch(`${BASE}aims.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (data === undefined) return <div className="picker"><p className="muted">問題を読み込み中…</p></div>;
  if (data === null) return <div className="picker"><p className="muted">問題データがありません。<code>node scripts/build-aims.ts</code> で作成してください。</p></div>;
  if (aimId) return <Session key={`${aimId}-${level}`} data={data} aimId={aimId} level={level} setLevel={setLevel} onBack={() => setAimId(null)} />;

  const stats = load<CourseStats>(STATS_KEY, {});
  const progress = (id: string) => {
    const pool = poolOf(data, id, level);
    return { total: pool.length, clean: pool.filter((p) => (stats[p.key]?.clean ?? 0) > 0).length, seen: pool.filter((p) => stats[p.key]).length };
  };
  const levelChips = (
    <div className="aim-levels">
      <span className="muted small">難しさ：</span>
      {LEVELS.map((l) => (
        <button key={l.id} className={`chip ${level === l.id ? "on" : ""}`} onClick={() => setLevel(l.id)} title={`レーティング ${l.range}`}>{l.ja}</button>
      ))}
    </div>
  );
  const mix = progress(MIX);
  return (
    <div className="picker">
      <header className="picker-head">
        <h1>狙いドリル</h1>
        <p>
          <strong>狙いは同じ、局面は毎回違う。</strong>ここでの狙いは、<strong>あなたが相手に決める手</strong>です（相手のミスを咎める側）。同じ狙いを違う形で何度も解くと、手順ではなく「形」が目に残ります。
          間違えた問題ほど早く再出題されます。形が入ったら、狙いを伏せた<strong>ミックス</strong>で「実戦で気づけるか」を試してください。
        </p>
        {levelChips}
      </header>

      <div className="course-grid" style={{ marginTop: 18 }}>
        <button className="course aim-mix" onClick={() => setAimId(MIX)}>
          <div className="course-title">🎲 ミックス（狙いを伏せる）</div>
          <div className="course-sub">全 {AIMS.length} 種類からランダムに出題。何の狙いかは解いてから表示。実戦に一番近い練習。</div>
          <div className="course-progress">
            <div className="bar"><span style={{ width: `${(mix.clean / Math.max(1, mix.total)) * 100}%` }} /><span className="seen" style={{ width: `${(mix.seen / Math.max(1, mix.total)) * 100}%` }} /></div>
            <span className="muted small">ノーミス正解 {mix.clean}/{mix.total} 問</span>
          </div>
        </button>
      </div>

      {GROUPS.map((g) => (
        <section key={g}>
          <h3 className="picker-group">{g}</h3>
          <div className="course-grid">
            {AIMS.filter((a) => a.group === g).map((a) => {
              const p = progress(a.id);
              return (
                <button key={a.id} className="course" onClick={() => setAimId(a.id)}>
                  <div>
                    <div className="course-title">{a.ja}</div>
                    <div className="course-sub">{a.what}</div>
                  </div>
                  <div className="course-progress">
                    <div className="bar"><span style={{ width: `${(p.clean / Math.max(1, p.total)) * 100}%` }} /><span className="seen" style={{ width: `${(p.seen / Math.max(1, p.total)) * 100}%` }} /></div>
                    <span className="muted small">ノーミス正解 {p.clean}/{p.total} 問</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
      <p className="muted small" style={{ marginTop: 28 }}>問題：Lichess puzzle database（CC0）。</p>
    </div>
  );
}

interface Step {
  fen: string;
  from?: string;
  to?: string;
  san?: string;
}

function Session({ data, aimId, level, setLevel, onBack }: { data: AimData; aimId: string; level: number; setLevel: (l: number) => void; onBack: () => void }) {
  useScrollTop();
  const pool = useMemo(() => poolOf(data, aimId, level), [data, aimId, level]);
  const [stats, setStats] = useState<CourseStats>(() => load(STATS_KEY, {}));
  const [cur, setCur] = useState<Item | undefined>(() => (pool.length ? pickLine(pool, stats) : undefined));
  const [i, setI] = useState(0); // number of solution moves already on the board
  const [solved, setSolved] = useState(false);
  const [alt, setAlt] = useState<Step>(); // a different mating move than the stored one
  const [hint, setHint] = useState(0);
  const [flash, setFlash] = useState<{ sq: string; n: number }>();
  const [msg, setMsg] = useState<string>();
  const [animKey, setAnimKey] = useState(0);
  const [session, setSession] = useState({ done: 0, clean: 0, streak: 0 });
  const mistakes = useRef(0);

  const ms = useMemo(() => cur?.row[2].split(" ") ?? [], [cur]);
  // Every position of the puzzle: line[k] = after k moves (line[0] = before the opponent's setup move).
  const line = useMemo(() => {
    const out: Step[] = [];
    if (!cur) return out;
    const c = new Chess(cur.row[1]);
    out.push({ fen: c.fen() });
    for (const u of ms) {
      try {
        const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
        out.push({ fen: c.fen(), from: m.from, to: m.to, san: m.san });
      } catch {
        break;
      }
    }
    return out;
  }, [cur, ms]);
  const total = line.length - 1;
  const me = cur ? (cur.row[1].split(" ")[1] === "w" ? "b" : "w") : "w";
  const here = alt ?? line[Math.min(i, total)] ?? { fen: new Chess().fen() };
  const myTurn = !solved && i % 2 === 1 && i < total;

  const finish = () => {
    if (!cur) return;
    setSolved(true);
    const clean = mistakes.current === 0;
    const st = recordResult(stats, cur.key, mistakes.current);
    setStats(st);
    save(STATS_KEY, st);
    setSession((s) => ({ done: s.done + 1, clean: s.clean + (clean ? 1 : 0), streak: clean ? s.streak + 1 : 0 }));
    (clean ? sfx.done : sfx.good)();
  };

  // The opponent's moves play themselves (including the first one that sets the puzzle up).
  useEffect(() => {
    if (!cur || solved || i % 2 === 1 || i >= total) return;
    const t = setTimeout(() => {
      setI(i + 1);
      setAnimKey((k) => k + 1);
      (line[i + 1]?.san?.includes("x") ? sfx.capture : sfx.move)();
    }, i === 0 ? 650 : 450);
    return () => clearTimeout(t);
  }, [cur, i, solved, total, line]);

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!myTurn) return;
    const c = new Chess(here.fen);
    const mv = c.move({ from, to, promotion });
    const uci = from + to + (mv.promotion ?? "");
    if (uci === ms[i]) {
      setMsg(undefined);
      setHint(0);
      setAnimKey((k) => k + 1);
      (mv.captured ? sfx.capture : sfx.move)();
      setI(i + 1);
      if (i + 1 >= total) finish();
      return;
    }
    if (c.isCheckmate()) {
      // Any checkmate is a correct answer.
      setAlt({ fen: c.fen(), from, to, san: mv.san });
      setAnimKey((k) => k + 1);
      finish();
      return;
    }
    mistakes.current += 1;
    setFlash({ sq: to, n: Date.now() });
    setMsg(`${mv.san} ではありません。もう一度。`);
    sfx.wrong();
  };

  const next = (same = false) => {
    if (!pool.length) return;
    mistakes.current = 0;
    setCur(same ? cur : pickLine(pool, stats, cur?.key));
    setI(0);
    setSolved(false);
    setAlt(undefined);
    setHint(0);
    setMsg(undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (solved && (e.key === " " || e.key === "Enter")) {
        e.preventDefault();
        next();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!cur) {
    return (
      <div className="picker">
        <button className="link" onClick={onBack}>← 狙い一覧</button>
        <p className="muted">この難しさの問題がありません。</p>
      </div>
    );
  }

  const aim: Aim = aimById(cur.aim);
  const hidden = aimId === MIX && !solved;
  const expected = myTurn ? ms[i] : undefined;
  let marks: SquareMark[] = [];
  let arrows: Arrow[] = [];
  if (expected && hint >= 1) marks = [{ sq: expected.slice(0, 2), from: expected.slice(0, 2), kind: "ok", share: 1, label: "この駒" }];
  if (expected && hint >= 2) {
    marks = [{ sq: expected.slice(2, 4), from: expected.slice(0, 2), kind: "main", share: 1, label: "答え" }];
    arrows = [{ from: expected.slice(0, 2), to: expected.slice(2, 4), color: "#ff541c", width: 16, opacity: 0.85 }];
  }
  const badge: { sq: string; kind: BadgeKind } | undefined = solved && here.to ? { sq: here.to, kind: mistakes.current === 0 ? "best" : "good" } : undefined;
  // After solving: point at the move where the aim actually appears (not necessarily the first move).
  // The rest of the known solution stands in for an engine line, so a sacrifice is explained by its payoff.
  const endsInMate = solved && !!line[total] && new Chess(line[total].fen).isCheckmate();
  const sign = me === "w" ? 1 : -1;
  const lineFrom = (k: number): EngineLine => {
    const pv = ms.slice(k, total);
    return { multipv: 1, depth: 99, pv, ...(endsInMate ? { mate: sign * Math.ceil(pv.length / 2) } : { cp: sign * 300 }) };
  };
  let keyExplain = solved && line[1] && ms[1] ? explainMove(line[1].fen, ms[1], lineFrom(1)) : undefined;
  let keySan: string | undefined;
  const word = AIM_WORD[aim.id];
  if (solved && word && !alt) {
    for (let k = 1; k < total; k += 2) {
      const ex = explainMove(line[k].fen, ms[k], lineFrom(k));
      const hit = ex.reasons.filter((r) => r.text.includes(word));
      if (hit.length) {
        keyExplain = { ...ex, reasons: hit };
        keySan = line[k + 1]?.san;
        break;
      }
    }
  }
  const cleanCount = pool.filter((p) => (stats[p.key]?.clean ?? 0) > 0).length;
  const solution = line.slice(2).map((s, k) => (k % 2 === 0 ? s.san : `(${s.san})`));

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="board-stack">
          <Board
            fen={here.fen}
            orientation={me}
            lastMove={here.from ? { from: here.from, to: here.to! } : undefined}
            movable={myTurn ? me : "none"}
            onMove={onMove}
            marks={marks}
            arrows={arrows}
            showMarks
            flash={flash}
            badge={badge}
            animKey={animKey}
            glow={false}
          />
          <div className="legend">
            <span className="muted small">あなたは{me === "w" ? "白" : "黒"}番。{myTurn ? "最善の一手を指してください。" : solved ? "" : "相手が指しています…"}</span>
            <span className="legend-sep" />
            {myTurn && hint < 2 && (
              <button
                className="chip"
                onClick={() => {
                  if (hint === 0) mistakes.current += 1;
                  setHint(hint + 1);
                }}
              >
                {hint === 0 ? "💡 ヒント（動かす駒）" : "答えを見る"}
              </button>
            )}
          </div>
        </div>
      </div>

      <aside className="panel">
        <div className="panel-scroll">
          <div className="card">
            <div className="drill-head">
              <button className="link" onClick={onBack}>← 狙い一覧</button>
              <span className="muted small">連続ノーミス {session.streak} ・ 今回 {session.clean}/{session.done}</span>
            </div>
            <div className="card-title" style={{ marginTop: 6 }}>狙い</div>
            {hidden ? (
              <>
                <h2 className="op-name">？？？</h2>
                <div className="op-en">ミックス：何の狙いかは、解いたら表示します。</div>
              </>
            ) : (
              <>
                <h2 className="op-name">{aim.ja}</h2>
                <div className="op-en">{aim.en}</div>
                <div className="idea"><span className="idea-move">狙い</span><span>{aim.what}</span></div>
                <div className="idea" style={{ borderLeftColor: "#8fb6ff" }}><span className="idea-move">見つけ方</span><span>{aim.cue}</span></div>
              </>
            )}
            <div className="aim-levels" style={{ marginTop: 12 }}>
              {LEVELS.map((l) => (
                <button key={l.id} className={`chip ${level === l.id ? "on" : ""}`} onClick={() => setLevel(l.id)} title={`レーティング ${l.range}`}>{l.ja}</button>
              ))}
              <span className="muted small" style={{ marginLeft: "auto" }}>ノーミス正解 {cleanCount}/{pool.length}</span>
            </div>
          </div>

          {msg && !solved && <div className="card feedback fb-bad"><div className="fb-title">✕ {msg}</div></div>}

          {solved && (
            <div className={`card feedback ${mistakes.current === 0 ? "fb-done" : "fb-good"}`}>
              <div className="fb-title">{mistakes.current === 0 ? "✓ 正解（ノーミス）" : "✓ 正解"}</div>
              <div className="fb-body">
                正解手順：<b>{alt ? alt.san : solution.join(" ")}</b>
                {solution.length > 1 && !alt && <span className="muted">（カッコ内は相手の手）</span>}
              </div>
              {keySan && <div className="fb-opp">{aim.ja}が決まった手：{keySan}</div>}
              <Reasons ex={keyExplain} max={3} />
              <div className="fb-actions">
                <button className="primary" onClick={() => next()}>次の局面 ▶<span className="muted small">（Space）</span></button>
                <button onClick={() => next(true)}>もう一度</button>
              </div>
              <div className="muted small" style={{ marginTop: 8 }}>
                難度 {cur.row[3]} ・ <a href={`https://lichess.org/training/${cur.row[0]}`} target="_blank" rel="noreferrer">Lichess で見る</a>
                {mistakes.current > 0 && " ・ ミスした問題は、近いうちにもう一度出ます"}
              </div>
            </div>
          )}

          {!solved && (
            <div className="card">
              <div className="card-title">進め方</div>
              <ul className="plan-list">
                <li><b>狙いは、あなたが相手に決める手です。</b>相手の直前の一手（黄色のマス）がミスで、この狙いが決まるようになりました。</li>
                <li>まず「見つけ方」の視点で盤を見てから、手を選びます。</li>
                <li>正解すると、同じ狙いの<b>別の局面</b>が出ます。</li>
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
