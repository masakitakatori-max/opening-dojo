// The user's own games, stored one by one in the browser: style statistics per game (for the
// diagnosis) and an opening book of the moves they actually played (for the clone opponent).
import { Chess } from "chess.js";
import { GM_STYLES } from "../data/gmStyles";
import { fromChessCom, fromLichess, fromPgn, type Imported, type Speed } from "./importGames";
import { posHash } from "./poshash";
import { load, save } from "./storage";
import { aggregate, analyzeGame, axisScores, nearestGms, type GameStats } from "./style";

export const STORE_KEY = "dojo.style.store";
export const VERSION = 2; // bump when GameStats changes: stored games are then re-fetched
export const WINDOW = 300; // the diagnosis looks at the latest N stored games
export const RECENT = 30; // "recent trend" = the latest N games
const KEEP = 1000;
const BOOK_PLIES = 24; // the clone repeats the user's own moves for the first 12 moves
export type Source = "chesscom" | "lichess" | "pgn";
export const SOURCE_JA: Record<Source, string> = { chesscom: "chess.com", lichess: "Lichess", pgn: "棋譜の貼り付け" };

export interface StoredGame extends GameStats {
  id: string;
  t: number;
  r?: number; // my rating at the time (games fetched before ratings were kept don't have it)
  or?: number; // the opponent's rating
  sp?: string; // time class
}
export interface Snap {
  t: number;
  n: number;
  added: number;
  axes: Record<string, number>;
  top: string;
}
/** position hash → the moves the user played there, with how often */
export type Book = Record<string, Record<string, number>>;
export interface Store {
  v: number;
  who: string;
  source: Source;
  speed: Speed;
  games: StoredGame[]; // oldest first
  history: Snap[];
  updatedAt: number;
  book?: Book;
  bookIds?: string[]; // games already counted in the book
}

export function loadStore(): Store | null {
  const st = load<Store | null>(STORE_KEY, null);
  return st && st.v === VERSION ? st : null;
}
export const saveStore = (st: Store | null) => save(STORE_KEY, st);
export const windowOf = (st: Store) => st.games.slice(-WINDOW);

function addToBook(book: Book, g: Imported) {
  const c = new Chess();
  for (let i = 0; i < Math.min(BOOK_PLIES, g.moves.length); i++) {
    const before = c.fen();
    let m;
    try {
      m = c.move(g.moves[i]);
    } catch {
      return;
    }
    if (m.color !== g.color) continue;
    const h = posHash(before);
    (book[h] ??= {})[m.san] = (book[h][m.san] ?? 0) + 1;
  }
}

/** Add newly analysed games to the store (no duplicates) and record a snapshot of the axes. */
function mergeInto(prev: Store | null, who: string, source: Source, speed: Speed, fresh: StoredGame[]): { store: Store; added: number } {
  const base: Store = prev ?? { v: VERSION, who, source, speed, games: [], history: [], updatedAt: 0 };
  const have = new Set(base.games.map((g) => g.id));
  const add = fresh.filter((g) => !have.has(g.id));
  const games = [...base.games, ...add].sort((a, b) => a.t - b.t).slice(-KEEP);
  const store: Store = { ...base, speed, games, updatedAt: Date.now() };
  if (add.length && games.length >= 5) {
    const m = aggregate(games.slice(-WINDOW)).m;
    store.history = [...base.history, { t: Date.now(), n: games.length, added: add.length, axes: axisScores(m, GM_STYLES), top: nearestGms(m, GM_STYLES)[0].id }].slice(-60);
  }
  return { store, added: add.length };
}

export interface SyncOptions {
  prev: Store | null;
  src: Source;
  who: string;
  speed: Speed;
  max: number;
  pgn?: string;
  /** Re-read the latest games even if they are already stored (to fill in the opening book). */
  full?: boolean;
  onStatus?: (text: string) => void;
}

/**
 * Fetch (or parse) games, analyse the new ones and merge them into the store.
 * Same account as before → only what is new is added. A different account starts over.
 * Throws an Error with a message for the user when nothing usable comes back.
 */
export async function syncGames(o: SyncOptions): Promise<{ store: Store; added: number; fresh: boolean }> {
  let who = o.who.trim();
  const same = !!o.prev && o.prev.source === o.src && (o.src === "pgn" || o.prev.who.toLowerCase() === who.toLowerCase());
  const prev = same ? o.prev : null;
  let games: Imported[] = [];
  if (o.src === "pgn") {
    const r = fromPgn(o.pgn ?? "", who || prev?.who);
    games = r.games;
    who = r.name || "あなた";
  } else {
    if (!who) throw new Error("ユーザー名を入れてください。");
    const incremental = !!prev && !o.full;
    o.onStatus?.(incremental ? "新しい対局を確認中…" : "対局を取得中…");
    const last = incremental && prev!.games.length ? prev!.games[prev!.games.length - 1].t : undefined;
    games =
      o.src === "lichess"
        ? await fromLichess(who, incremental ? 300 : o.max, o.speed, last)
        : await fromChessCom(who, incremental ? 300 : o.max, o.speed, (n) => o.onStatus?.(`対局を取得中… ${n} 局`), incremental ? new Set(prev!.games.map((g) => g.id)) : undefined, last);
  }
  if (!games.length && !prev) {
    throw new Error(o.src === "pgn" ? "読める対局がありませんでした。棋譜（PGN）と、棋譜に書かれた自分の名前を確認してください。" : "条件に合う対局がありませんでした。持ち時間の条件を「すべて」にして試してください。");
  }
  const have = new Set(prev?.games.map((g) => g.id));
  const bookIds = new Set(prev?.bookIds ?? []);
  const book: Book = prev?.book ? structuredClone(prev.book) : {};
  const fresh: StoredGame[] = [];
  for (let i = 0; i < games.length; i++) {
    const g = games[i];
    if (!bookIds.has(g.id)) {
      addToBook(book, g);
      bookIds.add(g.id);
    }
    if (!have.has(g.id)) {
      const st = analyzeGame(g);
      if (st) fresh.push({ ...st, id: g.id, t: g.t, r: g.myRating, or: g.oppRating, sp: g.speed });
    }
    if (i % 5 === 4) {
      o.onStatus?.(`指し手を分析中… ${i + 1}/${games.length} 局`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  const { store, added } = mergeInto(prev, who, o.src, o.speed, fresh);
  store.book = book;
  store.bookIds = [...bookIds].slice(-KEEP);
  if (store.games.length < 5) throw new Error(`分析できた対局が ${store.games.length} 局しかありません（8 手未満の対局は除外）。もっと多くの対局で試してください。`);
  saveStore(store);
  return { store, added, fresh: !prev };
}
