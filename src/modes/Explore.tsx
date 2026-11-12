import { Chess } from "chess.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Board, { type BadgeKind, type Ghost } from "../components/Board";
import GhostCard, { type Follow } from "../components/GhostCard";
import { aggregate, gameInfo, GHOST_PLAYERS, hitsAt, jaName, loadGhost, plyInGame, type GameRef } from "../lib/ghosts";
import { bookArrows, bookMarks, CandidateList, PieceCard, VerdictCard, EnginePanel, engineMarksArrows, EvalBar, LineTimeline, MoveList, OpeningCard, replay } from "../components/panels";
import { engine, keyOf, type EngineLine } from "../lib/engine";
import { bestMoveArrow, explainReview, gradedMarks, gradePiece, reviewMove, type Graded } from "../lib/review";
import { hangingPieces } from "../lib/tactics";
import { sfx } from "../lib/sound";
import { load, save } from "../lib/storage";
import { ArtCard, ArtToast, useArt } from "../lib/useArt";
import { SpeedSlider, useReplaySpeed } from "../lib/replaySpeed";
import { candidates, getNode, mainContinuation, namedNodes, openingChain, openingOf, pathTo } from "../lib/tree";

// Replay modules: every named opening can be attached to the auto-replay, which then plays the way to it.
const MODULES = namedNodes()
  .map((n) => ({ name: n.info!.name!, path: pathTo(n), family: openingChain(n).slice(0, 2).map((c) => c.info!.name!).join(" › ") }))
  .sort((a, b) => a.path.length - b.path.length)
  .filter((m, i, a) => a.findIndex((x) => x.name === m.name) === i);
const MODULE_GROUPS = [...new Set(MODULES.map((m) => m.family))];

export interface Settings {
  marks: boolean;
  arrows: boolean;
  engine: boolean;
  sound: boolean;
  danger?: boolean;
  ghost?: boolean;
  ghostIds?: string[];
  dense?: boolean; // false = simple display (top 3 squares, one arrow, one ghost)
}
const PHONE = typeof window !== "undefined" && !!window.matchMedia?.("(max-width: 760px)").matches;
// Every master by default; on a phone only the first three, to keep the download and memory small.
const ALL_GHOSTS = GHOST_PLAYERS.map((g) => g.id as string).slice(0, PHONE ? 3 : undefined);

/**
 * `selfPlay`: the same board used as a game against yourself — its own saved game, 芸術点,
 * and one switch that turns every assist off (the engine keeps analysing quietly, so switching
 * the assists back on shows the verdict of every move played without them).
 */
export default function Explore({ initial, settings: raw, setSettings, onSpar, selfPlay }: { initial?: string[]; settings: Settings; setSettings: (s: Settings) => void; onSpar?: (fen: string) => void; selfPlay?: boolean }) {
  const storeKey = selfPlay ? "dojo.self.moves" : "dojo.explore.moves";
  const [assistOn, setAssistOn] = useState<boolean>(() => !selfPlay || load("dojo.self.assistOn", true));
  const hidden = !!selfPlay && !assistOn;
  const settings: Settings = hidden ? { ...raw, marks: false, arrows: false, danger: false, ghost: false } : raw;
  const art = useArt();
  const [moves, setMoves] = useState<string[]>(initial ?? load<string[]>(storeKey, []));
  const [ply, setPly] = useState(initial ? initial.length : moves.length);
  const [orientation, setOrientation] = useState<"w" | "b">("w");
  const [lines, setLines] = useState<EngineLine[]>([]);
  const [hover, setHover] = useState<string>();
  const [sel, setSel] = useState<string | null>(null);
  const [pieceLines, setPieceLines] = useState<EngineLine[]>([]);
  const [banner, setBanner] = useState<{ text: string; eco?: string; n: number }>();
  const [autoplay, setAutoplay] = useState(false);
  const [speed] = useReplaySpeed();
  const [animKey, setAnimKey] = useState(0);
  const prevPly = useRef(ply);
  // GM ghosts
  const ghostOn = settings.ghost !== false;
  const ghostIds = settings.ghostIds ?? ALL_GHOSTS;
  const ghostKey = ghostIds.join(",");
  const [ghostVer, setGhostVer] = useState(0);
  const [pinned, setPinned] = useState<GameRef>();
  const [guess, setGuess] = useState(false);
  useEffect(() => {
    if (!ghostOn) return;
    let live = true;
    (async () => {
      for (const id of ghostKey.split(",").filter(Boolean)) {
        await loadGhost(id);
        if (live) setGhostVer((n) => n + 1);
      }
    })();
    return () => {
      live = false;
    };
  }, [ghostOn, ghostKey]);

  useEffect(() => {
    if (initial) {
      setMoves(initial);
      setPly(initial.length);
    }
  }, [initial]);
  useEffect(() => save(storeKey, moves), [storeKey, moves]);

  const path = useMemo(() => replay(moves), [moves]);
  const cur = path[ply];
  const fen = cur.fen;
  const cands = useMemo(() => candidates(fen), [fen]);
  const inBook = cands.length > 0 || !!getNode(fen);

  // A hovered candidate belongs to the old position; never let it outlive a move.
  useEffect(() => setHover(undefined), [fen]);

  // Engine: full analysis of the position, or — while a piece is held — every move of that piece.
  const danger = settings.danger !== false;
  const pieceUcis = useMemo(() => {
    if (!sel) return [];
    const c = new Chess(fen);
    return c.moves({ square: sel as never, verbose: true }).filter((m) => !m.promotion || m.promotion === "q").map((m) => m.from + m.to + (m.promotion ?? ""));
  }, [fen, sel]);
  const mainKey = keyOf({ fen });
  const [evalVer, bump] = useState(0);
  const pieceKey = keyOf({ fen, searchmoves: pieceUcis });
  // When the engine is idle, quietly review earlier positions so every move gets a verdict.
  const reviewRef = useRef({ path: [] as { fen: string }[], sel: null as string | null, on: true });
  const reviewNext = () => {
    const r = reviewRef.current;
    if (r.sel || !r.on) return;
    const todo = r.path.find((p) => (engine.cached(p.fen)?.[0]?.depth ?? 0) < 10 && !new Chess(p.fen).isGameOver());
    if (todo) engine.analyze({ fen: todo.fen, depth: 12 });
  };
  useEffect(
    () =>
      engine.subscribe((k, l, done) => {
        if (k === mainKey) setLines(l);
        else if (k === pieceKey) setPieceLines(l);
        if (done) bump((n) => n + 1); // a search finished: verdicts of past moves may have changed
        if (!done || k === pieceKey) return;
        reviewNext();
      }),
    [mainKey, pieceKey],
  );
  useEffect(() => {
    setLines(engine.cached(fen) ?? []);
  }, [fen]);
  useEffect(() => {
    setPieceLines([]);
    const c = new Chess(fen);
    if (!settings.engine) {
      engine.stop();
      return;
    }
    if (c.isGameOver()) {
      engine.stop();
      setTimeout(reviewNext, 0); // nothing to analyse here: review the moves that led to it
      return;
    }
    if (sel && pieceUcis.length) engine.analyze({ fen, searchmoves: pieceUcis, multipv: pieceUcis.length, depth: pieceUcis.length > 10 ? 11 : 13 });
    else engine.analyze({ fen });
  }, [fen, sel, pieceUcis, settings.engine]);

  // Opening banner when a new 型 is reached
  useEffect(() => {
    if (ply > prevPly.current && ply > 0) {
      const a = getNode(path[ply].fen) ? openingOf(path[ply].fen) : undefined;
      const b = getNode(path[ply - 1].fen) ? openingOf(path[ply - 1].fen) : undefined;
      if (a && a.key !== b?.key && a.depth > 0) setBanner({ text: a.info!.name!, eco: a.info!.eco, n: Date.now() });
    }
    prevPly.current = ply;
  }, [ply, path]);
  useEffect(() => {
    if (!banner) return;
    const t = setTimeout(() => setBanner(undefined), 2600);
    return () => clearTimeout(t);
  }, [banner]);

  const playSound = (san: string) => (san.includes("+") ? sfx.check() : san.includes("x") ? sfx.capture() : sfx.move());

  const pushSan = useCallback(
    (san: string, fromPly: number) => {
      setMoves((ms) => {
        const base = ms.slice(0, fromPly);
        if (ms[fromPly] === san) return ms;
        return [...base, san];
      });
      setPly(fromPly + 1);
      setAnimKey((k) => k + 1);
      playSound(san);
    },
    [],
  );

  const onMove = (from: string, to: string, promotion?: string) => {
    setAutoplay(false);
    const c = new Chess(fen);
    const mv = c.move({ from, to, promotion });
    if (selfPlay) art.move(fen, c.fen(), { from, to, promotion }, mv.color, hidden);
    pushSan(mv.san, ply);
  };

  const jump = (i: number) => {
    setAutoplay(false);
    const n = Math.max(0, Math.min(moves.length, i));
    if (n === ply + 1) {
      setAnimKey((k) => k + 1);
      playSound(moves[ply]);
    }
    setPly(n);
  };

  // Ghosts: what the selected masters played here, or — when following one game — its next move.
  const turn = fen.split(" ")[1] as "w" | "b";
  const fens = useMemo(() => path.map((p) => p.fen), [path]);
  const ghostMoves = useMemo(
    () => (ghostOn && !pinned ? aggregate(fen, hitsAt(ghostKey.split(",").filter(Boolean), fens, ply)) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ghostOn, pinned, fen, fens, ply, ghostKey, ghostVer],
  );
  const follow: Follow | undefined = useMemo(() => {
    const info = pinned && gameInfo(pinned);
    if (!pinned || !info) return undefined;
    const gp = plyInGame(pinned, fen);
    let lastCompare: Follow["lastCompare"];
    if (ply > 0 && cur.san) {
      const pp = plyInGame(pinned, path[ply - 1].fen);
      const gmSan = pp === undefined ? undefined : info.moves[pp];
      if (gmSan && path[ply - 1].fen.split(" ")[1] === info.gmColor) lastCompare = { same: gmSan === cur.san, gmSan, mySan: cur.san };
    }
    return { info, ply: gp, nextSan: gp === undefined ? undefined : info.moves[gp], lastCompare };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pinned, fen, ply, path, ghostVer]);
  const followNext = follow?.nextSan;
  const followColor = follow?.info.gmColor;
  // Following a game: the opponent's replies play themselves, you play the master's side.
  useEffect(() => {
    if (!followNext || ply !== moves.length || turn === followColor) return;
    const t = setTimeout(() => pushSan(followNext, ply), speed);
    return () => clearTimeout(t);
  }, [followNext, followColor, ply, moves.length, turn, pushSan, speed]);
  const hideHints = !!follow && guess && turn === followColor && follow.ply !== undefined;

  // Auto-replay. With a module (a named opening) attached it plays the way to that opening and stops there;
  // without one it follows the most played move.
  const moduleKey = selfPlay ? "dojo.self.module" : "dojo.explore.module";
  const [moduleName, setModuleName] = useState<string>(() => load(moduleKey, ""));
  const module = MODULES.find((m) => m.name === moduleName);
  const played = moves.slice(0, ply);
  const onWay = !!module && ply < module.path.length && played.every((m, i) => module.path[i] === m);
  const arrived = !!module && ply >= module.path.length && module.path.every((m, i) => played[i] === m);
  const offWay = !!module && !onWay && !arrived;
  const startReplay = () => {
    if (autoplay) return setAutoplay(false);
    if (offWay) {
      setMoves([]);
      setPly(0);
      art.reset();
    }
    setAutoplay(true);
  };
  useEffect(() => {
    if (!autoplay) return;
    if (module && arrived && ply === module.path.length) {
      setAutoplay(false); // the opening is on the board: over to the player
      return;
    }
    const next = onWay ? { san: module!.path[ply] } : mainContinuation(fen, 1)[0];
    if (!next) {
      setAutoplay(false);
      return;
    }
    const t = setTimeout(() => pushSan(next.san, ply), speed);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, fen, ply, pushSan, speed, moduleName]);

  // Keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") jump(ply - 1);
      else if (e.key === "ArrowRight") jump(ply + 1);
      else if (e.key === "ArrowUp" || e.key === "Home") jump(0);
      else if (e.key === "ArrowDown" || e.key === "End") jump(moves.length);
      else if (e.key === "f") setOrientation((o) => (o === "w" ? "b" : "w"));
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  reviewRef.current = { path, sel, on: settings.engine };

  // Board decorations
  // Full display by default; "表示：シンプル" cuts it to the top 3 squares, one arrow and one ghost.
  const dense = settings.dense !== false;
  let marks = settings.marks ? bookMarks(dense ? cands : cands.slice(0, 3)) : [];
  let arrows = settings.arrows ? bookArrows(cands, dense ? 3 : 1) : [];
  if (!cands.length && settings.engine && lines.length) {
    const e = engineMarksArrows(fen, lines);
    if (settings.marks) marks = e.marks;
    if (settings.arrows) arrows = e.arrows.slice(0, dense ? 3 : 1);
  }
  // Holding a piece: grade every square it can reach (replaces its book/engine marks).
  if (hideHints) {
    marks = [];
    arrows = [];
  }
  let graded: Graded[] = [];
  if (sel && !hideHints && !hidden) {
    const bookSans = new Set(cands.map((c) => c.san));
    graded = gradePiece(fen, sel, pieceLines, bookSans);
    const pm = gradedMarks(fen, graded, danger);
    const covered = new Set(pm.map((m) => m.from + m.sq));
    marks = [...marks.filter((m) => !covered.has(m.from + m.sq)), ...pm];
  }

  // Verdict on the move just played (book moves are never blunders).
  // Past moves only change when a search finishes (evalVer); the current move also follows the live analysis.
  const pastReviews = useMemo(
    () => path.map((p, i) => (i === 0 || !p.from ? undefined : reviewMove(path[i - 1].fen, p.fen, { from: p.from, to: p.to! }, !!p.book))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [path, evalVer],
  );
  const review = ply > 0 && cur.from ? reviewMove(path[ply - 1].fen, fen, { from: cur.from, to: cur.to! }, !!cur.book, lines) : undefined;
  const reviews = pastReviews.map((r, i) => (i === ply ? review : r));
  const explanation = ply > 0 && cur.from ? explainReview(path[ply - 1].fen, review, { from: cur.from, to: cur.to! }) : undefined;
  const bestArrow = settings.engine && !hidden ? bestMoveArrow(review) : undefined;
  // Self play: a sacrifice the engine approves of (!!) scores once the analysis arrives; the game ends on mate/draw.
  const brilliantPlies = selfPlay ? reviews.map((r, k) => (r?.verdict === "brilliant" ? k : -1)).filter((k) => k > 0).join(",") : "";
  useEffect(() => {
    for (const k of brilliantPlies.split(",").filter(Boolean)) {
      const p = path[+k];
      if (p?.from) art.brilliant(+k % 2 ? "w" : "b", hidden, path[+k - 1].fen, { from: p.from, to: p.to! });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [brilliantPlies]);
  const endPos = useMemo(() => new Chess(path[path.length - 1].fen), [path]);
  const result = !selfPlay || !endPos.isGameOver() ? undefined : endPos.isCheckmate() ? `${endPos.turn() === "w" ? "黒" : "白"}の勝ち（チェックメイト）` : "引き分け";
  useEffect(() => {
    if (result) art.finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  if (bestArrow) arrows = [...arrows, bestArrow];

  let badge: { sq: string; kind: BadgeKind } | undefined;
  if (ply > 0 && cur.to) {
    const prev = candidates(path[ply - 1].fen);
    const hit = prev.find((c) => c.san === cur.san);
    if (hidden) badge = undefined;
    else if (hit) badge = { sq: cur.to, kind: hit.rank === 0 ? "best" : hit.share >= 0.15 ? "good" : "book" };
    else if (review && review.verdict !== "book") badge = { sq: cur.to, kind: review.verdict };
  }
  let ghosts: Ghost[] = [];
  if (ghostOn && follow) {
    if (follow.nextSan && !hideHints) {
      try {
        const mv = new Chess(fen).move(follow.nextSan);
        ghosts = [{ from: mv.from, to: mv.to, piece: mv.color + mv.piece.toUpperCase(), label: turn === follow.info.gmColor ? jaName(follow.info.player) : follow.info.opponent, alpha: 0.42 }];
      } catch {
        /* data mismatch: no ghost */
      }
    }
  } else if (ghostOn) {
    ghosts = ghostMoves.slice(0, dense ? 3 : 1).map((m, i) => ({
      from: m.from, to: m.to, piece: m.piece, alpha: i === 0 ? 0.4 : 0.26,
      // on a phone the squares are narrow: just the number of games (names are in the panel below)
      label: PHONE ? `×${m.n}` : m.players.length === 1 ? `${jaName(m.players[0].id)}${m.n > 1 ? ` ×${m.n}` : ""}` : `${m.players.length}人 ×${m.n}`,
    }));
  }
  if (settings.arrows && (dense || follow)) arrows = [...arrows, ...ghosts.map((g) => ({ from: g.from, to: g.to, color: "#dbe9ff", width: 7, opacity: 0.9, dash: true }))];
  const pinGame = (ref: GameRef, fromStart?: boolean) => {
    const info = gameInfo(ref);
    if (!info) return;
    setAutoplay(false);
    setPinned(ref);
    setOrientation(info.gmColor);
    if (fromStart) {
      setMoves([]);
      setPly(0);
    }
  };
  const ghostCard = ghostOn && (
    <GhostCard
      dense={dense}
      ids={ghostIds}
      setIds={(ids) => setSettings({ ...settings, ghostIds: ids })}
      moves={ghostMoves}
      turn={turn}
      ply={ply}
      follow={follow}
      guess={guess}
      setGuess={setGuess}
      onPin={pinGame}
      onUnpin={() => setPinned(undefined)}
      onPlay={(san) => pushSan(san, ply)}
      onReplaceLast={(san) => pushSan(san, ply - 1)}
      onBackToGame={() => {
        for (let i = ply; i >= 0; i--) if (pinned && plyInGame(pinned, path[i].fen) !== undefined) return jump(i);
      }}
      onRestart={() => {
        setMoves([]);
        setPly(0);
      }}
      onHover={setHover}
    />
  );

  const rings = danger && !sel && !hideHints ? (() => {
    const h = hangingPieces(fen);
    return [...h.mine.map((sq) => ({ sq, kind: "mine" as const })), ...h.theirs.map((sq) => ({ sq, kind: "theirs" as const }))];
  })() : [];

  const toggle = (k: keyof Settings) => setSettings({ ...settings, [k]: !settings[k] });

  return (
    <div className="play-layout">
      <div className="board-col">
        {settings.engine && !hidden && <EvalBar line={lines[0]} orientation={orientation} />}
        <div className="board-stack">
          <Board
            fen={fen}
            orientation={orientation}
            lastMove={cur.from ? { from: cur.from, to: cur.to! } : undefined}
            movable="both"
            onMove={onMove}
            marks={marks}
            arrows={arrows}
            showMarks
            focusFrom={hover}
            onSelect={setSel}
            rings={rings}
            ghosts={ghosts}
            glow={dense}
            badge={badge}
            animKey={animKey}
            banner={art.toast ? <ArtToast art={art} /> : !hidden && banner && (
              <div key={banner.n} className="banner">
                {banner.eco && <span className="eco">{banner.eco}</span>}
                <span>{banner.text}</span>
              </div>
            )}
          />
          <div className="legend">
            {selfPlay && (
              <button className={`chip ${assistOn ? "on" : ""}`} onClick={() => { save("dojo.self.assistOn", !assistOn); setAssistOn(!assistOn); }} title="補助をまとめて ON/OFF。OFF の間だけ芸術点が入ります">
                補助：{assistOn ? "ON" : "OFF"}
              </button>
            )}
            {hidden && <span className="muted small">補助なし。採点は裏で続けているので、ON に戻すと全部の手の判定が出ます。</span>}
            {!hidden && <>
            <button className={`chip ${dense ? "on" : ""}`} onClick={() => setSettings({ ...settings, dense: !dense })} title="シンプル：有力な 3 マスと矢印 1 本だけ／詳しく：全候補・全矢印・ゴースト 3 体">{dense ? "表示：詳しく" : "表示：シンプル"}</button>
            <button className={`chip ${settings.marks ? "on" : ""}`} onClick={() => toggle("marks")}>マス着色</button>
            <button className={`chip ${settings.arrows ? "on" : ""}`} onClick={() => toggle("arrows")}>矢印</button>
            <button className={`chip ${settings.engine ? "on" : ""}`} onClick={() => toggle("engine")}>エンジン</button>
            <button className={`chip ${danger ? "on" : ""}`} onClick={() => setSettings({ ...settings, danger: !danger })}>ブランダー警告</button>
            <button className={`chip ${ghostOn ? "on" : ""}`} onClick={() => setSettings({ ...settings, ghost: !ghostOn })}>👻 ゴースト</button>
            <button className={`chip ${settings.sound ? "on" : ""}`} onClick={() => toggle("sound")}>効果音</button>
            {onSpar && <button className="chip" onClick={() => onSpar(fen)} title="いまの局面を「局面練習」に送り、エンジン相手に指す">🥊 この局面を練習</button>}
            <span className="legend-sep" />
            <span><i className="lg lg-main" />主線</span>
            <span><i className="lg lg-strong" />有力</span>
            <span><i className="lg lg-ok" />定跡</span>
            <span><i className="lg lg-rare" />まれ</span>
            {!inBook && settings.engine && <span><i className="lg lg-engine" />エンジン推奨</span>}
            </>}
          </div>
          <div className="legend-note" style={hidden ? { display: "none" } : undefined}>
            {hideHints ? (
              <>🙈 当てるモード：{jaName(follow!.info.player)}ならどう指すか、盤上で指してください。</>
            ) : sel ? (
              <>選んだ駒の行き先を採点中：<span className="v v-brilliant">!! 妙手</span><span className="v v-best">★最善</span><span className="v v-inaccuracy">?! 疑問手</span><span className="v v-mistake">? 悪手</span><span className="v v-blunder">?? ブランダー</span>　色で採点（数値と理由は右パネル）。</>
            ) : cands.length > 0 ? (
              <><b>%</b> = この局面で強い人がその手を指す割合{ghosts.length > 0 && <>　👻 = GM が実戦で指した手</>}</>
            ) : settings.engine ? (
              <><b>+0.3</b> などはエンジン評価（手番側から見て <span className="tone-pos">＋有利</span>／<span className="tone-neg">−不利</span>、1.0 ≒ ポーン 1 枚）{ghosts.length > 0 && <>　👻 = GM が実戦で指した手</>}</>
            ) : (
              <>定跡を外れました。エンジンを ON にすると推奨手と評価値を表示します。</>
            )}
          </div>
        </div>
      </div>

      <aside className="panel">
        <div className="panel-scroll">
          {selfPlay && (
            <div className="card">
              <div className="drill-head">
                <b>👥 セルフ対局</b>
                <span className="muted small">白も黒も自分で指す ・ {ply % 2 === 0 ? "白" : "黒"}の番</span>
              </div>
              {result && <div className="fb-title" style={{ marginTop: 6, color: "#f6d488" }}>{result}</div>}
              <div className="muted small" style={{ marginTop: 4 }}>補助は盤の下でまとめて、または個別に ON/OFF できます。新しい対局は右下の ⟲。</div>
            </div>
          )}
          {selfPlay && <ArtCard art={art} assistOn={assistOn} both />}
          {follow && ghostCard}
          {sel && !hideHints && !hidden && <PieceCard fen={fen} graded={graded} onPlay={(san) => pushSan(san, ply)} onHover={setHover} />}
          {!hidden && <VerdictCard review={review} san={cur.san} ply={ply} ex={explanation} />}
          {!hidden && <OpeningCard path={path} ply={ply} />}
          {!follow && ghostCard}
          {!hidden && <LineTimeline
            path={path}
            ply={ply}
            onJump={(p, extra) => {
              if (extra) {
                setMoves([...moves.slice(0, ply), ...extra]);
                setPly(ply + extra.length);
                setAnimKey((k) => k + 1);
              } else jump(p);
            }}
          />}
          {!hidden && <CandidateList fen={fen} onPlay={(san) => pushSan(san, ply)} onHover={setHover} />}
          <EnginePanel fen={fen} lines={lines} on={settings.engine && !hidden} />
        </div>
        <div className="panel-bottom">
          <MoveList path={path} ply={ply} onJump={jump} verdicts={hidden ? undefined : reviews.map((r) => r?.verdict)} plain={hidden} />
          <div className="controls">
            <button title="最初へ (↑)" onClick={() => jump(0)}>⏮</button>
            <button title="1 手戻る (←)" onClick={() => jump(ply - 1)}>◀</button>
            <button className={`primary ${autoplay ? "on" : ""}`} onClick={startReplay} disabled={!autoplay && (module ? arrived && !cands.length : hidden || !cands.length)}>
              {autoplay ? "■ 停止" : !module ? "▶ 主線再生" : offWay ? "▶ 型を最初から" : arrived ? "▶ 続きを再生" : "▶ 型まで再生"}
            </button>
            <button title="1 手進む (→)" onClick={() => jump(ply + 1)}>▶</button>
            <button title="最後へ (↓)" onClick={() => jump(moves.length)}>⏭</button>
            <button title="盤を反転 (F)" onClick={() => setOrientation((o) => (o === "w" ? "b" : "w"))}>⇅</button>
            <button title={selfPlay ? "新しい対局" : "リセット"} onClick={() => { setMoves([]); setPly(0); setAutoplay(false); art.reset(); }}>⟲</button>
          </div>
          <div className="replay-module">
            <span className="muted small">再生する型</span>
            <select value={moduleName} onChange={(e) => { setModuleName(e.target.value); save(moduleKey, e.target.value); setAutoplay(false); }}>
              <option value="">なし（いちばん多く指される手）</option>
              {MODULE_GROUPS.map((g) => (
                <optgroup key={g} label={g}>
                  {MODULES.filter((m) => m.family === g).map((m) => <option key={m.name} value={m.name}>{m.name}</option>)}
                </optgroup>
              ))}
            </select>
            {module && <button className="chip" onClick={() => { setModuleName(""); save(moduleKey, ""); setAutoplay(false); }}>外す</button>}
          </div>
          {module && (
            <div className="replay-module-note muted small">
              {arrived ? `「${module.name}」の形です。ここから自分で指せます。` : offWay ? `いまの手順は「${module.name}」から外れています。再生すると最初からやり直します。` : `「${module.name}」まで ${module.path.length - ply} 手：${module.path.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(" ")}`}
            </div>
          )}
          {(autoplay || follow) && <div className="controls-speed"><SpeedSlider compact /></div>}
        </div>
      </aside>
    </div>
  );
}
