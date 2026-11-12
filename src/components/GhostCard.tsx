import { CLASSICS, findClassic, GHOST_PLAYERS, ghostGameCount, ghostLoaded, jaName, type GameInfo, type GameRef, type GhostMove } from "../lib/ghosts";

const moveNo = (ply: number) => `${Math.floor(ply / 2) + 1}${ply % 2 ? "…" : "."}`;
const vs = (g: GameInfo) => `${jaName(g.player)}（${g.gmColor === "w" ? "白" : "黒"}） vs ${g.opponent}`;

export interface Follow {
  info: GameInfo;
  ply?: number; // ply of the current position inside the game (undefined = off the game)
  nextSan?: string;
  lastCompare?: { same: boolean; gmSan: string; mySan: string };
}

interface Props {
  dense?: boolean;
  ids: string[];
  setIds: (ids: string[]) => void;
  moves: GhostMove[];
  turn: "w" | "b";
  ply: number;
  follow?: Follow;
  guess: boolean;
  setGuess: (g: boolean) => void;
  onPin: (ref: GameRef, fromStart?: boolean) => void;
  onUnpin: () => void;
  onPlay: (san: string) => void;
  onReplaceLast: (san: string) => void;
  onBackToGame: () => void;
  onRestart: () => void;
  onHover: (k?: string) => void;
}

export default function GhostCard(p: Props) {
  const anyLoaded = p.ids.some(ghostLoaded);
  const shown = p.dense ? 5 : 3;
  const perMove = p.dense ? 4 : 2;
  const toggle = (id: string) => p.setIds(p.ids.includes(id) ? p.ids.filter((x) => x !== id) : [...p.ids, id]);

  if (p.follow) {
    const { info, ply, nextSan, lastCompare } = p.follow;
    const gm = jaName(info.player);
    const gmToMove = p.turn === info.gmColor;
    const ended = ply === undefined ? false : ply >= info.moves.length;
    return (
      <div className="card ghost-card">
        <div className="card-title">👻 対局を追跡中 <span className="muted">— {gm}になりきって指す</span></div>
        <div className="gh-pin-title">{vs(info)}</div>
        <div className="gh-pin-sub">{info.year || "年不明"} · {info.event} · 結果 {info.result}（{gm}の{info.outcome === "○" ? "勝ち" : info.outcome === "●" ? "負け" : "引き分け"}）</div>
        <div className="gh-progress"><span style={{ width: `${((ply ?? 0) / info.moves.length) * 100}%` }} /></div>

        {lastCompare && (
          <div className={`gh-cmp ${lastCompare.same ? "same" : "diff"}`}>
            {lastCompare.same ? (
              <>✓ {gm}と同じ手（{lastCompare.gmSan}）</>
            ) : (
              <>
                ✗ {gm}の実戦は <b>{lastCompare.gmSan}</b>（あなた：{lastCompare.mySan}）
                <button onClick={() => p.onReplaceLast(lastCompare.gmSan)}>{gm}の手に差し替える</button>
              </>
            )}
          </div>
        )}

        {ply === undefined && lastCompare && !lastCompare.same ? null : ply === undefined ? (
          <div className="gh-cmp diff">
            この対局の手順から外れています。
            <button onClick={p.onBackToGame}>対局に戻る</button>
          </div>
        ) : ended || !nextSan ? (
          <div className="gh-cmp same">対局終了：{info.result}</div>
        ) : (
          <div className="gh-pin-sub" style={{ marginTop: 10 }}>
            {moveNo(ply)} {gmToMove ? (p.guess ? `${gm}の手番。次の一手を当ててください（盤上で指す）` : `${gm}の次の一手は盤上のゴースト`) : `相手（${info.opponent}）の手を自動で再生します…`}
          </div>
        )}

        <div className="gh-actions">
          <button className="primary" disabled={!nextSan} onClick={() => nextSan && p.onPlay(nextSan)}>▶ 実戦の次の一手</button>
          <button className={p.guess ? "on" : ""} onClick={() => p.setGuess(!p.guess)} title="ゴーストを隠して、次の一手を自分で当てる">当てるモード：{p.guess ? "ON" : "OFF"}</button>
          <button onClick={p.onRestart}>最初から</button>
          <button onClick={p.onUnpin}>✕ 追跡をやめる</button>
        </div>
      </div>
    );
  }

  return (
    <div className="card ghost-card">
      <div className="card-title">👻 GM ゴースト <span className="muted">— この局面で、彼らは実戦でこう指した</span></div>
      <div className="gh-players">
        {GHOST_PLAYERS.map((g) => (
          <button key={g.id} className={`chip ${p.ids.includes(g.id) ? "on" : ""}`} onClick={() => toggle(g.id)} title={ghostLoaded(g.id) ? `${ghostGameCount(g.id)} 局` : ""}>
            {g.flag} {g.ja}
          </button>
        ))}
      </div>

      {!anyLoaded && p.ids.length > 0 && <div className="muted small">棋譜を読み込み中…（無い場合は README の手順で作成）</div>}
      {anyLoaded && p.moves.length === 0 && (
        <div className="muted small">選択中の GM が{p.turn === "w" ? "白" : "黒"}番でこの局面を指した対局はありません。</div>
      )}

      {p.moves.slice(0, shown).map((m) => (
        <div key={m.san} className="gh-move" onMouseEnter={() => p.onHover(m.from + m.to)} onMouseLeave={() => p.onHover()}>
          <button className="gh-top" onClick={() => p.onPlay(m.san)} title="この手を指す">
            <span className="gh-san">{moveNo(p.ply)}{m.san}</span>
            <span className="gh-who">{m.players.map((x) => `${jaName(x.id)} ${x.n}局`).join("・")}</span>
            <span className="gh-score">得点率 {Math.round(m.score * 100)}%</span>
          </button>
          <div className="gh-games">
            {m.samples.slice(0, perMove).map((g) => (
              <button key={`${g.player}-${g.game}`} className="gh-game" onClick={() => p.onPin(g)} title="この対局をゴーストと一緒に追う">
                <span className="yr">{g.year || "—"}</span>
                <span><b>{jaName(g.player)}</b> {g.outcome} {g.opponent}</span>
                <span className="ev">{g.event}</span>
                <span className="gh-follow">追う ▶</span>
              </button>
            ))}
            {m.n > perMove && <span className="muted small" style={{ paddingLeft: 6 }}>ほか {m.n - Math.min(perMove, m.samples.length)} 局</span>}
          </div>
        </div>
      ))}
      {p.moves.length > shown && <div className="muted small" style={{ marginTop: 6 }}>ほか {p.moves.length - shown} 通りの手（「表示：詳しく」で増えます）</div>}
      <div className="muted small" style={{ marginTop: 8 }}>○ 勝ち ／ △ 引き分け ／ ● 負け（GM から見た結果）</div>

      <details className="gh-classics">
        <summary>名局をゴーストと一緒に追う</summary>
        <div className="gh-games">
          {CLASSICS.map((c) => {
            const ref = findClassic(c);
            return (
              <button key={c.title} className="gh-game" disabled={!ref} onClick={() => ref && p.onPin(ref, true)}>
                <span><b>{jaName(c.player)}</b> {c.title}</span>
                <span className="gh-follow">{ref ? "追う ▶" : "未読込"}</span>
              </button>
            );
          })}
        </div>
      </details>
    </div>
  );
}
