// 振り返り: replay your own games, solve your own mistakes as puzzles, and see which kinds of
// mistakes you make most — each kind points at the drill that trains it.
import { Chess, type Color } from "chess.js";
import { useEffect, useMemo, useRef, useState } from "react";
import Board, { type Arrow, type BadgeKind } from "../components/Board";
import { Reasons } from "../components/panels";
import { AIMS } from "../data/aims";
import { engine, type EngineLine } from "../lib/engine";
import { explainMove } from "../lib/explain";
import {
  allPuzzles, analyzeOne, badMoves, KIND_INFO, slipLines, loadAnalysis, loadReviewGames, positionsOf, REVIEW_STATS_KEY, saveAnalysis, tally,
  type GameAnalysis, type ReviewGame, type SlipRef,
} from "../lib/gameReview";
import { loadStore, syncGames } from "../lib/myGames";
import { speedJa } from "../lib/rating";
import { sfx } from "../lib/sound";
import { load, pickLine, recordResult, save, type CourseStats } from "../lib/storage";
import { VERDICT_LABEL, winPct } from "../lib/tactics";
import { useScrollTop } from "../lib/useScrollTop";

export type DrillTarget = { aim: string; view: "attack" | "threat" };
interface Props {
  onDrill: (t: DrillTarget) => void;
  onSpar: (fen: string, side: Color) => void;
  onImport: () => void;
  startPuzzles?: number; // nonce: open straight into the puzzles (from 今日の練習)
}

// For the opponent's punishing reply, the "sacrifice" reading of the rule-based explainer misleads: keep the concrete reasons.
const concrete = (ex?: ReturnType<typeof explainMove>) => (ex ? { ...ex, reasons: ex.reasons.filter((r) => r.kind !== "sacrifice") } : undefined);
const aimJa = (id?: string) => (id === "mix" ? "ミックス" : AIMS.find((a) => a.id === id)?.ja ?? "");
const dateJa = (t: number) => new Date(t).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
const resultJa = (g: ReviewGame) => (g.result === "1/2-1/2" ? "引き分け" : (g.result === "1-0") === (g.color === "w") ? "勝ち" : "負け");

export default function Review({ onDrill, onSpar, onImport, startPuzzles }: Props) {
  const [games, setGames] = useState(loadReviewGames);
  const [an, setAn] = useState(loadAnalysis);
  const [view, setView] = useState<{ kind: "list" } | { kind: "game"; id: string; ply?: number } | { kind: "puzzles"; only?: string }>(() => (startPuzzles ? { kind: "puzzles" } : { kind: "list" }));
  const [busy, setBusy] = useState<string>();
  const stopRef = useRef(false);
  useEffect(() => () => void (stopRef.current = true), []);

  const store = loadStore();
  const refresh = () => {
    setGames(loadReviewGames());
    setAn(loadAnalysis());
  };

  const fetchMoves = async () => {
    if (!store) return;
    setBusy("対局を取得中…");
    try {
      await syncGames({ prev: store, src: store.source, who: store.who, speed: store.speed, max: 50, full: true, onStatus: setBusy });
      refresh();
      setBusy(undefined);
    } catch (e) {
      setBusy(`取得できませんでした：${(e as Error).message}`);
    }
  };

  const analyzeBatch = async (ids: string[]) => {
    stopRef.current = false;
    for (let i = 0; i < ids.length; i++) {
      const g = games.find((x) => x.id === ids[i]);
      if (!g) continue;
      const a = await analyzeOne(g, (k, n) => setBusy(`エンジンで分析中… ${i + 1}/${ids.length} 局目（${k}/${n} 手）`), () => stopRef.current);
      if (!a) break;
      saveAnalysis(g.id, a);
      setAn(loadAnalysis());
    }
    setBusy(undefined);
  };

  if (view.kind === "game") {
    const g = games.find((x) => x.id === view.id);
    if (g) return <GameView game={g} analysis={an[g.id]} startPly={view.ply} onBack={() => setView({ kind: "list" })} onSpar={onSpar} onPuzzle={(key) => setView({ kind: "puzzles", only: key })} onAnalyzed={refresh} />;
  }
  if (view.kind === "puzzles") return <Puzzles only={view.only} onBack={() => setView({ kind: "list" })} onDrill={onDrill} onGame={(id, ply) => setView({ kind: "game", id, ply })} />;

  const unanalysed = games.filter((g) => !an[g.id]);
  const t = tally(games, an);
  const puzzles = allPuzzles(games, an);
  const stats = load<CourseStats>(REVIEW_STATS_KEY, {});
  const now = Date.now();
  const due = puzzles.filter((p) => stats[p.key] && stats[p.key].due <= now).length;
  const fresh = puzzles.filter((p) => !stats[p.key]).length;
  const maxKind = Math.max(1, ...t.kinds.map((k) => k.n));

  return (
    <div className="picker">
      <header className="picker-head">
        <h1>振り返り</h1>
        <p>
          自分の対局をエンジンで調べ、<strong>ミスした局面を「本当はどう指すべきだったか」の問題</strong>にします。他人の問題より、自分のミスの方がずっと身につきます。
          ミスは種類ごとに数え、一番多い種類を鍛えるドリルに直接つなぎます。
        </p>
      </header>

      {!store && !games.length && (
        <div className="card">
          まだ対局がありません。<button className="link" onClick={onImport}>タイプ診断</button>で chess.com / Lichess のユーザー名を入れるか、棋譜を貼り付けて取り込んでください。取り込んだ対局がここに並びます。
        </div>
      )}
      {store && !games.length && (
        <div className="card">
          <div>取り込み済みの対局は統計だけで、指し手の記録がありません。{store.source === "pgn" ? "タイプ診断でもう一度棋譜を貼り付けてください。" : `${store.who}（${store.source === "lichess" ? "Lichess" : "chess.com"}）の直近 50 局を読み直します。`}</div>
          {store.source !== "pgn" && <button className="primary" style={{ marginTop: 10 }} disabled={!!busy} onClick={fetchMoves}>直近 50 局の棋譜を読み込む</button>}
        </div>
      )}
      {busy && (
        <div className="card review-busy">
          <span>{busy}</span>
          {busy.startsWith("エンジン") && <button className="chip" onClick={() => (stopRef.current = true)}>止める</button>}
        </div>
      )}

      {games.length > 0 && (
        <>
          <div className="review-top">
            <div className="card">
              <div className="card-title">エンジン分析</div>
              <div className="small">分析済み {games.length - unanalysed.length} / {games.length} 局{unanalysed.length > 0 && "（1 局あたり 10〜30 秒）"}</div>
              <div className="fb-actions">
                {unanalysed.length > 0 && <button className="primary" disabled={!!busy} onClick={() => analyzeBatch(unanalysed.slice(0, 5).map((g) => g.id))}>新しい {Math.min(5, unanalysed.length)} 局を分析</button>}
                {unanalysed.length > 5 && <button disabled={!!busy} onClick={() => analyzeBatch(unanalysed.slice(0, 20).map((g) => g.id))}>{Math.min(20, unanalysed.length)} 局まとめて</button>}
                {store && store.source !== "pgn" && <button disabled={!!busy} onClick={fetchMoves}>最新の対局を読み込む</button>}
              </div>
            </div>
            <div className="card">
              <div className="card-title">自分のミスを解く</div>
              <div className="small">{puzzles.length ? <>問題 {puzzles.length} 問（期限 {due} 問・未挑戦 {fresh} 問）。間違えた問題ほど早くまた出ます。</> : "対局を分析すると、悪手・ブランダーの局面が問題になります。"}</div>
              <div className="fb-actions">
                <button className="primary" disabled={!puzzles.length} onClick={() => setView({ kind: "puzzles" })}>問題を解く ▶</button>
              </div>
            </div>
          </div>

          {t.total > 0 && (
            <div className="card">
              <div className="card-title">ミスの種類 <span className="muted">— 分析した {t.games} 局の悪手・ブランダー {t.total} 回</span></div>
              <div className="kind-list">
                {t.kinds.map((k) => {
                  const info = KIND_INFO[k.kind];
                  const topAim = Object.entries(k.aims).sort((a, b) => b[1] - a[1])[0]?.[0] ?? info.aim;
                  return (
                    <div key={k.kind} className="kind-row">
                      <div className="kind-head">
                        <b>{info.ja}</b>
                        <span className="muted small">{k.n} 回</span>
                      </div>
                      <div className="bar"><span style={{ width: `${(k.n / maxKind) * 100}%` }} /></div>
                      <div className="muted small">{info.what}{Object.keys(k.aims).length > 0 && <>（{Object.entries(k.aims).sort((a, b) => b[1] - a[1]).map(([a, n]) => `${aimJa(a)} ${n}`).join("・")}）</>}</div>
                      <div className="kind-go">
                        {info.view !== "spar" && topAim && (
                          <button className="chip on" onClick={() => onDrill({ aim: topAim, view: info.view as "attack" | "threat" })}>
                            {info.view === "threat" ? "🛡 相手の狙いを見抜くドリル" : "⚔️ 狙いドリル"}：{aimJa(topAim)} ▶
                          </button>
                        )}
                        {info.view === "spar" && <span className="muted small">→ 下の対局一覧から局面を開き「局面練習で指し直す」で、計画ごと指し直すのが効きます。</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="phase-row">
                {(["序盤", "中盤", "終盤"] as const).map((p) => (
                  <span key={p} className="phase-chip">{p} <b>{t.phases[p]}</b></span>
                ))}
                <span className="muted small">{phaseAdvice(t.phases)}</span>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-title">対局 <span className="muted">— 新しい順</span></div>
            <div className="review-games">
              {games.map((g) => {
                const a = an[g.id];
                const n = (v: string) => a?.slips.filter((s) => s.verdict === v).length ?? 0;
                return (
                  <button key={g.id} className="review-game" onClick={() => setView({ kind: "game", id: g.id })}>
                    <span className={`rg-side ${g.color}`} title={g.color === "w" ? "白番" : "黒番"} />
                    <span className="rg-date">{dateJa(g.t)}</span>
                    <span className={`rg-res ${resultJa(g) === "勝ち" ? "win" : resultJa(g) === "負け" ? "loss" : ""}`}>{resultJa(g)}</span>
                    <span className="rg-meta muted small">{g.sp ? speedJa(g.sp) : ""}{g.or ? ` ・ 相手 ${g.or}` : ""} ・ {Math.ceil(g.moves.split(" ").length / 2)} 手</span>
                    <span className="rg-v">
                      {a ? (
                        <>
                          {n("blunder") > 0 && <b style={{ color: VERDICT_LABEL.blunder.color }}>??×{n("blunder")}</b>}
                          {n("mistake") > 0 && <b style={{ color: VERDICT_LABEL.mistake.color }}>?×{n("mistake")}</b>}
                          {n("inaccuracy") > 0 && <b style={{ color: VERDICT_LABEL.inaccuracy.color }}>?!×{n("inaccuracy")}</b>}
                          {!a.slips.length && <span className="tone-pos small">ミスなし</span>}
                        </>
                      ) : (
                        <span className="muted small">未分析</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function phaseAdvice(p: Record<string, number>) {
  const top = (Object.entries(p) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
  if (!top || !top[1]) return "";
  return top[0] === "序盤" ? "序盤のミスが多い → 型ドリルで定跡の「意味」を固める" : top[0] === "中盤" ? "中盤のミスが多い → 狙いドリル（攻め・守り）で戦術の目を作る" : "終盤のミスが多い → 局面練習で終盤を指し直す";
}

// ───────────────────────── one game ─────────────────────────
function GameView({ game, analysis, startPly, onBack, onSpar, onPuzzle, onAnalyzed }: { game: ReviewGame; analysis?: GameAnalysis; startPly?: number; onBack: () => void; onSpar: (fen: string, side: Color) => void; onPuzzle: (key: string) => void; onAnalyzed: () => void }) {
  useScrollTop();
  const { fens, sans, ucis } = useMemo(() => positionsOf(game), [game]);
  const [ply, setPly] = useState(startPly !== undefined ? startPly : 0); // number of moves on the board
  const [busy, setBusy] = useState<string>();
  const stop = useRef(false);
  useEffect(() => () => void (stop.current = true), []);
  const slips = useMemo(() => badMoves(analysis), [analysis]);
  const total = sans.length;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setPly((p) => Math.min(total, p + 1));
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [total]);

  const analyse = async () => {
    stop.current = false;
    const a = await analyzeOne(game, (k, n) => setBusy(`分析中… ${k}/${n}`), () => stop.current);
    if (a) saveAnalysis(game.id, a);
    setBusy(undefined);
    onAnalyzed();
  };

  // The move just played (ply-1) and, if it was the player's mistake, what was better.
  const lastIdx = ply - 1;
  const slip = lastIdx >= 0 ? slips.get(lastIdx) : undefined;
  // Standing on the position before a mistake also shows it (so "this position" = the puzzle).
  const nextSlip = slips.get(ply);
  const arrows: Arrow[] = [];
  if (slip) arrows.push({ from: slip.best.slice(0, 2), to: slip.best.slice(2, 4), color: "#81b64c", width: 15, opacity: 0.85 });
  const badge: { sq: string; kind: BadgeKind } | undefined = slip ? { sq: ucis[lastIdx].slice(2, 4), kind: slip.verdict as BadgeKind } : undefined;
  const evAt = (k: number) => (analysis && k >= analysis.from && k - analysis.from < analysis.ev.length ? analysis.ev[k - analysis.from] : undefined);
  const ev = evAt(ply);
  const wp = ev !== undefined ? winPct(ev, undefined, game.color) : undefined;
  const ex = concrete(slip && slip.reply ? explainMove(fens[ply], slip.reply, slipLines(slip).reply) : undefined);
  const exBest = slip ? explainMove(fens[lastIdx], slip.best, slipLines(slip).best) : undefined;

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="board-stack">
          <Board fen={fens[ply]} orientation={game.color} lastMove={ply ? { from: ucis[ply - 1].slice(0, 2), to: ucis[ply - 1].slice(2, 4) } : undefined} movable="none" onMove={() => {}} arrows={arrows} badge={badge} animKey={ply} glow={false} />
          <div className="legend demo-controls">
            <button className="chip" onClick={() => setPly(0)} disabled={!ply}>⏮</button>
            <button className="chip" onClick={() => setPly(Math.max(0, ply - 1))} disabled={!ply}>◀</button>
            <span className="muted small">{ply}/{total}</span>
            <button className="chip" onClick={() => setPly(Math.min(total, ply + 1))} disabled={ply >= total}>▶</button>
            <button className="chip" onClick={() => setPly(total)} disabled={ply >= total}>⏭</button>
            {analysis && slips.size > 0 && (
              <button className="chip" onClick={() => {
                const next = [...slips.keys()].sort((a, b) => a - b).find((k) => k + 1 > ply);
                setPly(next !== undefined ? next + 1 : [...slips.keys()].sort((a, b) => a - b)[0] + 1);
              }}>次のミスへ ⏩</button>
            )}
          </div>
        </div>
      </div>
      <aside className="panel">
        <div className="panel-scroll">
          <div className="card">
            <div className="drill-head">
              <button className="link" onClick={onBack}>← 振り返り</button>
              <span className="muted small">{dateJa(game.t)} ・ {game.color === "w" ? "白番" : "黒番"} ・ {resultJa(game)}{game.or ? ` ・ 相手 ${game.or}` : ""}</span>
            </div>
            {!analysis && (
              <div style={{ marginTop: 8 }}>
                {busy ? <span className="small">{busy}</span> : <button className="primary" onClick={analyse}>この対局をエンジンで分析</button>}
              </div>
            )}
            {wp !== undefined && <div className="small" style={{ marginTop: 6 }}>この局面のあなたの勝率（目安） <b className={wp >= 55 ? "tone-pos" : wp <= 45 ? "tone-neg" : ""}>{Math.round(wp)}%</b></div>}
          </div>

          {slip && (
            <div className={`card feedback ${slip.verdict === "blunder" ? "fb-bad" : "fb-soft"}`}>
              <div className="fb-title">
                <b style={{ color: VERDICT_LABEL[slip.verdict].color }}>{VERDICT_LABEL[slip.verdict].sym}</b> {slip.playedSan} — {VERDICT_LABEL[slip.verdict].ja}（勝率 −{slip.drop}%）
              </div>
              <div className="fb-body">
                <b>{KIND_INFO[slip.kind].ja}</b>{slip.aim && slip.aim !== "mix" ? `（${aimJa(slip.aim)}）` : ""}。最善は <b className="tone-pos">{slip.bestSan}</b>（緑の矢印）。
              </div>
              {ex && ex.reasons.length > 0 && <><div className="plans-title" style={{ marginTop: 8 }}>この手のあと、相手には {ex.pvSan[0]} があった</div><Reasons ex={ex} max={3} /></>}
              {exBest && <><div className="plans-title" style={{ marginTop: 8 }}>{slip.bestSan} なら</div><Reasons ex={exBest} max={3} /></>}
              <div className="fb-actions">
                <button className="primary" onClick={() => onPuzzle(`${game.id}:${slip.ply}`)}>この局面を問題として解く</button>
                <button onClick={() => onSpar(fens[lastIdx], game.color)}>局面練習で指し直す</button>
              </div>
            </div>
          )}
          {!slip && nextSlip && <div className="card small">次の手で{VERDICT_LABEL[nextSlip.verdict].ja}（{nextSlip.playedSan}）。どう指すべきか考えてから ▶。</div>}

          <div className="card">
            <div className="card-title">棋譜</div>
            <div className="seq">
              {sans.map((s, k) => {
                const sl = slips.get(k);
                return (
                  <span key={k} className={`seq-m shown clickable ${k === ply - 1 ? "cur" : ""} ${(k % 2 === 0) === (game.color === "w") ? "mine" : "opp"}`} onClick={() => setPly(k + 1)}>
                    {k % 2 === 0 && <span className="muted">{k / 2 + 1}.</span>}
                    {s}
                    {sl && <b style={{ color: VERDICT_LABEL[sl.verdict].color }}>{VERDICT_LABEL[sl.verdict].sym}</b>}
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

// ───────────────────────── puzzles from your own mistakes ─────────────────────────
function Puzzles({ only, onBack, onDrill, onGame }: { only?: string; onBack: () => void; onDrill: (t: DrillTarget) => void; onGame: (id: string, ply: number) => void }) {
  useScrollTop();
  const pool = useMemo(() => {
    const all = allPuzzles();
    return only ? all.filter((p) => p.key === only) : all;
  }, [only]);
  const [stats, setStats] = useState<CourseStats>(() => load(REVIEW_STATS_KEY, {}));
  const [cur, setCur] = useState<SlipRef | undefined>(() => (pool.length ? (only ? pool[0] : pickLine(pool, stats)) : undefined));
  const [fen, setFen] = useState(cur?.slip.fen);
  const [last, setLast] = useState<{ from: string; to: string }>();
  const [state, setState] = useState<"play" | "checking" | "solved" | "shown">("play");
  const [msg, setMsg] = useState<string>();
  const [flash, setFlash] = useState<{ sq: string; n: number }>();
  const [hint, setHint] = useState(0);
  const [session, setSession] = useState({ done: 0, clean: 0 });
  const [alt, setAlt] = useState<string>();
  const mistakes = useRef(0);

  if (!cur) {
    return (
      <div className="picker">
        <button className="link" onClick={onBack}>← 振り返り</button>
        <p className="muted">問題がありません。対局を分析してください。</p>
      </div>
    );
  }
  const s = cur.slip;
  const me = s.fen.split(" ")[1] as Color;

  const finish = (ok: boolean) => {
    const st = recordResult(stats, cur.key, ok ? mistakes.current : Math.max(1, mistakes.current));
    setStats(st);
    save(REVIEW_STATS_KEY, st);
    setSession((x) => ({ done: x.done + 1, clean: x.clean + (ok && mistakes.current === 0 ? 1 : 0) }));
  };

  const onMove = async (from: string, to: string, promotion?: string) => {
    if (state !== "play") return;
    const c = new Chess(s.fen);
    const m = c.move({ from, to, promotion });
    const uci = from + to + (m.promotion ?? "");
    setFen(c.fen());
    setLast({ from, to });
    (m.captured ? sfx.capture : sfx.move)();
    if (uci === s.best || c.isCheckmate()) {
      setState("solved");
      setMsg(undefined);
      finish(true);
      (mistakes.current ? sfx.good : sfx.done)();
      return;
    }
    if (uci === s.played) {
      mistakes.current++;
      setMsg(`${m.san} は実戦で指した手です。別の手を。`);
      setFlash({ sq: to, n: Date.now() });
      sfx.wrong();
      setTimeout(() => { setFen(s.fen); setLast(undefined); }, 500);
      return;
    }
    // Another move can be just as good: ask the engine.
    setState("checking");
    const lines: EngineLine[] = await Promise.race([
      engine.run({ fen: s.fen, searchmoves: [uci], multipv: 1, depth: 12 }),
      new Promise<EngineLine[]>((r) => setTimeout(() => r([]), 15000)),
    ]);
    const wp = lines[0] ? winPct(lines[0].cp, lines[0].mate, me) : 0;
    if (lines[0] && wp >= s.wpBefore - 5) {
      setState("solved");
      setAlt(m.san);
      setMsg(undefined);
      finish(true);
      sfx.good();
      return;
    }
    mistakes.current++;
    setState("play");
    setMsg(`${m.san} ではまだ足りません（勝率 ${Math.round(wp)}%）。もう一度。`);
    setFlash({ sq: to, n: Date.now() });
    sfx.wrong();
    setTimeout(() => { setFen(s.fen); setLast(undefined); }, 500);
  };

  const next = () => {
    const p = only ? undefined : pickLine(pool, stats, cur.key);
    if (!p) return onBack();
    mistakes.current = 0;
    setCur(p);
    setFen(p.slip.fen);
    setLast(undefined);
    setState("play");
    setMsg(undefined);
    setHint(0);
    setAlt(undefined);
  };

  const showAnswer = () => {
    mistakes.current++;
    const c = new Chess(s.fen);
    c.move({ from: s.best.slice(0, 2), to: s.best.slice(2, 4), promotion: s.best[4] });
    setFen(c.fen());
    setLast({ from: s.best.slice(0, 2), to: s.best.slice(2, 4) });
    setState("shown");
    finish(false);
  };

  const done = state === "solved" || state === "shown";
  const info = KIND_INFO[s.kind];
  const arrows: Arrow[] = [];
  if (done && s.played !== s.best) arrows.push({ from: s.played.slice(0, 2), to: s.played.slice(2, 4), color: "#ca3431", width: 12, opacity: 0.6, dash: true });
  const marks = !done && hint >= 1 ? [{ sq: s.best.slice(0, 2), from: s.best.slice(0, 2), kind: "ok" as const, share: 1, label: "この駒" }] : [];
  const exBest = done ? explainMove(s.fen, s.best, slipLines(s).best) : undefined;
  const afterPlayed = (() => {
    const c = new Chess(s.fen);
    try { c.move({ from: s.played.slice(0, 2), to: s.played.slice(2, 4), promotion: s.played[4] }); } catch { return undefined; }
    return c.fen();
  })();
  const exReply = concrete(done && s.reply && afterPlayed ? explainMove(afterPlayed, s.reply, slipLines(s).reply) : undefined);

  return (
    <div className="play-layout">
      <div className="board-col">
        <div className="board-stack">
          <Board fen={fen ?? s.fen} orientation={me} lastMove={last} movable={state === "play" ? me : "none"} onMove={onMove} arrows={arrows} marks={marks} showMarks flash={flash} glow={false}
            badge={done && last ? { sq: last.to, kind: state === "solved" ? (mistakes.current ? "good" : "best") : "book" } : undefined} />
          <div className="legend">
            <span className="muted small">あなたは{me === "w" ? "白" : "黒"}番。{state === "checking" ? "エンジンが確かめています…" : done ? "" : "実戦ではここでミスしました。最善を探してください。"}</span>
            <span className="legend-sep" />
            {state === "play" && hint === 0 && <button className="chip" onClick={() => { mistakes.current++; setHint(1); }}>💡 ヒント（動かす駒）</button>}
            {state === "play" && <button className="chip" onClick={showAnswer}>答えを見る</button>}
          </div>
        </div>
      </div>
      <aside className="panel">
        <div className="panel-scroll">
          <div className="card">
            <div className="drill-head">
              <button className="link" onClick={onBack}>← 振り返り</button>
              <span className="muted small">今回 {session.clean}/{session.done} ノーミス ・ 全 {pool.length} 問</span>
            </div>
            <h2 className="op-name">自分のミスを解く</h2>
            <div className="op-en">{dateJa(cur.game.t)} の対局 ・ {Math.floor(s.ply / 2) + 1} 手目 ・ {s.phase}</div>
            <div className="idea"><span className="idea-move">問い</span><span>実戦の {s.playedSan} は{VERDICT_LABEL[s.verdict].ja}でした（勝率 −{s.drop}%）。本当はどう指すべきだった？</span></div>
          </div>
          {msg && !done && <div className="card feedback fb-bad"><div className="fb-title">✕ {msg}</div></div>}
          {done && (
            <div className={`card feedback ${state === "solved" ? (mistakes.current ? "fb-good" : "fb-done") : "fb-soft"}`}>
              <div className="fb-title">{state === "solved" ? (alt ? `✓ ${alt} も正解（エンジンの最善は ${s.bestSan}）` : `✓ 正解 ${s.bestSan}`) : `答え：${s.bestSan}`}</div>
              <div className="fb-body"><b>ミスの種類：{info.ja}</b>{s.aim && s.aim !== "mix" ? `（${aimJa(s.aim)}）` : ""}。{info.what}</div>
              {exBest && <><div className="plans-title" style={{ marginTop: 8 }}>{s.bestSan} の狙い</div><Reasons ex={exBest} max={3} /></>}
              {exReply && exReply.reasons.length > 0 && <><div className="plans-title" style={{ marginTop: 8 }}>実戦の {s.playedSan} には {exReply.pvSan[0]} があった（赤の点線が実戦の手）</div><Reasons ex={exReply} max={3} /></>}
              <div className="muted small" style={{ marginTop: 6 }}>読み筋：{exBest?.pvSan.slice(0, 6).join(" ")}</div>
              <div className="fb-actions">
                <button className="primary" onClick={next}>{only ? "戻る" : "次の問題 ▶"}</button>
                {info.view !== "spar" && (s.aim ?? info.aim) && <button onClick={() => onDrill({ aim: s.aim ?? info.aim!, view: info.view as "attack" | "threat" })}>{info.view === "threat" ? "🛡 相手の狙いドリル" : "⚔️ 狙いドリル"}で鍛える</button>}
                <button onClick={() => onGame(cur.game.id, s.ply)}>対局で見る</button>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
