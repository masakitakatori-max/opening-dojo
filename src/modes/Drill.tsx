import { Chess } from "chess.js";
import { BASE } from "../lib/asset";
import { useEffect, useMemo, useRef, useState } from "react";
import Board, { type Arrow, type BadgeKind, type SquareMark } from "../components/Board";
import { GmChips, LineTimeline, replay } from "../components/panels";
import { COURSES, courseLines, type Course, type DrillLine } from "../data/courses";
import { sfx } from "../lib/sound";
import { useScrollTop } from "../lib/useScrollTop";
import { load, mastered, pickLine, recordResult, save, statsKey, type CourseStats } from "../lib/storage";
import { candidates, getNode, nearestWith, openingChain, openingOf } from "../lib/tree";

type Hint = "always" | "after" | "never";
type Feedback = { kind: "good" | "best" | "soft" | "bad" | "info" | "done"; title: string; body?: string };

export default function Drill({ onExplore }: { onExplore: (moves: string[]) => void }) {
  const [course, setCourse] = useState<Course | null>(null);
  if (!course) return <CoursePicker onPick={setCourse} />;
  return <Session key={course.id} course={course} onBack={() => setCourse(null)} onExplore={onExplore} />;
}

function CoursePicker({ onPick }: { onPick: (c: Course) => void }) {
  const groups = ["1.e4", "1.d4", "vs 1.e4", "vs 1.d4", "GM"];
  const label: Record<string, string> = { "1.e4": "白番：1.e4 の型", "1.d4": "白番：1.d4 の型", "vs 1.e4": "黒番：1.e4 への応手", "vs 1.d4": "黒番：1.d4 への応手", GM: "歴代 GM のレパートリー" };
  return (
    <div className="picker">
      <header className="picker-head">
        <h1>型ドリル</h1>
        <p>
          コースを選ぶと、相手が定跡の応手をランダムに指してきます。あなたは<strong>型どおりの一手</strong>を指してください。
          間違えた手順ほど早く再出題されるので（間隔反復）、苦手な分岐が自然に身につきます。
        </p>
      </header>
      {groups.map((g) => (
        <section key={g}>
          <h3 className="picker-group">{label[g]}</h3>
          <div className="course-grid">
            {COURSES.filter((c) => c.tag === g).map((c) => {
              const lines = courseLines(c);
              const st = load<CourseStats>(statsKey(c.id), {});
              const m = lines.filter((l) => mastered(st[l.key])).length;
              const seen = lines.filter((l) => st[l.key]).length;
              return (
                <button key={c.id} className="course" onClick={() => onPick(c)}>
                  <div className="course-top">
                    <img src={`${BASE}pieces/${c.side}${c.gm ? "Q" : "K"}.svg`} alt="" />
                    <div>
                      <div className="course-title">{c.title}</div>
                      <div className="course-sub">{c.sub}</div>
                    </div>
                  </div>
                  <div className="course-progress">
                    <div className="bar"><span style={{ width: `${(m / lines.length) * 100}%` }} /><span className="seen" style={{ width: `${(seen / lines.length) * 100}%` }} /></div>
                    <span className="muted small">習得 {m}/{lines.length} ライン</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function Session({ course, onBack, onExplore }: { course: Course; onBack: () => void; onExplore: (moves: string[]) => void }) {
  useScrollTop();
  const lines = useMemo(() => courseLines(course), [course]);
  const [stats, setStats] = useState<CourseStats>(() => load(statsKey(course.id), {}));
  const [line, setLine] = useState<DrillLine>(() => pickLine(lines, stats));
  const [played, setPlayed] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [hint, setHint] = useState<Hint>(() => load("dojo.hint", "always"));
  const [feedback, setFeedback] = useState<Feedback>({ kind: "info", title: "型をなぞろう", body: course.side === "w" ? "あなたは白番。最初の一手からどうぞ。" : "あなたは黒番。相手の一手を待って応じてください。" });
  const [flash, setFlash] = useState<{ sq: string; n: number }>();
  const [oppNote, setOppNote] = useState<string>();
  const [banner, setBanner] = useState<{ text: string; n: number }>();
  const [animKey, setAnimKey] = useState(0);
  const [badge, setBadge] = useState<{ sq: string; kind: BadgeKind }>();
  const done = played >= line.moves.length;
  const lineMistakes = useRef(0);

  useEffect(() => save("dojo.hint", hint), [hint]);

  const path = useMemo(() => replay(line.moves.slice(0, played)), [line, played]);
  const fen = path[played].fen;
  const last = path[played];
  const turn = fen.split(" ")[1] as "w" | "b";
  const myTurn = turn === course.side && !done;
  const expected = line.moves[played];

  const advance = (san: string) => {
    const before = path[played].fen;
    const c = new Chess(before);
    const mv = c.move(san);
    setPlayed((p) => p + 1);
    setAnimKey((k) => k + 1);
    (mv.san.includes("+") ? sfx.check : mv.captured ? sfx.capture : sfx.move)();
    const a = openingOf(c.fen());
    const b = openingOf(before);
    if (a && a.key !== b?.key && a.depth > 0) setBanner({ text: a.info!.name!, n: Date.now() });
    return mv;
  };

  // Opponent replies
  useEffect(() => {
    if (done || turn === course.side) return;
    const t = setTimeout(() => {
      const mv = advance(line.moves[played]);
      const cands = candidates(path[played].fen);
      const share = cands.find((c) => c.san === mv.san)?.share;
      setBadge(undefined);
      setOppNote(`相手の応手：${mv.san}${share !== undefined ? `（この局面で ${Math.round(share * 100)}%）` : ""} — あなたの番`);
    }, played === 0 ? 600 : 650);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [played, line, done]);

  // Finish
  useEffect(() => {
    if (!done) return;
    sfx.done();
    const st = recordResult(stats, line.key, lineMistakes.current);
    setStats(st);
    save(statsKey(course.id), st);
    const op = openingOf(path[played].fen);
    setFeedback({
      kind: "done",
      title: lineMistakes.current === 0 ? "ライン完走！ノーミス" : `ライン完走（ミス ${lineMistakes.current}）`,
      body: op?.info?.name ? `到達した型：${op.info.name}` : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(undefined), 2400);
    return () => clearTimeout(t);
  }, [banner]);

  const onMove = (from: string, to: string, promotion?: string) => {
    if (!myTurn) return;
    setOppNote(undefined);
    const c = new Chess(fen);
    const mv = c.move({ from, to, promotion });
    const cands = candidates(fen);
    if (mv.san === expected) {
      advance(mv.san);
      const hit = cands.find((x) => x.san === mv.san);
      const kind: BadgeKind = hit?.rank === 0 ? "best" : "good";
      setBadge({ sq: mv.to, kind });
      sfx.good();
      const idea = getNode(c.fen())?.info?.idea;
      setFeedback({ kind: hit?.rank === 0 ? "best" : "good", title: `✓ ${mv.san} ${hit?.rank === 0 ? "— 主線！" : "— 型どおり"}`, body: idea });
      setRevealed(false);
      return;
    }
    // wrong
    lineMistakes.current += 1;
    setMistakes((m) => m + 1);
    setFlash({ sq: mv.to, n: Date.now() });
    setRevealed(true);
    sfx.wrong();
    const alt = cands.find((x) => x.san === mv.san);
    if (alt) {
      const name = alt.childNode.info?.name;
      setFeedback({
        kind: "soft",
        title: `△ ${mv.san} も定跡${name ? `（${name}）` : ""}`,
        body: `ただ、このコースで覚える型は別の手。オレンジに光るマスを見て、もう一度。`,
      });
    } else {
      setFeedback({ kind: "bad", title: `✕ ${mv.san} は定跡外`, body: "オレンジに光るマスが型の一手。駒を選ぶと候補が強調されます。" });
    }
  };

  const next = () => {
    const l = pickLine(lines, stats, line.key);
    lineMistakes.current = 0;
    setLine(l);
    setOppNote(undefined);
    setPlayed(0);
    setRevealed(false);
    setBadge(undefined);
    setFeedback({ kind: "info", title: "次のライン", body: course.side === "w" ? "白番。最初の一手から。" : "黒番。相手の手を待ちましょう。" });
  };
  const retry = () => {
    lineMistakes.current = 0;
    setOppNote(undefined);
    setPlayed(0);
    setRevealed(false);
    setBadge(undefined);
    setFeedback({ kind: "info", title: "もう一度", body: "同じラインをノーミスで。" });
  };

  // Hints on the board
  const showHint = myTurn && (hint === "always" || (hint === "after" && revealed));
  let marks: SquareMark[] = [];
  let arrows: Arrow[] = [];
  if (showHint && expected) {
    const c = new Chess(fen);
    const mv = c.move(expected);
    const others = candidates(fen).filter((x) => x.san !== expected);
    marks = [
      { sq: mv.to, from: mv.from, kind: "main", share: 1, label: "型" },
      ...others.map((o) => ({ sq: o.to, from: o.from, kind: "rare" as const, share: 0.2 })),
    ];
    if (revealed) arrows = [{ from: mv.from, to: mv.to, color: "#ff541c", width: 18, opacity: 0.85 }];
  }

  const st = stats;
  const masteredCount = lines.filter((l) => mastered(st[l.key])).length;
  const op = openingOf(path[Math.max(0, played)].fen);
  const planNode = nearestWith(getNode(fen) ?? op, "plans");

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="board-stack">
          <Board
            fen={fen}
            orientation={course.side}
            lastMove={last.from ? { from: last.from, to: last.to! } : undefined}
            movable={myTurn ? course.side : "none"}
            onMove={onMove}
            marks={marks}
            arrows={arrows}
            showMarks
            flash={flash}
            badge={badge}
            animKey={animKey}
            banner={banner && <div key={banner.n} className="banner"><span>{banner.text}</span></div>}
          />
          <div className="legend">
            <span className="muted small">ヒント：</span>
            {(["always", "after", "never"] as Hint[]).map((h) => (
              <button key={h} className={`chip ${hint === h ? "on" : ""}`} onClick={() => setHint(h)}>
                {h === "always" ? "常に表示" : h === "after" ? "ミス後だけ" : "なし（本番）"}
              </button>
            ))}
            {myTurn && hint !== "always" && !revealed && <button className="chip" onClick={() => setRevealed(true)}>💡 ヒント</button>}
          </div>
        </div>
      </div>

      <aside className="panel">
        <div className="panel-scroll">
          <div className="card">
            <div className="drill-head">
              <button className="link" onClick={onBack}>← コース一覧</button>
              <span className="muted small">習得 {masteredCount}/{lines.length} ・ このセッションのミス {mistakes}</span>
            </div>
            <h2 className="op-name">{course.title}</h2>
            <div className="op-en">{course.sub}</div>
            {course.gm && <GmChips names={[course.gm]} />}
            <div className="crumbs">
              {op && openingChain(op).map((n, i, a) => (
                <span key={n.key} className={i === a.length - 1 ? "crumb cur" : "crumb"}>{n.info!.name}{i < a.length - 1 ? " ›" : ""}</span>
              ))}
            </div>
          </div>

          <div className={`card feedback fb-${feedback.kind}`}>
            <div className="fb-title">{feedback.title}</div>
            {feedback.body && <div className="fb-body">{feedback.body}</div>}
            {oppNote && !done && <div className="fb-opp">{oppNote}</div>}
            {done && (
              <div className="fb-actions">
                <button className="primary" onClick={next}>次のライン ▶</button>
                <button onClick={retry}>もう一度</button>
                <button onClick={() => onExplore(line.moves)}>探索で開く</button>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">手順 <span className="muted">— {played}/{line.moves.length}</span></div>
            <div className="seq">
              {line.moves.map((m, i) => {
                const mine = (i % 2 === 0 ? "w" : "b") === course.side;
                const shown = i < played || done;
                return (
                  <span key={i} className={`seq-m ${shown ? "shown" : ""} ${i === played && !done ? "now" : ""} ${mine ? "mine" : "opp"}`}>
                    {i % 2 === 0 && <span className="seq-no">{i / 2 + 1}.</span>}
                    {shown ? m : mine ? "?" : "…"}
                  </span>
                );
              })}
            </div>
          </div>

          {done && <LineTimeline path={replay(line.moves)} ply={line.moves.length} onJump={() => onExplore(line.moves)} />}

          {planNode?.info?.plans && (
            <div className="card">
              <div className="card-title">この型の狙い <span className="muted">（{planNode.info.name}）</span></div>
              <ul className="plan-list">{planNode.info.plans.map((p) => <li key={p}>{p}</li>)}</ul>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
