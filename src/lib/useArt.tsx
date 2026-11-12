// 芸術点 for one game: what was achieved, the running score, and the pop-up on the board.
// Shared by the self-play board and the sparring session.
import type { Color } from "chess.js";
import { useEffect, useRef, useState } from "react";
import { sfx } from "./sound";
import { brilliantAward, detect, openingAward, recordAward, recordBest, recordGame, type Award } from "./trophies";

export interface ArtItem {
  n: number;
  color: Color;
  ja: string;
  pts: number;
  counted: boolean; // false = achieved with assists on: shown for reference, no points
}

export function useArt() {
  const [feed, setFeed] = useState<ArtItem[]>([]);
  const [toast, setToast] = useState<{ text: string; n: number }>();
  const earned = useRef(new Set<string>()); // once per game, per side
  const saved = useRef(false);
  const score = (c?: Color) => feed.filter((f) => f.counted && (!c || f.color === c)).reduce((t, f) => t + f.pts, 0);
  const scoreRef = useRef(0);
  scoreRef.current = score();
  const total = scoreRef.current;
  useEffect(() => recordBest(total), [total]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(undefined), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /** Put the game's score into the record (once): at the end, or when the game is left. */
  const finish = () => {
    if (saved.current) return;
    saved.current = true;
    recordGame(scoreRef.current);
  };
  useEffect(() => finish, []); // eslint-disable-line react-hooks/exhaustive-deps

  const give = (color: Color, list: Award[], counted: boolean) => {
    const fresh = list.filter((a) => !earned.current.has(`${color}:${a.id}`));
    if (!fresh.length) return;
    for (const a of fresh) {
      earned.current.add(`${color}:${a.id}`);
      if (counted) recordAward(a);
    }
    setFeed((f) => [...fresh.map((a, i) => ({ n: Date.now() + i, color, ja: a.ja, pts: a.pts, counted })), ...f]);
    const top = [...fresh].sort((x, y) => y.pts - x.pts)[0];
    setToast({ text: `${counted ? `+${fresh.reduce((t, a) => t + a.pts, 0)}` : "参考"} ${top.ja}${fresh.length > 1 ? ` ほか ${fresh.length - 1}` : ""}`, n: Date.now() });
    if (counted) sfx.good();
  };

  return {
    feed,
    toast,
    score,
    finish,
    /** A move made by hand on the board. `counted` = no assists were on. */
    move: (fenBefore: string, fenAfter: string, m: { from: string; to: string; promotion?: string }, color: Color, counted: boolean) => {
      const op = openingAward(fenBefore, fenAfter);
      give(color, [...detect(fenBefore, m), ...(op ? [op] : [])], counted);
    },
    /** The engine later judged a move a sound sacrifice (!!). */
    brilliant: (color: Color, counted: boolean) => give(color, [brilliantAward()], counted),
    /** Start a new game on the same board. */
    reset: () => {
      finish();
      earned.current = new Set();
      saved.current = false;
      setFeed([]);
    },
  };
}
export type Art = ReturnType<typeof useArt>;

export function ArtToast({ art }: { art: Art }) {
  return art.toast ? <div key={art.toast.n} className="banner art"><span>{art.toast.text}</span></div> : null;
}

export function ArtCard({ art, assistOn, both }: { art: Art; assistOn: boolean; both: boolean }) {
  return (
    <div className="card art-card">
      <div className="card-title">🏆 芸術点 <span className="muted">— 名前のついた手・陣形・定跡を、補助なしで指すと入る</span></div>
      <div className="art-score">{both ? <>白 {art.score("w")}<small>黒 {art.score("b")}</small></> : art.score()}</div>
      {assistOn && <div className="muted small" style={{ marginTop: 4 }}>いまは補助 ON なので、達成しても点は入りません（「参考」と表示）。補助を OFF にすると点が入ります。</div>}
      {art.feed.length > 0 && (
        <div className="art-feed">
          {art.feed.map((f) => (
            <div key={f.n} className={`art-item ${f.counted ? "" : "ref"}`}>
              <b>{f.counted ? `+${f.pts}` : "参考"}</b>
              <span>{f.ja}{both ? `（${f.color === "w" ? "白" : "黒"}）` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
