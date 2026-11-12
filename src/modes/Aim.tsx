import { Chess } from "chess.js";
import { BASE } from "../lib/asset";
import { useEffect, useMemo, useRef, useState } from "react";
import Board, { type Arrow, type BadgeKind, type SquareMark } from "../components/Board";
import { Reasons } from "../components/panels";
import { AIMS, LEVELS, levelOf, type Aim, type AimData, type PuzzleRow } from "../data/aims";
import { COURSES } from "../data/courses";
import type { OpeningData } from "../data/openingPuzzles";
import { engine, type EngineLine } from "../lib/engine";
import { winPct } from "../lib/tactics";
import { explainMove } from "../lib/explain";
import { loadTactic, TACTIC_PROVISIONAL, updateTactic } from "../lib/rating";
import { sfx } from "../lib/sound";
import { useScrollTop } from "../lib/useScrollTop";
import { load, pickLine, recordResult, save, type CourseStats } from "../lib/storage";

const ATTACK_KEY = "dojo.aim.stats";
const THREAT_KEY = "dojo.threat.stats";
export type AimView = "attack" | "threat";
const statsKeyOf = (v: AimView) => (v === "attack" ? ATTACK_KEY : THREAT_KEY);
const MIX = "mix";
const OPENING = "op:"; // aimId prefix: puzzles from one 型ドリル course
const GROUPS = ["基本の戦術", "守りを崩す", "詰みの型", "一歩先の手"] as const;
const GENERIC: Aim = { id: "", group: "基本の戦術", ja: "型から生まれた戦術", en: "Opening tactic", what: "この定跡から実戦で生まれた局面。", cue: "相手の最後の一手で何が変わったか（守りが外れた駒・開いた筋）を見る。" };
const aimById = (id: string) => AIMS.find((a) => a.id === id) ?? GENERIC;
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

function poolOf(data: AimData, aimId: string, level: number, openings?: OpeningData | null): Item[] {
  if (aimId.startsWith(OPENING)) {
    return (openings?.[aimId.slice(OPENING.length)] ?? []).filter((r) => levelOf(r[3]) === level).map((r) => ({ key: r[0], row: [r[0], r[1], r[2], r[3]] as PuzzleRow, aim: r[4] }));
  }
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

export interface AimGoto {
  aim: string; // aim id, "mix", or `op:${courseId}`
  view: AimView;
}

export default function AimMode({ goto }: { goto?: AimGoto }) {
  const [data, setData] = useState<AimData | null | undefined>(undefined);
  const [openings, setOpenings] = useState<OpeningData | null>(null);
  const [aimId, setAimId] = useState<string | null>(goto?.aim ?? null);
  const [view, setView] = useState<AimView>(() => goto?.view ?? load<AimView>("dojo.aim.view", "attack"));
  const [readout, setReadout] = useState<boolean>(() => load("dojo.aim.readout", false));
  const [level, setLevel] = useState<number>(() => load("dojo.aim.level", 1));
  useEffect(() => save("dojo.aim.level", level), [level]);
  useEffect(() => save("dojo.aim.view", view), [view]);
  useEffect(() => save("dojo.aim.readout", readout), [readout]);
  useEffect(() => {
    if (aimId) save("dojo.last.aim", { aim: aimId, view, t: Date.now() });
  }, [aimId, view]);
  useEffect(() => {
    fetch(`${BASE}aims.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setData)
      .catch(() => setData(null));
    fetch(`${BASE}openings.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(setOpenings)
      .catch(() => setOpenings(null));
  }, []);

  if (data === undefined) return <div className="picker"><p className="muted">問題を読み込み中…</p></div>;
  if (data === null) return <div className="picker"><p className="muted">問題データがありません。<code>node scripts/build-aims.ts</code> で作成してください。</p></div>;
  if (aimId && (!aimId.startsWith(OPENING) || openings)) {
    const pool = poolOf(data, aimId, level, openings);
    const props = { pool, aimId, level, setLevel, onBack: () => setAimId(null) };
    const k = `${aimId}-${level}-${view}-${readout}`;
    return view === "threat" ? <ThreatSession key={k} {...props} /> : <Session key={k} {...props} readout={readout} />;
  }

  const stats = load<CourseStats>(statsKeyOf(view), {});
  const tactic = loadTactic();
  const progress = (id: string) => {
    const pool = poolOf(data, id, level, openings);
    return { total: pool.length, clean: pool.filter((p) => (stats[p.key]?.clean ?? 0) > 0).length, seen: pool.filter((p) => stats[p.key]).length };
  };
  const bar = (p: { total: number; clean: number; seen: number }) => (
    <div className="course-progress">
      <div className="bar"><span style={{ width: `${(p.clean / Math.max(1, p.total)) * 100}%` }} /><span className="seen" style={{ width: `${(p.seen / Math.max(1, p.total)) * 100}%` }} /></div>
      <span className="muted small">ノーミス正解 {p.clean}/{p.total} 問</span>
    </div>
  );
  const levelChips = (
    <div className="aim-levels">
      <span className="muted small">難しさ：</span>
      {LEVELS.map((l) => (
        <button key={l.id} className={`chip ${level === l.id ? "on" : ""}`} onClick={() => setLevel(l.id)} title={`レーティング ${l.range}`}>{l.ja}</button>
      ))}
    </div>
  );
  const mix = progress(MIX);
  const courses = openings ? COURSES.filter((c) => openings[c.id]?.length) : [];
  return (
    <div className="picker">
      <header className="picker-head">
        <h1>狙いドリル</h1>
        <div className="view-tabs">
          <button className={`view-tab ${view === "attack" ? "on" : ""}`} onClick={() => setView("attack")}>⚔️ 攻める<span>自分の狙いを決める</span></button>
          <button className={`view-tab ${view === "threat" ? "on" : ""}`} onClick={() => setView("threat")}>🛡 守る<span>相手の狙いを見抜く</span></button>
        </div>
        {view === "attack" ? (
          <p>
            <strong>狙いは同じ、局面は毎回違う。</strong>ここでの狙いは、<strong>あなたが相手に決める手</strong>です（相手のミスを咎める側）。同じ狙いを違う形で何度も解くと、手順ではなく「形」が目に残ります。
            間違えた問題ほど早く再出題されます。形が入ったら、狙いを伏せた<strong>ミックス</strong>で「実戦で気づけるか」を試してください。
          </p>
        ) : (
          <p>
            <strong>同じ問題を、やられる側から見ます。</strong>あなたが指した一手のあと、相手には狙いが生まれました。①<strong>相手の狙い（次の一手）を当てる</strong> → ②<strong>一手戻って、それを防ぐ手を指す</strong>。
            実戦のブランダーの多くは「相手の狙いを見ていない」ことから起きます。指す前に「相手は何をしたいか」を言葉にする癖をつけるドリルです。
          </p>
        )}
        {levelChips}
        {view === "attack" && (
          <div className="aim-levels">
            <button className={`chip ${readout ? "on" : ""}`} onClick={() => setReadout(!readout)}>🧠 読み切りモード {readout ? "ON" : "OFF"}</button>
            <span className="muted small">ON：盤は最初の局面のまま。相手の応手も含めた手順を最後まで頭の中で読んで入力し、まとめて答え合わせ。</span>
          </div>
        )}
        {view === "attack" && (
          <div className="tactic-rating">
            戦術の推定レート <b>{tactic.n ? tactic.r : "—"}</b>
            <span className="muted small">
              {tactic.n === 0 ? "　初めての問題を解くと出ます" : `　初見 ${tactic.n} 問から推定${tactic.n < TACTIC_PROVISIONAL ? `（暫定：${TACTIC_PROVISIONAL} 問までは大きく動きます）` : ""}`}
              　問題の難度（Lichess のパズルレート）を相手に見立てた計算です。ヒントやミスがあると負け扱い。
            </span>
          </div>
        )}
      </header>

      <div className="course-grid" style={{ marginTop: 18 }}>
        <button className="course aim-mix" onClick={() => setAimId(MIX)}>
          <div className="course-title">🎲 ミックス（狙いを伏せる）</div>
          <div className="course-sub">全 {AIMS.length} 種類からランダムに出題。何の狙いかは解いてから表示。実戦に一番近い練習。</div>
          {bar(mix)}
        </button>
      </div>

      {GROUPS.map((g) => (
        <section key={g}>
          <h3 className="picker-group">{g}</h3>
          <div className="course-grid">
            {AIMS.filter((a) => a.group === g).map((a) => (
              <button key={a.id} className="course" onClick={() => setAimId(a.id)}>
                <div>
                  <div className="course-title">{a.ja}</div>
                  <div className="course-sub">{a.what}</div>
                </div>
                {bar(progress(a.id))}
              </button>
            ))}
          </div>
        </section>
      ))}

      {courses.length > 0 && (
        <section>
          <h3 className="picker-group">型から選ぶ <span className="muted small">— 型ドリルの定跡から、実戦で生まれた戦術（あなたがその型を持つ側）</span></h3>
          <div className="course-grid">
            {courses.map((c) => (
              <button key={c.id} className="course" onClick={() => setAimId(OPENING + c.id)}>
                <div>
                  <div className="course-title">{c.title}</div>
                  <div className="course-sub">{c.sub}</div>
                </div>
                {bar(progress(OPENING + c.id))}
              </button>
            ))}
          </div>
        </section>
      )}
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

interface SessionProps {
  pool: Item[];
  aimId: string;
  level: number;
  setLevel: (l: number) => void;
  onBack: () => void;
}

function Session({ pool, aimId, level, setLevel, onBack, readout }: SessionProps & { readout: boolean }) {
  useScrollTop();
  const [stats, setStats] = useState<CourseStats>(() => load(ATTACK_KEY, {}));
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
  const [tactic, setTactic] = useState(loadTactic);
  const [reads, setReads] = useState<string[]>([]); // read-out mode: the moves entered so far (both sides)

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
  // Read-out: after the opponent's setup move the board stays still; the whole line is entered blind.
  const reading = readout && !solved && i === 1 && total > 2;
  const readFen = useMemo(() => {
    if (!reading) return undefined;
    const c = new Chess(line[1].fen);
    for (const u of reads) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
    return c.fen();
  }, [reading, reads, line]);
  const myTurn = !solved && i % 2 === 1 && i < total;

  const finish = () => {
    if (!cur) return;
    setSolved(true);
    const clean = mistakes.current === 0;
    // The tactics rating only counts puzzles seen for the first time (a repeat is partly memory).
    if (!stats[cur.key]) setTactic(updateTactic(cur.row[3], clean));
    const st = recordResult(stats, cur.key, mistakes.current);
    setStats(st);
    save(ATTACK_KEY, st);
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
    if (reading && readFen) {
      const c = new Chess(readFen);
      const mv = c.move({ from, to, promotion });
      const next = [...reads, from + to + (mv.promotion ?? "")];
      sfx.move();
      setMsg(undefined);
      const want = ms.slice(1);
      const mateEarly = c.isCheckmate() && next.length % 2 === 1;
      if (next.length < want.length && !mateEarly) {
        setReads(next);
        return;
      }
      // Check the whole line at once.
      const bad = next.findIndex((u, k) => u !== want[k] && !(k === next.length - 1 && mateEarly));
      if (bad < 0) {
        setReads([]);
        if (mateEarly && next.length < want.length) {
          setAlt({ fen: c.fen(), from, to, san: mv.san });
        }
        setI(total);
        setAnimKey((k) => k + 1);
        finish();
        return;
      }
      mistakes.current += 1;
      setReads(next.slice(0, bad));
      setFlash({ sq: next[bad].slice(2, 4), n: Date.now() });
      setMsg(`${bad + 1} 手目（${bad % 2 === 0 ? "あなたの手" : "相手の応手"}）から読みが違います。そこから入れ直してください。`);
      sfx.wrong();
      return;
    }
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
    setReads([]);
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
  const hidden = (aimId === MIX || aimId.startsWith(OPENING)) && !solved;
  const expected = reading ? ms[1 + reads.length] : myTurn ? ms[i] : undefined;
  let marks: SquareMark[] = [];
  let arrows: Arrow[] = [];
  if (expected && hint >= 1) marks = [{ sq: expected.slice(0, 2), from: expected.slice(0, 2), kind: "ok", share: 1, label: "この駒" }];
  if (expected && hint >= 2) {
    marks = [{ sq: expected.slice(2, 4), from: expected.slice(0, 2), kind: "main", share: 1, label: "答え" }];
    arrows = [{ from: expected.slice(0, 2), to: expected.slice(2, 4), color: "#ff541c", width: 16, opacity: 0.85 }];
  }
  if (reading) {
    reads.forEach((u, k) => {
      const mine = k % 2 === 0;
      arrows.push({ from: u.slice(0, 2), to: u.slice(2, 4), color: mine ? "#ff9f1c" : "#4f8ef7", width: 11, opacity: 0.75 });
      marks.push({ sq: u.slice(2, 4), from: u.slice(0, 2), kind: mine ? "main" : "engine", share: 1, label: String(k + 1) });
    });
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
        <div className="board-stack" data-puzzle={cur.key}>
          <Board
            fen={here.fen}
            orientation={me}
            lastMove={here.from ? { from: here.from, to: here.to! } : undefined}
            movable={reading ? "both" : myTurn ? me : "none"}
            inputFen={readFen}
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
            <span className="muted small">
              あなたは{me === "w" ? "白" : "黒"}番。
              {reading
                ? `🧠 読み切り：盤は動きません。${reads.length + 1} 手目（${reads.length % 2 === 0 ? "あなた" : "相手"}）を入力。全 ${total - 1} 手。`
                : myTurn ? "最善の一手を指してください。" : solved ? "" : "相手が指しています…"}
            </span>
            <span className="legend-sep" />
            {reading && reads.length > 0 && <button className="chip" onClick={() => setReads(reads.slice(0, -1))}>⌫ 1 手消す</button>}
            {(myTurn || reading) && hint < 2 && (
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
              <span className="muted small">連続ノーミス {session.streak} ・ 今回 {session.clean}/{session.done} ・ 戦術レート {tactic.n ? tactic.r : "—"}{tactic.n > 0 && tactic.n < TACTIC_PROVISIONAL ? "（暫定）" : ""}</span>
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

// ───────────────────────── 守る：相手の狙いを見抜く ─────────────────────────
// The same puzzle, seen from the side that made the mistake:
//   ① after your move, name the opponent's threat by playing it;  ② go back one move and stop it.
function ThreatSession({ pool, aimId, level, setLevel, onBack }: SessionProps) {
  useScrollTop();
  const [stats, setStats] = useState<CourseStats>(() => load(THREAT_KEY, {}));
  const [cur, setCur] = useState<Item | undefined>(() => (pool.length ? pickLine(pool, stats) : undefined));
  const [stage, setStage] = useState<"intro" | "guess" | "defend" | "checking" | "done">("intro");
  const [fen, setFen] = useState<string>();
  const [last, setLast] = useState<{ from: string; to: string }>();
  const [msg, setMsg] = useState<string>();
  const [flash, setFlash] = useState<{ sq: string; n: number }>();
  const [hint, setHint] = useState(false);
  const [guessed, setGuessed] = useState<boolean>();
  const [defense, setDefense] = useState<{ san: string; ok: boolean; wp: number; bestSan?: string; bestWp?: number }>();
  const [session, setSession] = useState({ done: 0, clean: 0 });
  const mistakes = useRef(0);

  const ms = useMemo(() => cur?.row[2].split(" ") ?? [], [cur]);
  const steps = useMemo(() => {
    if (!cur) return [];
    const c = new Chess(cur.row[1]);
    const out: { fen: string; san?: string; from?: string; to?: string }[] = [{ fen: c.fen() }];
    for (const u of ms.slice(0, 2)) {
      const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
      out.push({ fen: c.fen(), san: m.san, from: m.from, to: m.to });
    }
    return out;
  }, [cur, ms]);
  const you = cur ? (cur.row[1].split(" ")[1] as "w" | "b") : "w"; // the side that made the mistake
  const them = you === "w" ? "b" : "w";

  // Start: show the position, then play "your" move that creates the threat.
  useEffect(() => {
    if (!cur || stage !== "intro" || steps.length < 3) return;
    setFen(steps[0].fen);
    setLast(undefined);
    const t = setTimeout(() => {
      setFen(steps[1].fen);
      setLast({ from: steps[1].from!, to: steps[1].to! });
      sfx.move();
      setStage("guess");
    }, 700);
    return () => clearTimeout(t);
  }, [cur, stage, steps]);

  if (!cur || steps.length < 3) {
    return (
      <div className="picker">
        <button className="link" onClick={onBack}>← 狙い一覧</button>
        <p className="muted">この難しさの問題がありません。</p>
      </div>
    );
  }
  const aim = aimById(cur.aim);
  const threatUci = ms[1];

  const record = () => {
    const st = recordResult(stats, cur.key, mistakes.current);
    setStats(st);
    save(THREAT_KEY, st);
    setSession((x) => ({ done: x.done + 1, clean: x.clean + (mistakes.current === 0 ? 1 : 0) }));
  };

  const onMove = async (from: string, to: string, promotion?: string) => {
    if (stage === "guess") {
      const c = new Chess(steps[1].fen);
      const mv = c.move({ from, to, promotion });
      const uci = from + to + (mv.promotion ?? "");
      if (uci === threatUci || c.isCheckmate()) {
        setGuessed(true);
        setFen(steps[2].fen);
        setLast({ from: steps[2].from!, to: steps[2].to! });
        (mv.captured ? sfx.capture : sfx.move)();
        setMsg(undefined);
        setHint(false);
        setTimeout(() => {
          setFen(steps[0].fen);
          setLast(undefined);
          setStage("defend");
        }, 1400);
        return;
      }
      mistakes.current += 1;
      setFlash({ sq: to, n: Date.now() });
      setMsg(`${mv.san} は狙いではありません。相手が一番得をする手は？`);
      sfx.wrong();
      return;
    }
    if (stage === "defend") {
      const c = new Chess(steps[0].fen);
      const mv = c.move({ from, to, promotion });
      const uci = from + to + (mv.promotion ?? "");
      setFen(c.fen());
      setLast({ from, to });
      (mv.captured ? sfx.capture : sfx.move)();
      if (uci === ms[0]) {
        mistakes.current += 1;
        setMsg(`${mv.san} はさっきの手です。狙いを防ぐ別の手を。`);
        sfx.wrong();
        setTimeout(() => { setFen(steps[0].fen); setLast(undefined); }, 600);
        return;
      }
      setStage("checking");
      const timeout = new Promise<EngineLine[]>((r) => setTimeout(() => r([]), 15000));
      const best = await Promise.race([engine.run({ fen: steps[0].fen, multipv: 1, depth: 12 }), timeout]);
      const mine = await Promise.race([engine.run({ fen: steps[0].fen, searchmoves: [uci], multipv: 1, depth: 12 }), timeout]);
      const wp = mine[0] ? winPct(mine[0].cp, mine[0].mate, you) : 0;
      const bestWp = best[0] ? winPct(best[0].cp, best[0].mate, you) : wp;
      const bestUci = best[0]?.pv[0];
      let bestSan: string | undefined;
      try {
        if (bestUci) bestSan = new Chess(steps[0].fen).move({ from: bestUci.slice(0, 2), to: bestUci.slice(2, 4), promotion: bestUci[4] }).san;
      } catch { /* */ }
      const ok = !!mine[0] && (wp >= bestWp - 8 || wp >= 50);
      if (!ok) {
        mistakes.current += 1;
        setStage("defend");
        setMsg(`${mv.san} では防ぎきれません（勝率 ${Math.round(wp)}%）。もう一度。`);
        setFlash({ sq: to, n: Date.now() });
        sfx.wrong();
        setTimeout(() => { setFen(steps[0].fen); setLast(undefined); }, 700);
        return;
      }
      setDefense({ san: mv.san, ok, wp, bestSan, bestWp });
      setStage("done");
      setMsg(undefined);
      record();
      (mistakes.current ? sfx.good : sfx.done)();
    }
  };

  const giveUp = () => {
    mistakes.current += 1;
    if (stage === "guess") {
      setGuessed(false);
      setFen(steps[2].fen);
      setLast({ from: steps[2].from!, to: steps[2].to! });
      setTimeout(() => { setFen(steps[0].fen); setLast(undefined); setStage("defend"); }, 1400);
      return;
    }
    // Defence: ask the engine and show its move.
    setStage("checking");
    engine.run({ fen: steps[0].fen, multipv: 1, depth: 12 }).then((ls) => {
      const u = ls[0]?.pv[0];
      let san = "";
      const c = new Chess(steps[0].fen);
      try {
        if (u) {
          const m = c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
          san = m.san;
          setFen(c.fen());
          setLast({ from: m.from, to: m.to });
        }
      } catch { /* */ }
      setDefense({ san, ok: false, wp: ls[0] ? winPct(ls[0].cp, ls[0].mate, you) : 50, bestSan: san });
      setStage("done");
      record();
    });
  };

  const next = () => {
    mistakes.current = 0;
    setCur(pickLine(pool, stats, cur.key));
    setStage("intro");
    setGuessed(undefined);
    setDefense(undefined);
    setMsg(undefined);
    setHint(false);
  };

  const hidden = (aimId === MIX || aimId.startsWith(OPENING)) && stage !== "done";
  const marks: SquareMark[] = stage === "guess" && hint ? [{ sq: threatUci.slice(0, 2), from: threatUci.slice(0, 2), kind: "danger", share: 1, label: "この駒" }] : [];
  const arrows: Arrow[] = [];
  if (stage === "defend" || stage === "done") arrows.push({ from: threatUci.slice(0, 2), to: threatUci.slice(2, 4), color: "#ca3431", width: 12, opacity: 0.55, dash: true });
  if (stage === "done") arrows.push({ from: ms[0].slice(0, 2), to: ms[0].slice(2, 4), color: "#7a7672", width: 10, opacity: 0.45, dash: true });

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="board-stack" data-puzzle={cur.key}>
          <Board
            fen={fen ?? steps[0].fen}
            orientation={you}
            lastMove={last}
            movable={stage === "guess" ? them : stage === "defend" ? you : "none"}
            onMove={onMove}
            marks={marks}
            arrows={arrows}
            showMarks
            flash={flash}
            glow={false}
          />
          <div className="legend">
            <span className="muted small">
              あなたは{you === "w" ? "白" : "黒"}。
              {stage === "guess" ? "① 相手の駒を動かして、相手の狙い（次の一手）を当てる。" : stage === "defend" ? "② 一手戻りました。赤い点線の狙いを防ぐ手を指す。" : stage === "checking" ? "エンジンが確かめています…" : stage === "intro" ? "あなたの一手…" : ""}
            </span>
            <span className="legend-sep" />
            {stage === "guess" && !hint && <button className="chip" onClick={() => { mistakes.current += 1; setHint(true); }}>💡 ヒント（狙う駒）</button>}
            {(stage === "guess" || stage === "defend") && <button className="chip" onClick={giveUp}>答えを見る</button>}
          </div>
        </div>
      </div>

      <aside className="panel">
        <div className="panel-scroll">
          <div className="card">
            <div className="drill-head">
              <button className="link" onClick={onBack}>← 狙い一覧</button>
              <span className="muted small">今回 {session.clean}/{session.done} ノーミス</span>
            </div>
            <div className="card-title" style={{ marginTop: 6 }}>🛡 相手の狙いを見抜く</div>
            {hidden ? <h2 className="op-name">？？？</h2> : <><h2 className="op-name">{aim.ja}</h2><div className="op-en">{aim.en}</div></>}
            {!hidden && <div className="idea" style={{ borderLeftColor: "#ca3431" }}><span className="idea-move">気づき方</span><span>{aim.cue}</span></div>}
            <div className="aim-levels" style={{ marginTop: 12 }}>
              {LEVELS.map((l) => (
                <button key={l.id} className={`chip ${level === l.id ? "on" : ""}`} onClick={() => setLevel(l.id)} title={`レーティング ${l.range}`}>{l.ja}</button>
              ))}
            </div>
          </div>
          {msg && <div className="card feedback fb-bad"><div className="fb-title">✕ {msg}</div></div>}
          {guessed !== undefined && stage !== "guess" && (
            <div className={`card feedback ${guessed ? "fb-good" : "fb-soft"}`}>
              <div className="fb-title">{guessed ? "✓ 狙いを見抜いた" : "相手の狙い"}：{steps[1].san} のあと {steps[2].san}</div>
              {stage !== "done" && <div className="fb-body">では一手戻って、{steps[1].san} の代わりに、この狙いを消す手を。</div>}
            </div>
          )}
          {stage === "done" && defense && (
            <div className={`card feedback ${defense.ok ? (mistakes.current ? "fb-good" : "fb-done") : "fb-soft"}`}>
              <div className="fb-title">{defense.ok ? `✓ ${defense.san} で防げる` : `守りの一手：${defense.san}`}</div>
              <div className="fb-body">
                {defense.ok && defense.bestSan && defense.bestSan !== defense.san && <>エンジンの最善は {defense.bestSan}。</>}
                実戦の {steps[1].san} は、相手に {steps[2].san}（{aim.id ? aim.ja : "戦術"}）を許していました。
              </div>
              <div className="fb-opp">指す前に毎回「相手の駒が次に取れるもの・チェック・当たり」を確かめる。それだけで、この種類のミスはほとんど消えます。</div>
              <div className="fb-actions">
                <button className="primary" onClick={next}>次の局面 ▶</button>
              </div>
              <div className="muted small" style={{ marginTop: 8 }}>難度 {cur.row[3]} ・ <a href={`https://lichess.org/training/${cur.row[0]}`} target="_blank" rel="noreferrer">Lichess で見る</a></div>
            </div>
          )}
          {(stage === "guess" || stage === "intro") && (
            <div className="card">
              <div className="card-title">進め方</div>
              <ul className="plan-list">
                <li>あなたの一手（黄色のマス）のあと、相手に<b>狙い</b>が生まれました。</li>
                <li>① 相手の駒を動かして、その狙いを当てます（チェック・駒取り・当たりから探す）。</li>
                <li>② 一手戻るので、狙いを消す別の手を指します。エンジンが判定します。</li>
              </ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
