import { Chess } from "chess.js";
import { BOOK, type Entry } from "../data/book.ts";

export const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

/** Position identity without move counters, so transpositions meet in the same node. */
export const posKey = (fen: string) => fen.split(" ").slice(0, 4).join(" ");

export interface Edge {
  san: string;
  from: string;
  to: string;
  child: string; // posKey
  w: number;
  explicit: boolean;
}

export interface BookNode {
  key: string;
  fen: string;
  info?: Entry;
  children: Edge[];
  parent?: string; // primary parent (first discovered)
  opening?: string; // key of nearest node (self or primary ancestor) that has a name
  depth: number;
}

export const NODES = new Map<string, BookNode>();
const DEFAULT_W = 8;

function tokenize(line: string): { san: string; w?: number }[] {
  return line
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => {
      const m = t.match(/^(.+?)\{([\d.]+)\}$/);
      return m ? { san: m[1], w: parseFloat(m[2]) } : { san: t };
    });
}

function build() {
  const root: BookNode = { key: posKey(START_FEN), fen: START_FEN, children: [], depth: 0 };
  NODES.set(root.key, root);
  for (const e of BOOK) {
    const chess = new Chess();
    const toks = tokenize(e.line);
    let node = root;
    let firstNew: Edge | undefined;
    let lastEdge: Edge | undefined;
    for (const t of toks) {
      const mv = chess.move(t.san);
      const key = posKey(chess.fen());
      let edge = node.children.find((c) => c.san === mv.san);
      if (!edge) {
        edge = { san: mv.san, from: mv.from, to: mv.to, child: key, w: DEFAULT_W, explicit: false };
        node.children.push(edge);
        if (!firstNew && t.w === undefined) firstNew = edge;
      }
      if (t.w !== undefined && !edge.explicit) {
        edge.w = t.w;
        edge.explicit = true;
      }
      let child = NODES.get(key);
      if (!child) {
        child = { key, fen: chess.fen(), children: [], parent: node.key, depth: node.depth + 1 };
        NODES.set(key, child);
      }
      node = child;
      lastEdge = edge;
    }
    if (e.w !== undefined) {
      const target = firstNew ?? lastEdge;
      if (target && !target.explicit) {
        target.w = e.w;
        target.explicit = true;
      }
    }
    const hasInfo = e.name || e.idea || e.plans || e.gm;
    if (hasInfo) {
      if (!node.info) node.info = e;
      else node.info = { ...e, ...node.info, plans: node.info.plans ?? e.plans, gm: node.info.gm ?? e.gm, idea: node.info.idea ?? e.idea };
    }
  }
  // Opening name inheritance along primary parents (BFS so parents resolve first).
  const order = [...NODES.values()].sort((a, b) => a.depth - b.depth);
  for (const n of order) {
    if (n.info?.name) n.opening = n.key;
    else if (n.parent) n.opening = NODES.get(n.parent)?.opening;
  }
  for (const n of NODES.values()) n.children.sort((a, b) => b.w - a.w);
}
build();

export const getNode = (fen: string) => NODES.get(posKey(fen));

export function openingOf(fen: string): BookNode | undefined {
  const n = getNode(fen);
  return n?.opening ? NODES.get(n.opening) : undefined;
}

/** Chain of named ancestors (root-most first), e.g. [King's Pawn, Sicilian, Open Sicilian, Najdorf]. */
export function openingChain(node: BookNode | undefined): BookNode[] {
  const out: BookNode[] = [];
  let cur = node;
  const seen = new Set<string>();
  while (cur && !seen.has(cur.key)) {
    seen.add(cur.key);
    if (cur.info?.name && cur.depth > 0) out.unshift(cur);
    cur = cur.parent ? NODES.get(cur.parent) : undefined;
  }
  return out;
}

/** Nearest node (self or primary ancestor) that has plans / gm. */
export function nearestWith(node: BookNode | undefined, field: "plans" | "gm"): BookNode | undefined {
  let cur = node;
  while (cur) {
    if (cur.info?.[field]?.length) return cur;
    cur = cur.parent ? NODES.get(cur.parent) : undefined;
  }
  return undefined;
}

export interface Candidate extends Edge {
  share: number; // 0..1 among siblings
  rank: number;
  childNode: BookNode;
}

export function candidates(fen: string): Candidate[] {
  const n = getNode(fen);
  if (!n) return [];
  const total = n.children.reduce((s, c) => s + c.w, 0) || 1;
  return n.children.map((c, i) => ({ ...c, share: c.w / total, rank: i, childNode: NODES.get(c.child)! }));
}

/** Follow the most popular move repeatedly: the "main line" from here. */
export function mainContinuation(fen: string, maxPly = 10): { san: string; fen: string }[] {
  const out: { san: string; fen: string }[] = [];
  const chess = new Chess(fen);
  const seen = new Set<string>();
  for (let i = 0; i < maxPly; i++) {
    const n = getNode(chess.fen());
    if (!n || !n.children.length || seen.has(n.key)) break;
    seen.add(n.key);
    chess.move(n.children[0].san);
    out.push({ san: n.children[0].san, fen: chess.fen() });
  }
  return out;
}

/** All named nodes, for the library. */
export function namedNodes(): BookNode[] {
  return [...NODES.values()].filter((n) => n.info?.name && n.depth > 0);
}

/** SAN path from the start position to a node along primary parents. */
export function pathTo(node: BookNode): string[] {
  const keys: string[] = [];
  let cur: BookNode | undefined = node;
  while (cur && cur.parent) {
    keys.unshift(cur.key);
    cur = NODES.get(cur.parent);
  }
  const sans: string[] = [];
  let parent = NODES.get(posKey(START_FEN))!;
  for (const k of keys) {
    const e = parent.children.find((c) => c.child === k)!;
    sans.push(e.san);
    parent = NODES.get(k)!;
  }
  return sans;
}

export function isBookMove(fenBefore: string, san: string) {
  return !!getNode(fenBefore)?.children.find((c) => c.san === san);
}
