import { Chess, type Square } from "chess.js";
import { BASE } from "../lib/asset";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type MarkKind = "main" | "strong" | "ok" | "rare" | "engine" | "v-brilliant" | "v-best" | "v-good" | "v-inaccuracy" | "v-mistake" | "v-blunder" | "danger";
export interface SquareMark {
  sq: string;
  from: string;
  kind: MarkKind;
  share: number; // 0..1 intensity
  label?: string;
  sym?: string; // verdict symbol shown before the number (e.g. "??")
  tone?: "pos" | "neg" | "zero"; // colour of the number: + green / − red
}
export interface Arrow {
  from: string;
  to: string;
  color: string;
  width: number;
  opacity: number;
  dash?: boolean; // ghost moves are drawn dashed
}
/** A translucent piece on the square a past master moved to. */
export interface Ghost {
  from: string;
  to: string;
  piece: string; // "wN"
  label: string;
  alpha: number;
}
export type BadgeKind = "brilliant" | "best" | "book" | "out" | "wrong" | "good" | "inaccuracy" | "mistake" | "blunder";

interface Props {
  fen: string;
  orientation: "w" | "b";
  lastMove?: { from: string; to: string };
  movable: "w" | "b" | "both" | "none";
  onMove: (from: string, to: string, promotion?: string) => void;
  marks?: SquareMark[];
  arrows?: Arrow[];
  showMarks?: boolean;
  badge?: { sq: string; kind: BadgeKind };
  flash?: { sq: string; n: number };
  animKey?: number;
  animate?: boolean;
  banner?: ReactNode;
  focusFrom?: string; // highlight one candidate (hover from panel)
  onSelect?: (sq: string | null) => void;
  rings?: { sq: string; kind: "mine" | "theirs" }[]; // hanging pieces
  ghosts?: Ghost[];
  glow?: boolean; // outline the pieces that have a marked move (off = calmer board)
}

const FILES = "abcdefgh";
const sqName = (f: number, r: number) => `${FILES[f]}${r + 1}`;
const sqXY = (sq: string) => ({ f: FILES.indexOf(sq[0]), r: +sq[1] - 1 });

const BADGE: Record<BadgeKind, { bg: string; icon: ReactNode; title: string }> = {
  brilliant: { bg: "#1baca6", icon: "!!", title: "妙手" },
  best: { bg: "#81b64c", icon: "★", title: "主線" },
  good: { bg: "#95b776", icon: "✓", title: "有力" },
  book: { bg: "#a88865", icon: <BookIcon />, title: "定跡" },
  out: { bg: "#7a7672", icon: "?", title: "定跡外" },
  wrong: { bg: "#ca3431", icon: "✕", title: "不正解" },
  inaccuracy: { bg: "#f7c631", icon: "?!", title: "疑問手" },
  mistake: { bg: "#e58f2a", icon: "?", title: "悪手" },
  blunder: { bg: "#ca3431", icon: "??", title: "ブランダー" },
};

function BookIcon() {
  return (
    <svg viewBox="0 0 24 24" width="62%" height="62%" fill="#fff">
      <path d="M4 5.5C4 4.1 5.1 3 6.5 3H11v16H6.5c-.9 0-1.7.3-2.5.8V5.5zm16 0C20 4.1 18.9 3 17.5 3H13v16h4.5c.9 0 1.7.3 2.5.8V5.5z" />
    </svg>
  );
}

export default function Board(p: Props) {
  const chess = useMemo(() => new Chess(p.fen), [p.fen]);
  const turn = chess.turn();
  const [selected, setSelected] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ from: string; piece: string; x: number; y: number } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const draggedRef = useRef(false);

  useEffect(() => setSelected(null), [p.fen]);
  const onSelect = p.onSelect;
  useEffect(() => onSelect?.(selected), [selected, onSelect]);

  const canMove = (color: string) => p.movable === "both" ? color === turn : p.movable === color && color === turn;

  const targets = useMemo(() => {
    if (!selected) return new Map<string, boolean>();
    const m = new Map<string, boolean>();
    for (const mv of chess.moves({ square: selected as Square, verbose: true })) m.set(mv.to, !!mv.captured);
    return m;
  }, [selected, chess]);

  const checkSq = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (const row of chess.board()) for (const c of row) if (c && c.type === "k" && c.color === turn) return c.square;
    return null;
  }, [chess, turn]);

  const squareFromPoint = (x: number, y: number) => {
    const el = boardRef.current;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const fx = Math.floor(((x - r.left) / r.width) * 8);
    const fy = Math.floor(((y - r.top) / r.height) * 8);
    if (fx < 0 || fx > 7 || fy < 0 || fy > 7) return null;
    return p.orientation === "w" ? sqName(fx, 7 - fy) : sqName(7 - fx, fy);
  };

  // A pawn reaching the last rank: ask which piece it becomes (queen first).
  const [promo, setPromo] = useState<{ from: string; to: string; color: string } | null>(null);
  useEffect(() => setPromo(null), [p.fen]);
  const tryMove = (from: string, to: string) => {
    const mv = chess.moves({ square: from as Square, verbose: true }).find((m) => m.to === to);
    if (!mv) return false;
    if (mv.promotion) setPromo({ from, to, color: mv.color });
    else p.onMove(from, to, undefined);
    setSelected(null);
    return true;
  };

  // Latest props/state for the window listeners attached during a drag.
  const live = useRef({ tryMove, squareFromPoint });
  live.current = { tryMove, squareFromPoint };
  const detach = useRef<() => void>();
  useEffect(() => () => detach.current?.(), []);

  const onDown = (e: React.PointerEvent, sq: string) => {
    if (e.button !== 0) return;
    detach.current?.();
    setDrag(null);
    const piece = chess.get(sq as Square);
    if (selected && targets.has(sq)) {
      tryMove(selected, sq);
      return;
    }
    if (!piece || !canMove(piece.color)) {
      setSelected(null);
      return;
    }
    // Tapping the piece that is already selected lets go of it (decided on release, so it can still be dragged).
    const wasSelected = selected === sq;
    setSelected(sq);
    draggedRef.current = false;
    const from = sq;
    setDrag({ from, piece: piece.color + piece.type.toUpperCase(), x: e.clientX, y: e.clientY });
    // Attach synchronously so even an instant release is seen exactly once.
    const move = (ev: PointerEvent) => {
      draggedRef.current = true;
      setDrag((d) => (d ? { ...d, x: ev.clientX, y: ev.clientY } : d));
    };
    const up = (ev: PointerEvent) => {
      off();
      setDrag(null);
      const to = live.current.squareFromPoint(ev.clientX, ev.clientY);
      if (to && to !== from) live.current.tryMove(from, to);
      else if (wasSelected && to === from && !draggedRef.current) setSelected(null); // a tap, not a drag put back
    };
    const off = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      detach.current = undefined;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    detach.current = off;
  };

  // Marks never disappear: the selected piece (or the hovered candidate) is emphasised,
  // everything else stays visible but dimmed so moves can still be compared.
  const focus = selected
    ? (m: { from: string }) => m.from === selected
    : p.focusFrom
      ? (m: { from: string; sq?: string; to?: string }) => `${m.from}${m.sq ?? m.to}` === p.focusFrom
      : undefined;
  const visibleMarks = p.showMarks || focus ? p.marks ?? [] : [];
  const markAt = new Map<string, SquareMark & { dim: boolean }>();
  for (const m of visibleMarks) {
    const dim = !!focus && !focus(m);
    const prev = markAt.get(m.sq);
    // On a shared square (e.g. Nc3 and c3) prefer the focused move, then the more popular one.
    if (!prev || (prev.dim && !dim) || (prev.dim === dim && prev.share < m.share)) markAt.set(m.sq, { ...m, dim });
  }
  const ghostAt = new Map<string, Ghost & { dim: boolean }>();
  for (const g of p.ghosts ?? []) if (!ghostAt.has(g.to)) ghostAt.set(g.to, { ...g, dim: !!focus && !focus(g) });
  const sourceGlow = new Map<string, number>();
  if (!selected && p.glow !== false) for (const m of visibleMarks) if (!focus || focus(m)) sourceGlow.set(m.from, Math.max(sourceGlow.get(m.from) ?? 0, m.share));

  const squares: ReactNode[] = [];
  const board = chess.board();
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const f = p.orientation === "w" ? col : 7 - col;
      const r = p.orientation === "w" ? 7 - row : row;
      const sq = sqName(f, r);
      const light = (f + r) % 2 === 1;
      const piece = board[7 - r][f];
      const isLast = p.lastMove && (p.lastMove.from === sq || p.lastMove.to === sq);
      const mark = markAt.get(sq);
      const ghost = ghostAt.get(sq);
      const ring = !selected ? p.rings?.find((x) => x.sq === sq)?.kind : undefined;
      const target = targets.get(sq);
      const isDragFrom = drag && drag.from === sq && draggedRef.current;
      const animating = p.animate !== false && p.lastMove?.to === sq && piece;
      let style: React.CSSProperties | undefined;
      if (animating && p.lastMove) {
        const a = sqXY(p.lastMove.from), b = sqXY(p.lastMove.to);
        const s = p.orientation === "w" ? 1 : -1;
        style = { ["--dx" as string]: `${(a.f - b.f) * 100 * s}%`, ["--dy" as string]: `${(b.r - a.r) * 100 * s}%` };
      }
      squares.push(
        <div
          key={sq}
          className={`sq ${light ? "light" : "dark"}`}
          onPointerDown={(e) => onDown(e, sq)}
          data-sq={sq}
        >
          {isLast && <div className="hl-last" />}
          {selected === sq && <div className="hl-sel" />}
          {checkSq === sq && <div className="hl-check" />}
          {ring && <div className={`ring ring-${ring}`} title={ring === "mine" ? "タダで取られる駒" : "タダで取れる駒"} />}
          {sourceGlow.has(sq) && <div className="hl-src" style={{ opacity: 0.35 + 0.65 * Math.min(1, sourceGlow.get(sq)! * 2) }} />}
          {mark && <div className={`mark mark-${mark.kind} ${mark.dim ? "dim" : ""}`} style={{ ["--a" as string]: String(0.35 + 0.65 * Math.min(1, mark.share * 1.6)) }} />}
          {p.flash?.sq === sq && <div key={p.flash.n} className="hl-wrong" />}
          {col === 0 && <span className={`coord rank ${light ? "on-light" : "on-dark"}`}>{r + 1}</span>}
          {row === 7 && <span className={`coord file ${light ? "on-light" : "on-dark"}`}>{FILES[f]}</span>}
          {piece && (
            <img
              key={animating ? `${sq}-${p.animKey}` : sq}
              className={`piece ${animating ? "slide" : ""} ${isDragFrom ? "ghosted" : ""}`}
              style={style}
              src={`${BASE}pieces/${piece.color}${piece.type.toUpperCase()}.svg`}
              draggable={false}
              alt=""
            />
          )}
          {ghost && <img className="ghost-piece" style={{ opacity: ghost.dim ? ghost.alpha * 0.35 : ghost.alpha }} src={`${BASE}pieces/${ghost.piece}.svg`} draggable={false} alt="" />}
          {ghost && !ghost.dim && <span className="ghost-tag">👻 {ghost.label}</span>}
          {target !== undefined && (target ? <div className={`cap-ring ${mark && !mark.dim ? "on-mark" : ""}`} /> : <div className={`dot ${mark && !mark.dim ? "on-mark" : ""}`} />)}
          {mark?.label && (
            <span className={`mark-label mark-label-${mark.kind} ${mark.tone ? "toned" : ""} ${mark.dim ? "dim" : ""}`}>
              {mark.sym && <b className={`msym msym-${mark.kind}`}>{mark.sym}</b>}
              <span className={mark.tone ? `tone-${mark.tone}` : undefined}>{mark.label}</span>
            </span>
          )}
          {p.badge?.sq === sq && (
            <span key={`badge-${sq}-${p.animKey}`} className="badge" style={{ background: BADGE[p.badge.kind].bg }} title={BADGE[p.badge.kind].title}>
              {BADGE[p.badge.kind].icon}
            </span>
          )}
        </div>,
      );
    }
  }

  const center = (sq: string) => {
    const { f, r } = sqXY(sq);
    const x = p.orientation === "w" ? f : 7 - f;
    const y = p.orientation === "w" ? 7 - r : r;
    return { x: x * 100 + 50, y: y * 100 + 50 };
  };

  const visibleArrows = (p.arrows ?? []).map((a) => (focus && !focus(a) ? { ...a, opacity: a.opacity * 0.22 } : a));

  return (
    <div className="board-wrap">
      <div className="board" ref={boardRef} onContextMenu={(e) => e.preventDefault()}>
        {squares}
        <svg className="arrows" viewBox="0 0 800 800">
          {visibleArrows.map((a, i) => {
            const s = center(a.from), t = center(a.to);
            const dx = t.x - s.x, dy = t.y - s.y;
            const len = Math.hypot(dx, dy);
            const ux = dx / len, uy = dy / len;
            const head = a.width * 2.6;
            const sx = s.x + ux * 18, sy = s.y + uy * 18;
            const ex = t.x - ux * head, ey = t.y - uy * head;
            const px = -uy, py = ux;
            return (
              <g key={i} opacity={a.opacity}>
                <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={a.color} strokeWidth={a.width} strokeLinecap="butt" strokeDasharray={a.dash ? "14 10" : undefined} />
                <polygon
                  points={`${t.x - ux * 6},${t.y - uy * 6} ${ex + px * head * 0.75},${ey + py * head * 0.75} ${ex - px * head * 0.75},${ey - py * head * 0.75}`}
                  fill={a.color}
                />
              </g>
            );
          })}
        </svg>
        {p.banner && <div className="board-banner">{p.banner}</div>}
        {promo && (
          <div className="promo-backdrop" onPointerDown={(e) => { e.stopPropagation(); setPromo(null); }}>
            <div className="promo-box" onPointerDown={(e) => e.stopPropagation()}>
              <div className="promo-title">昇格する駒</div>
              <div className="promo-row">
                {(["q", "n", "r", "b"] as const).map((x) => (
                  <button key={x} className="promo-piece" onClick={() => { const m = promo; setPromo(null); p.onMove(m.from, m.to, x); }}>
                    <img src={`${BASE}pieces/${promo.color}${x.toUpperCase()}.svg`} alt={x} draggable={false} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      {drag && draggedRef.current && (
        <img
          className="drag-ghost"
          src={`${BASE}pieces/${drag.piece}.svg`}
          style={{ left: drag.x, top: drag.y, width: (boardRef.current?.clientWidth ?? 640) / 8 }}
          alt=""
        />
      )}
    </div>
  );
}
