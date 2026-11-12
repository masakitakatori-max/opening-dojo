import { useMemo, useState } from "react";
import { GmChips } from "../components/panels";
import { namedNodes, openingChain, pathTo, type BookNode } from "../lib/tree";

const FAMILY_ORDER = ["キングズ・ポーン・オープニング", "クイーンズ・ポーン・オープニング", "イングリッシュ・オープニング", "レティ・オープニング"];

export default function Library({ onOpen }: { onOpen: (moves: string[]) => void }) {
  const [q, setQ] = useState("");
  const [gm, setGm] = useState<string>("");
  const all = useMemo(() => namedNodes().map((n) => ({ n, chain: openingChain(n), path: pathTo(n) })), []);
  const gms = useMemo(() => [...new Set(all.flatMap((x) => x.n.info?.gm ?? []))].sort(), [all]);

  const filtered = all.filter(({ n, chain }) => {
    if (gm && !chain.some((c) => c.info?.gm?.includes(gm))) return false;
    if (!q) return true;
    const hay = `${n.info?.name} ${n.info?.en} ${n.info?.eco} ${chain.map((c) => c.info?.name).join(" ")}`.toLowerCase();
    return q.toLowerCase().split(/\s+/).every((t) => hay.includes(t));
  });

  // group by second-level family (e.g. シシリアン) under the first move
  const groups = new Map<string, { head: string; items: typeof filtered }>();
  for (const x of filtered) {
    const top = x.chain[0]?.info?.name ?? "その他";
    const fam = x.chain[1]?.info?.name ?? top;
    const key = `${top}|${fam}`;
    if (!groups.has(key)) groups.set(key, { head: top, items: [] });
    groups.get(key)!.items.push(x);
  }
  const ordered = [...groups.entries()].sort((a, b) => {
    const ia = FAMILY_ORDER.indexOf(a[1].head), ib = FAMILY_ORDER.indexOf(b[1].head);
    return (ia < 0 ? 9 : ia) - (ib < 0 ? 9 : ib) || a[1].items[0].path.length - b[1].items[0].path.length;
  });

  const fmt = (moves: string[]) =>
    moves.map((m, i) => (i % 2 === 0 ? `${i / 2 + 1}.${m}` : m)).join(" ");

  return (
    <div className="library">
      <header className="picker-head">
        <h1>型図鑑</h1>
        <p>収録した {all.length} の型。クリックするとその局面を探索モードで開きます。</p>
        <div className="lib-filters">
          <input placeholder="検索：ナイドルフ / Najdorf / B90 …" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={gm} onChange={(e) => setGm(e.target.value)}>
            <option value="">GM で絞り込み</option>
            {gms.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
      </header>
      <div className="lib-groups">
        {ordered.map(([key, g]) => (
          <section key={key} className="lib-group">
            <h3>{key.split("|")[1]} <span className="muted small">{key.split("|")[0] !== key.split("|")[1] ? key.split("|")[0] : ""}</span></h3>
            {g.items
              .sort((a, b) => a.path.length - b.path.length)
              .map(({ n, chain, path }) => (
                <button key={n.key} className="lib-item" style={{ paddingLeft: 12 + Math.max(0, chain.length - 2) * 16 }} onClick={() => onOpen(path)}>
                  <span className="eco">{n.info?.eco ?? "—"}</span>
                  <span className="lib-name">{n.info?.name}<span className="muted small"> {n.info?.en}</span></span>
                  <span className="lib-moves">{fmt(path)}</span>
                  {n.info?.gm && <GmChips names={n.info.gm} />}
                </button>
              ))}
          </section>
        ))}
      </div>
      <p className="muted small credits">
        クレジット：駒の画像 cburnett（CC BY-SA 3.0、<a href="https://github.com/lichess-org/chessground" target="_blank" rel="noreferrer">chessground</a> より）／
        エンジン <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">Stockfish.js</a>（GPLv3）／
        パズル <a href="https://database.lichess.org/#puzzles" target="_blank" rel="noreferrer">Lichess puzzle database</a>（CC0）／
        GM の棋譜 <a href="https://www.pgnmentor.com/files.html" target="_blank" rel="noreferrer">PGN Mentor</a>／
        ルール処理 <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">chess.js</a>（BSD-2-Clause）。
      </p>
    </div>
  );
}

export type { BookNode };
