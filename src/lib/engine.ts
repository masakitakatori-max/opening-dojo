import { BASE } from "./asset";

// Thin UCI wrapper around the single-threaded Stockfish WASM build (public/engine).
export interface EngineLine {
  multipv: number;
  depth: number;
  cp?: number; // centipawns from WHITE's point of view
  mate?: number; // mate in N from WHITE's point of view
  pv: string[]; // UCI moves
}

export interface Request {
  fen: string;
  searchmoves?: string[]; // restrict to these UCI moves (e.g. one piece's moves)
  multipv?: number;
  depth?: number;
}
const reqKey = (r: Request) => `${r.fen}|${(r.searchmoves ?? []).join(",")}`;

type Listener = (key: string, lines: EngineLine[], done: boolean) => void;

class Engine {
  private worker?: Worker;
  private ready = false;
  private searching = false;
  private queued?: Request;
  private current?: Request;
  private lines: EngineLine[] = [];
  private listeners = new Set<Listener>();
  /** Best known full-position analysis per FEN (deepest wins). */
  private cache = new Map<string, EngineLine[]>();
  /** Every evaluated first move per FEN (from full and piece-restricted searches). */
  private moveEvals = new Map<string, Map<string, EngineLine>>();

  private boot() {
    if (this.worker) return;
    try {
      this.worker = new Worker(`${BASE}engine/stockfish-18-lite-single.js`);
    } catch {
      return;
    }
    this.worker.onmessage = (e) => this.onLine(String(e.data));
    this.send("uci");
    this.send("isready");
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private emit(done: boolean) {
    if (!this.current) return;
    const key = reqKey(this.current);
    const snapshot = this.lines.filter(Boolean).slice();
    if (!this.current.searchmoves && snapshot.length) {
      const prev = this.cache.get(this.current.fen);
      if (!prev || (prev[0]?.depth ?? 0) <= (snapshot[0]?.depth ?? 0)) this.cache.set(this.current.fen, snapshot);
    }
    let me = this.moveEvals.get(this.current.fen);
    if (!me) this.moveEvals.set(this.current.fen, (me = new Map()));
    for (const l of snapshot) {
      const u = l.pv[0];
      if (u && (me.get(u)?.depth ?? -1) <= l.depth) me.set(u, l);
    }
    this.listeners.forEach((fn) => fn(key, snapshot, done));
  }

  private onLine(line: string) {
    if (line === "readyok") {
      this.ready = true;
      if (this.queued) this.start(this.queued);
      return;
    }
    if (line.startsWith("bestmove")) {
      this.searching = false;
      if (this.queued) this.start(this.queued);
      else this.emit(true);
      return;
    }
    if (!line.startsWith("info") || this.queued || !this.current) return;
    const m = line.match(/ depth (\d+).* multipv (\d+).* score (cp|mate) (-?\d+).* pv (.+)$/);
    if (!m) return;
    const sign = this.current.fen.split(" ")[1] === "w" ? 1 : -1;
    const l: EngineLine = { depth: +m[1], multipv: +m[2], pv: m[5].trim().split(" ") };
    if (m[3] === "cp") l.cp = sign * +m[4];
    else l.mate = sign * +m[4];
    // keep only lines from the latest completed depth, so the list stays consistent
    if (this.lines[0] && l.depth > this.lines[0].depth && l.multipv === 1) this.lines = [];
    this.lines[l.multipv - 1] = l;
    const want = Math.min(this.current.multipv ?? 3, this.current.searchmoves?.length ?? 99);
    if (l.multipv === 1 || this.lines.filter(Boolean).length >= want) this.emit(false);
  }

  private start(r: Request) {
    this.queued = undefined;
    this.current = r;
    this.lines = [];
    this.searching = true;
    const mpv = Math.min(r.multipv ?? 3, r.searchmoves?.length ?? 500);
    this.send(`setoption name MultiPV value ${Math.max(1, mpv)}`);
    this.send(`position fen ${r.fen}`);
    this.send(`go depth ${r.depth ?? 16}${r.searchmoves?.length ? ` searchmoves ${r.searchmoves.join(" ")}` : ""}`);
  }

  analyze(r: Request) {
    this.boot();
    if (!this.worker) return reqKey(r);
    if (this.current && reqKey(this.current) === reqKey(r) && (this.searching || this.queued)) return reqKey(r);
    if (!this.ready || this.searching) {
      this.queued = r;
      if (this.searching) this.send("stop");
      return reqKey(r);
    }
    this.start(r);
    return reqKey(r);
  }

  /** Analyse and resolve with the final lines. Never resolves if a newer request replaces this one. */
  run(r: Request): Promise<EngineLine[]> {
    const key = reqKey(r);
    return new Promise((resolve) => {
      const off = this.subscribe((k, lines, done) => {
        if (k !== key || !done) return;
        off();
        resolve(lines);
      });
      this.analyze(r);
    });
  }

  stop() {
    this.queued = undefined;
    this.current = undefined;
    if (this.searching) this.send("stop");
  }

  evalsOf(fen: string) {
    return this.moveEvals.get(fen);
  }

  cached(fen: string) {
    return this.cache.get(fen);
  }

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }
}

export const engine = new Engine();
export const keyOf = reqKey;

export function evalText(l?: { cp?: number; mate?: number }) {
  if (!l) return "…";
  if (l.mate !== undefined) return `${l.mate > 0 ? "+" : "-"}M${Math.abs(l.mate)}`;
  const v = (l.cp ?? 0) / 100;
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}`;
}

/** 0..1 share of the bar for White. */
export function whiteShare(l?: EngineLine) {
  if (!l) return 0.5;
  if (l.mate !== undefined) return l.mate > 0 ? 1 : 0;
  return 1 / (1 + Math.exp(-(l.cp ?? 0) / 250));
}
