import { Chess } from "chess.js";
import { Fragment } from "react";
import { candidates, getNode, mainContinuation, nearestWith, NODES, openingChain, openingOf, type BookNode, type Candidate } from "../lib/tree";
import { evalText, whiteShare, type EngineLine } from "../lib/engine";
import { isBad, povEval, type Graded, type MoveReview } from "../lib/review";
import { explainMove, KIND_LABEL, type Explanation } from "../lib/explain";
import { VERDICT_LABEL, type Verdict } from "../lib/tactics";
import type { Arrow, SquareMark, MarkKind } from "./Board";

export interface Pos {
  fen: string;
  san?: string; // move that led here
  from?: string;
  to?: string;
  book?: boolean;
}

export function replay(moves: string[]): Pos[] {
  const c = new Chess();
  const out: Pos[] = [{ fen: c.fen() }];
  for (const m of moves) {
    const before = c.fen();
    const mv = c.move(m);
    out.push({ fen: c.fen(), san: mv.san, from: mv.from, to: mv.to, book: !!getNode(before)?.children.some((e) => e.san === mv.san) && !!getNode(c.fen()) });
  }
  return out;
}

/** Last position along the path that is still inside the book. */
export function lastBookIndex(path: Pos[], upto: number) {
  for (let i = upto; i >= 0; i--) if (getNode(path[i].fen)) return i;
  return 0;
}

export const kindOf = (c: Candidate): MarkKind => (c.rank === 0 ? "main" : c.share >= 0.22 ? "strong" : c.share >= 0.08 ? "ok" : "rare");

export function bookMarks(cands: Candidate[]): SquareMark[] {
  return cands.map((c) => ({ sq: c.to, from: c.from, kind: kindOf(c), share: c.share, label: `${Math.round(c.share * 100)}%` }));
}

export function bookArrows(cands: Candidate[], max = 3): Arrow[] {
  return cands.slice(0, max).filter((c, i) => i === 0 || c.share >= 0.08).map((c, i) => ({
    from: c.from,
    to: c.to,
    color: i === 0 ? "#ff541c" : "#ffb030",
    width: 9 + 16 * c.share,
    opacity: i === 0 ? 0.9 : 0.45 + 0.6 * c.share,
  }));
}

export function engineMarksArrows(fen: string, lines: EngineLine[]): { marks: SquareMark[]; arrows: Arrow[] } {
  const marks: SquareMark[] = [];
  const arrows: Arrow[] = [];
  const best = lines[0];
  lines.slice(0, 3).forEach((l, i) => {
    const uci = l.pv[0];
    if (!uci) return;
    const from = uci.slice(0, 2), to = uci.slice(2, 4);
    // how close to the best move (in pawns) → intensity
    const gap = best && l.cp !== undefined && best.cp !== undefined ? Math.abs(best.cp - l.cp) / 100 : i * 0.5;
    const share = Math.max(0.15, 0.9 - gap * 0.8 - i * 0.1);
    const e = povEval(l, fen.split(" ")[1] as "w" | "b");
    marks.push({ sq: to, from, kind: "engine", share, label: e.text, tone: e.tone });
    arrows.push({ from, to, color: "#4f8ef7", width: i === 0 ? 16 : 10, opacity: i === 0 ? 0.85 : 0.45 });
  });
  return { marks, arrows };
}

function nameAhead(n: BookNode | undefined): { name: string; direct: boolean } | undefined {
  if (!n) return;
  if (n.info?.name) return { name: n.info.name, direct: true };
  const cont = mainContinuation(n.fen, 4);
  for (const c of cont) {
    const nn = getNode(c.fen);
    if (nn?.info?.name) return { name: nn.info.name, direct: false };
  }
}

const GM_ICON: Record<string, string> = {
  "ボビー・フィッシャー": "🇺🇸", "ガルリ・カスパロフ": "🇷🇺", "マグヌス・カールセン": "🇳🇴", "ポール・モーフィー": "🇺🇸",
  "ホセ・ラウル・カパブランカ": "🇨🇺", "アナトリー・カルポフ": "🇷🇺", "ウラジーミル・クラムニク": "🇷🇺", "ミハイル・タリ": "🇱🇻",
  "ミハイル・ボトヴィニク": "🇷🇺", "ボリス・スパスキー": "🇷🇺", "ティグラン・ペトロシアン": "🇦🇲", "アロン・ニムゾヴィッチ": "🇩🇰",
  "エマヌエル・ラスカー": "🇩🇪", "アレクサンドル・アレヒン": "🇫🇷", "ヴィスワナタン・アナンド": "🇮🇳", "ファビアーノ・カルアナ": "🇺🇸",
  "リヒャルト・レティ": "🇨🇿", "ヴァシリー・スミスロフ": "🇷🇺", "ヴィクトル・コルチノイ": "🇨🇭",
};

export function GmChips({ names }: { names?: string[] }) {
  if (!names?.length) return null;
  return (
    <div className="gm-chips">
      {names.map((g) => (
        <span key={g} className="gm-chip">{GM_ICON[g] ?? "♟"} {g}</span>
      ))}
    </div>
  );
}

/** Header card: the 型 you're in right now. */
export function OpeningCard({ path, ply }: { path: Pos[]; ply: number }) {
  const bi = lastBookIndex(path, ply);
  const outOfBook = bi < ply;
  const op = openingOf(path[bi].fen);
  const node = getNode(path[bi].fen);
  const info = op?.info;
  const gmNode = nearestWith(node, "gm");
  const idea = ply > 0 && !outOfBook ? getNode(path[ply].fen)?.info?.idea : undefined;
  const lastSan = path[ply].san;
  const moveNo = ply > 0 ? `${Math.ceil(ply / 2)}${ply % 2 ? "." : "…"}` : "";
  return (
    <div className="card opening-card">
      <div className="op-top">
        {info?.eco && <span className="eco">{info.eco}</span>}
        <span className={`book-state ${outOfBook ? "out" : "in"}`}>{outOfBook ? "定跡外" : ply === 0 ? "開始" : "定跡内"}</span>
      </div>
      <h2 className="op-name">{info?.name ?? "初期局面"}</h2>
      {info?.en && <div className="op-en">{info.en}</div>}
      {op && op.depth > 0 && (
        <div className="crumbs">
          {openingChain(op).map((n, i, a) => (
            <Fragment key={n.key}>
              <span className={i === a.length - 1 ? "crumb cur" : "crumb"}>{n.info!.name}</span>
              {i < a.length - 1 && <span className="crumb-sep">›</span>}
            </Fragment>
          ))}
        </div>
      )}
      {idea && (
        <div className="idea">
          <span className="idea-move">{moveNo}{lastSan}</span>
          <span>{idea}</span>
        </div>
      )}
      {outOfBook && (
        <div className="idea out">
          <span className="idea-move">{moveNo}{lastSan}</span>
          <span>ここで定跡（このアプリの手順集）から外れました。最後の定跡局面は {Math.ceil(bi / 2) || 0} 手目。下のエンジン候補を参考に。</span>
        </div>
      )}
      <GmChips names={gmNode?.info?.gm} />
    </div>
  );
}

/** The 線: how the opening identity evolved, plus where the main line is heading. */
export function LineTimeline({ path, ply, onJump }: { path: Pos[]; ply: number; onJump: (ply: number, extra?: string[]) => void }) {
  const steps: { ply: number; name: string; san: string; future?: boolean; extra?: string[] }[] = [];
  let prev: string | undefined;
  for (let i = 1; i <= ply; i++) {
    const op = getNode(path[i].fen) ? openingOf(path[i].fen) : undefined;
    if (op && op.key !== prev && op.depth > 0) {
      steps.push({ ply: i, name: op.info!.name!, san: `${Math.ceil(i / 2)}${i % 2 ? "." : "…"}${path[i].san}` });
      prev = op.key;
    }
  }
  // Look ahead along the main line for upcoming 型
  const cont = mainContinuation(path[ply].fen, 14);
  const extra: string[] = [];
  let lastName = prev;
  for (let j = 0; j < cont.length && steps.filter((s) => s.future).length < 3; j++) {
    extra.push(cont[j].san);
    const n = getNode(cont[j].fen);
    if (n?.info?.name && n.key !== lastName) {
      const pl = ply + j + 1;
      steps.push({ ply: pl, name: n.info.name, san: `${Math.ceil(pl / 2)}${pl % 2 ? "." : "…"}${cont[j].san}`, future: true, extra: [...extra] });
      lastName = n.key;
    }
  }
  if (!steps.length) return null;
  return (
    <div className="card">
      <div className="card-title">型の線 <span className="muted">— 点ではなく、流れで覚える</span></div>
      <ol className="timeline">
        {steps.map((s, i) => (
          <li key={i} className={s.future ? "future" : s.ply === steps.filter((x) => !x.future).at(-1)?.ply ? "current" : ""} onClick={() => onJump(s.future ? ply : s.ply, s.extra)}>
            <span className="tl-dot" />
            <span className="tl-san">{s.san}</span>
            <span className="tl-name">{s.name}</span>
            {s.future && <span className="tl-tag">この先</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function CandidateList({ fen, onPlay, onHover }: { fen: string; onPlay: (san: string) => void; onHover: (k?: string) => void }) {
  const cands = candidates(fen);
  const node = getNode(fen);
  if (!node || !cands.length) return null;
  const turn = fen.split(" ")[1];
  const plans = nearestWith(node, "plans")?.info;
  return (
    <div className="card">
      <div className="card-title">次の一手 <span className="muted">— {turn === "w" ? "白" : "黒"}番・指される割合</span></div>
      <div className="cands">
        {cands.map((c) => {
          const ahead = nameAhead(c.childNode);
          return (
            <button key={c.san} className={`cand cand-${kindOf(c)}`} onClick={() => onPlay(c.san)} onMouseEnter={() => onHover(c.from + c.to)} onMouseLeave={() => onHover()}>
              <span className="cand-san">{c.san}</span>
              <span className="cand-bar"><span style={{ width: `${Math.max(3, c.share * 100)}%` }} /></span>
              <span className="cand-pct">{Math.round(c.share * 100)}%</span>
              <span className={`cand-name ${ahead?.direct ? "" : "muted"}`}>{ahead ? (ahead.direct ? ahead.name : `→ ${ahead.name}`) : ""}</span>
              {c.rank === 0 && <span className="cand-main">主線</span>}
            </button>
          );
        })}
      </div>
      {plans?.plans && (
        <div className="plans">
          <div className="plans-title">この型の狙い <span className="muted">（{plans.name}）</span></div>
          <ul>{plans.plans.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}
    </div>
  );
}

export function EnginePanel({ fen, lines, on }: { fen: string; lines: EngineLine[]; on: boolean }) {
  if (!on) return null;
  const toSan = (pv: string[]) => {
    const c = new Chess(fen);
    const out: string[] = [];
    for (const u of pv.slice(0, 7)) {
      try {
        out.push(c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] }).san);
      } catch {
        break;
      }
    }
    return out.join(" ");
  };
  return (
    <div className="card engine-card">
      <div className="card-title">エンジン <span className="muted">Stockfish 18 · 深さ {lines[0]?.depth ?? "…"} · 白から見た評価</span></div>
      {lines.length === 0 && <div className="muted small">解析中…</div>}
      {lines.map((l, i) => (
        <div key={i} className="eng-line">
          <div className="eng-top">
            <span className={`eng-eval ${(l.cp ?? (l.mate! > 0 ? 1 : -1)) >= 0 ? "pos" : "neg"}`}>{evalText(l)}</span>
            <span className="eng-pv">{toSan(l.pv)}</span>
          </div>
          {l.pv[0] && <Reasons ex={explainMove(fen, l.pv[0], l)} max={2} />}
        </div>
      ))}
    </div>
  );
}

export function EvalBar({ line, orientation }: { line?: EngineLine; orientation: "w" | "b" }) {
  const w = whiteShare(line);
  return (
    <div className={`evalbar ${orientation === "b" ? "flip" : ""}`}>
      <div className="evalbar-white" style={{ height: `${w * 100}%` }} />
      <span className={`evalbar-text ${w >= 0.5 ? "bottom" : "top"}`}>{line ? evalText(line).replace("+", "") : ""}</span>
    </div>
  );
}

/** Reason chips: 戦術/戦略/犠牲… with their horizon (短期/中長期). */
export function Reasons({ ex, max = 6 }: { ex?: Explanation; max?: number }) {
  if (!ex?.reasons.length) return null;
  return (
    <ul className="reasons">
      {ex.reasons.slice(0, max).map((r) => (
        <li key={r.text} className={`rs rs-${r.kind}`}>
          <span className="rs-kind">{KIND_LABEL[r.kind]}<i>{r.horizon}</i></span>
          <span className="rs-text">{r.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Engine line with the moment the idea pays off highlighted. */
export function PvLine({ ex, startPly }: { ex?: Explanation; startPly: number }) {
  if (!ex || ex.pvSan.length < 2) return null;
  return (
    <div className="pv">
      <span className="pv-label">読み筋</span>
      {ex.pvSan.map((m, i) => {
        const p = startPly + i;
        return (
          <span key={i} className={`pv-m ${i === 0 ? "first" : ""} ${ex.payoffIndex === i ? "payoff" : ""}`}>
            {p % 2 === 1 || i === 0 ? <span className="pv-no">{Math.ceil(p / 2)}{p % 2 ? "." : "…"}</span> : null}
            {m}
            {ex.payoffIndex === i && <span className="pv-tag">回収</span>}
          </span>
        );
      })}
    </div>
  );
}

/** "Was that a blunder?" — and why — for out-of-book moves once the engine has seen both positions. */
export function VerdictCard({ review, san, ply, ex }: { review?: MoveReview; san?: string; ply: number; ex?: Explanation }) {
  if (!review || review.verdict === "book" || !san) return null;
  const v = VERDICT_LABEL[review.verdict];
  const no = `${Math.ceil(ply / 2)}${ply % 2 ? "." : "…"}`;
  const bad = ["inaccuracy", "mistake", "blunder"].includes(review.verdict);
  const ev = (l?: EngineLine) => {
    const e = povEval(l, review.color ?? "w");
    return <span className={`tone-${e.tone}`}>{e.text}</span>;
  };
  return (
    <div className={`card verdict-card vc-${review.verdict}`}>
      <div className="vc-head">
        <span className="vc-sym" style={{ background: v.color }}>{v.sym}</span>
        <span className="vc-title">{no}{san} は{v.ja}</span>
      </div>
      {review.wpBefore !== undefined && review.wpAfter !== undefined && (
        <div className="vc-body">
          勝率 {Math.round(review.wpBefore)}% → <b>{Math.round(review.wpAfter)}%</b>
          {review.before && review.after && <span className="muted">（指した側から見た評価 {ev(review.before)} → {ev(review.after)}）</span>}
          {bad && review.bestSan && <div className="vc-bestmove">最善は <b>{review.bestSan}</b>（緑の矢印）</div>}
        </div>
      )}
      <Reasons ex={ex} />
      <PvLine ex={ex} startPly={ply} />
    </div>
  );
}

/** Holding a piece: every square it can go to, graded and explained. */
export function PieceCard({ fen, graded, onPlay, onHover }: { fen: string; graded: Graded[]; onPlay: (san: string) => void; onHover: (k?: string) => void }) {
  if (!graded.length) return null;
  const color = fen.split(" ")[1] as "w" | "b";
  const order = (g: Graded) => (g.line ? -winPctOf(g.line, color) : 1000 + (g.danger?.loss ?? 0));
  const sorted = [...graded].sort((a, b) => order(a) - order(b));
  const ply = (+fen.split(" ")[5] - 1) * 2 + (color === "w" ? 1 : 2);
  return (
    <div className="card piece-card">
      <div className="card-title">この駒の候補手 <span className="muted">— 評価は手番側から見た値（＋緑＝有利／−赤＝不利）</span></div>
      {sorted.map((g) => {
        const ex = g.line ? explainMove(fen, g.uci, g.line, isBad(g.verdict)) : undefined;
        const v = g.verdict ? VERDICT_LABEL[g.verdict] : undefined;
        const e = g.line ? povEval(g.line, color) : undefined;
        return (
          <button key={g.uci} className="pc-row" onClick={() => onPlay(g.san)} onMouseEnter={() => onHover(g.from + g.to)} onMouseLeave={() => onHover()}>
            <div className="pc-top">
              <span className="pc-san">{g.book ? "📖 " : ""}{g.san}</span>
              {v ? <span className="pc-v" style={{ background: v.color }}>{v.sym} {v.ja}</span> : g.danger ? <span className="pc-v" style={{ background: "#a82623" }}>{g.danger.mate ? "1手詰みを許す" : `-${g.danger.loss} 駒損`}</span> : <span className="pc-v muted">読み中…</span>}
              {e && <span className={`pc-eval tone-${e.tone}`}>{e.text}</span>}
            </div>
            <Reasons ex={ex} max={3} />
            {ex?.sacrifice && <PvLine ex={ex} startPly={ply} />}
          </button>
        );
      })}
    </div>
  );
}

const winPctOf = (l: EngineLine, color: "w" | "b") => {
  const v = l.mate !== undefined ? (l.mate > 0 ? 10000 : -10000) : l.cp ?? 0;
  return color === "w" ? v : -v;
};

/** `plain` = just the moves: no opening names, no book dots (for playing without assists). */
export function MoveList({ path, ply, onJump, verdicts, plain }: { path: Pos[]; ply: number; onJump: (i: number) => void; verdicts?: (Verdict | "book" | undefined)[]; plain?: boolean }) {
  const rows: React.ReactNode[] = [];
  let prevOp: string | undefined;
  for (let i = 1; i < path.length; i += 2) {
    const labels: string[] = [];
    for (const j of [i, i + 1]) {
      if (j >= path.length) continue;
      const op = getNode(path[j].fen) ? openingOf(path[j].fen) : undefined;
      if (op && op.key !== prevOp && op.depth > 0) {
        labels.push(op.info!.name!);
        prevOp = op.key;
      }
    }
    if (labels.length && !plain) rows.push(<div key={`l${i}`} className="ml-label">♞ {labels.join(" → ")}</div>);
    const cell = (j: number) =>
      j < path.length ? (
        <button className={`ml-move ${ply === j ? "cur" : ""} ${path[j].book ? "book" : ""}`} onClick={() => onJump(j)}>
          {path[j].san}
          {path[j].book && !plain && <span className="ml-book" title="定跡">●</span>}
          {(() => {
            const v = verdicts?.[j];
            if (!v || v === "book" || v === "best" || v === "good") return null;
            return <span className="ml-verdict" style={{ color: VERDICT_LABEL[v].color }} title={VERDICT_LABEL[v].ja}>{VERDICT_LABEL[v].sym}</span>;
          })()}
        </button>
      ) : (
        <span />
      );
    rows.push(
      <div key={i} className={`ml-row ${Math.floor(i / 2) % 2 ? "alt" : ""}`}>
        <span className="ml-no">{Math.ceil(i / 2)}.</span>
        {cell(i)}
        {cell(i + 1)}
      </div>,
    );
  }
  return <div className="movelist">{rows.length ? rows : <div className="muted small pad">駒を動かすと棋譜がここに並びます</div>}</div>;
}

export { NODES };
