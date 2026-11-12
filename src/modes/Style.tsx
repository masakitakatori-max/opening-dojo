// タイプ診断: measure the user's own games and compare the bias with the GMs.
// Games are stored one by one and only new ones are added on each update, so the picture
// shifts a little at a time instead of being redrawn from scratch.
import { useEffect, useMemo, useRef, useState } from "react";
import { GM_STYLES, SPLIT_HALF } from "../data/gmStyles";
import { GHOST_PLAYERS, jaName } from "../lib/ghosts";
import type { Speed } from "../lib/importGames";
import { loadStore, RECENT, saveStore, SOURCE_JA, syncGames, WINDOW, windowOf, type Source, type Store } from "../lib/myGames";
import { aggregate, AXES, AXIS_GROUPS, axisScores, baseline, METRICS, nearestGms, STYLE_KEYS, zOf, type AxisId, type MetricKey, type Profile, type Split } from "../lib/style";

const GM_NOTE: Record<string, string> = {
  fischer: "万能型。精密な読みで主導権を握り、白番は 1.e4 一筋。エンドゲームも強い。",
  kasparov: "準備と主導権の攻撃型。駒の活動力で押し切る。",
  carlsen: "万能型。小さな有利をエンドゲームで絞り切る。",
  capablanca: "簡明で自然な指し回し。エンドゲームの名手。",
  morphy: "素早い展開と、開いた局面での猛攻。",
  tal: "捨て駒の魔術師。駒損を恐れずキングに襲いかかる。",
  karpov: "アナコンダ。相手の手を封じて、じわじわ締め付ける。",
  alekhine: "複雑な局面を作り、攻撃的なコンビネーションで決める。",
  petrosian: "鉄壁の守備。危険を事前に消す予防の達人。",
};

const pct = (v: number) => `${Math.round(v * 100)}%`;
const fmt = (k: MetricKey, v: number) => (METRICS[k].pct ? `${(v * 100).toFixed(1)}%` : v.toFixed(v >= 10 ? 1 : 2));

function typeName(ax: Record<AxisId, number>) {
  const main = (["attack", "squeeze", "solid", "endgame"] as AxisId[]).map((id) => ({ id, v: ax[id] })).sort((a, b) => b.v - a.v)[0];
  let name = "バランス型";
  if (main.v >= 56) {
    name = { attack: main.v >= 75 ? "超攻撃型" : "攻撃型", squeeze: "アナコンダ型（締め付け）", solid: "堅守型", endgame: "エンドゲーム職人型" }[main.id as "attack" | "squeeze" | "solid" | "endgame"];
  }
  if (ax.queen >= 70) name += "・クイーン使い";
  else if (ax.queen <= 30) name += "・クイーン温存";
  return name;
}

interface Finding {
  title: string;
  detail: string;
  fix?: string;
}

/** Strengths and weaknesses from the user's own results (not from the GM comparison). */
function findings(p: Profile): { good: Finding[]; bad: Finding[] } {
  const good: Finding[] = [], bad: Finding[] = [];
  // What the GMs actually measure on the same scale (2nd lowest .. 2nd highest), instead of guessed numbers.
  const gm = (k: MetricKey) => {
    const xs = Object.values(GM_STYLES).map((g) => g[k]).sort((a, b) => a - b);
    return { lo: xs[1], hi: xs[xs.length - 2], text: `${xs[1].toFixed(k === "bookDepth" ? 1 : 2)}〜${xs[xs.length - 2].toFixed(k === "bookDepth" ? 1 : 2)}` };
  };
  const all = p.score;
  const line = (s: Split) => `${s.n} 局で得点率 ${pct(s.score)}`;
  const versus = (a: Split, b: Split, an: string, bn: string, fixA?: string, fixB?: string, gap = 0.1) => {
    if (a.n < 8 || b.n < 8 || Math.abs(a.score - b.score) < gap) return;
    const aBetter = a.score > b.score;
    const hi = aBetter ? a : b, lo = aBetter ? b : a;
    const hn = aBetter ? an : bn, ln = aBetter ? bn : an;
    const fix = aBetter ? fixB : fixA;
    good.push({ title: `${hn}で成績が良い`, detail: `${hn}：${line(hi)}（${ln}：${pct(lo.score)}）` });
    bad.push({ title: `${ln}で成績が落ちる`, detail: `${ln}：${line(lo)}（${hn}：${pct(hi.score)}）`, fix });
  };
  versus(p.splits.white, p.splits.black, "白番", "黒番", "型ドリルで白番の型を 1 つに絞って反復", "型ドリルで黒番の型（対 1.e4・対 1.d4）を 1 つずつ固める", 0.16);
  versus(p.splits.endgame, p.splits.noEndgame, "エンドゲームまで行った局", "中盤で決着した局", "局面練習で、駒の少ない局面を「最強」相手に勝ちきる練習", "狙いドリルで中盤の戦術（フォーク・ピン・タダ取り）を反復");
  versus(p.splits.queensOff, p.splits.queensOn, "クイーン交換後の局", "クイーンが残った局", "局面練習でクイーンのない局面を繰り返す", "狙いドリル「キングサイド攻撃」「裸のキング」でクイーンの使い方を反復");
  versus(p.splits.opposite, p.splits.sameSide, "反対側キャスリングの局", "同じ側キャスリングの局", "型ドリル「オープン・シシリアン」で攻め合いの型を覚える");

  if (p.splits.uncastled.n >= 6 && p.splits.uncastled.score < all - 0.08) bad.push({ title: "キャスリングが遅い局で負けやすい", detail: `15 手目までに囲わなかった局：${line(p.splits.uncastled)}（全体 ${pct(all)}）`, fix: "序盤の三原則（中央・展開・キャスリング）を型ドリルで徹底" });
  if (p.splits.up3.n >= 8) {
    if (p.splits.up3.score >= 0.88) good.push({ title: "有利を勝ちきる", detail: `駒 3 点以上リードした局：${line(p.splits.up3)}` });
    else if (p.splits.up3.score < 0.75) bad.push({ title: "勝ち局を落としている", detail: `駒 3 点以上リードした局：${line(p.splits.up3)}`, fix: "局面練習に「駒得の局面」を保存し、最強相手に勝ちきる練習" });
  }
  if (p.splits.down3.n >= 8) {
    if (p.splits.down3.score >= 0.25) good.push({ title: "不利から粘る・逆転する", detail: `駒 3 点以上損した局：${line(p.splits.down3)}` });
    else if (p.splits.down3.score <= 0.06) bad.push({ title: "不利になると崩れる", detail: `駒 3 点以上損した局：${line(p.splits.down3)}`, fix: "狙いドリル「受けの一手」で粘り方を練習" });
  }
  const phases: [string, number, string][] = [["序盤（12 手まで）", p.loss.opening, "型ドリルで序盤の型を固める。探索モードのブランダー警告で確認"], ["中盤", p.loss.middle, "狙いドリル「タダ取り」「フォーク」「ピン」を毎日"], ["エンドゲーム", p.loss.endgame, "局面練習で終盤の局面を繰り返す"]];
  const worst = [...phases].sort((a, b) => b[1] - a[1])[0];
  const gmLoss = gm("lossEv");
  if (p.m.lossEv >= gmLoss.hi * 1.8) bad.push({ title: `駒損が一番多いのは${worst[0]}`, detail: `1 局あたりの駒損：序盤 ${p.loss.opening.toFixed(2)}・中盤 ${p.loss.middle.toFixed(2)}・終盤 ${p.loss.endgame.toFixed(2)} 回（合計 ${p.m.lossEv.toFixed(2)}、GM は ${gmLoss.text}）`, fix: worst[2] });
  else if (p.m.lossEv <= gmLoss.hi * 1.15) good.push({ title: "駒をタダで取られにくい", detail: `1 局あたりの駒損 ${p.m.lossEv.toFixed(2)} 回（GM は ${gmLoss.text}）` });
  if (p.m.gainEv >= p.m.lossEv * 1.3 && p.m.gainEv >= 0.8) good.push({ title: "相手のミスを咎める", detail: `1 局あたりの駒得 ${p.m.gainEv.toFixed(2)} 回（駒損 ${p.m.lossEv.toFixed(2)} 回）` });
  if (p.m.mateWin >= 0.4) good.push({ title: "詰ませ切る力", detail: `勝ち局の ${pct(p.m.mateWin)} がチェックメイト` });
  if (p.m.mated >= 0.4) bad.push({ title: "詰みを見落としやすい", detail: `負け局の ${pct(p.m.mated)} がチェックメイト`, fix: "狙いドリル「バックランク・メイト」「窒息メイト」と、局面練習のブランダー判定" });
  if (p.timeLossRate >= 0.25) bad.push({ title: "時間切れ負けが多い", detail: `負け局の ${pct(p.timeLossRate)} が時間切れ`, fix: "狙いドリルで形を増やすと、考える時間そのものが減ります" });
  const gmBook = gm("bookDepth");
  if (p.m.bookDepth < gmBook.lo * 0.7) bad.push({ title: "定跡から早く外れる", detail: `このアプリの定跡集どおりに進むのは平均 ${p.m.bookDepth.toFixed(1)} 手（GM は ${gmBook.text} 手）`, fix: "型を白 1・黒 2 に絞って型ドリル" });
  const ops = p.splits.openings.filter((o) => o.n >= 5);
  const bestOp = [...ops].sort((a, b) => b.score - a.score)[0], worstOp = [...ops].sort((a, b) => a.score - b.score)[0];
  if (bestOp && bestOp.score >= all + 0.12) good.push({ title: `得意な型：${bestOp.name}`, detail: line(bestOp) });
  if (worstOp && worstOp !== bestOp && worstOp.score <= all - 0.12) bad.push({ title: `苦手な型：${worstOp.name}`, detail: line(worstOp), fix: "型図鑑でこの型を開き、狙いを確認してから型ドリル" });
  return { good, bad };
}

export default function StyleMode({ onClone }: { onClone?: (side: "w" | "b") => void }) {
  const [store, setStore] = useState<Store | null>(loadStore);
  const [editing, setEditing] = useState(false);
  const [source, setSource] = useState<Source>(store?.source ?? "chesscom");
  const [user, setUser] = useState<string>(store?.who ?? "");
  const [max, setMax] = useState(100);
  const [speed, setSpeed] = useState<Speed>(store?.speed ?? "blitz+");
  const [pgn, setPgn] = useState("");
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();
  const [note, setNote] = useState<string>();

  const run = async (opts: { src: Source; who: string; speed: Speed; max: number; quiet?: boolean }) => {
    setError(undefined);
    setNote(undefined);
    try {
      const r = await syncGames({ prev: store, src: opts.src, who: opts.who, speed: opts.speed, max: opts.max, pgn, onStatus: setBusy });
      setBusy(undefined);
      setStore(r.store);
      setEditing(false);
      setPgn("");
      setNote(r.fresh ? `${r.added} 局を取り込みました。` : r.added ? `新しい対局 ${r.added} 局を足しました。` : "新しい対局はありませんでした。");
    } catch (e) {
      setBusy(undefined);
      if (!opts.quiet) setError(e instanceof Error ? e.message : "取得に失敗しました。通信状況を確認してください。");
    }
  };

  // Opening the page: quietly pick up games played since the last visit.
  const auto = useRef(false);
  useEffect(() => {
    if (auto.current || !store || store.source === "pgn" || Date.now() - store.updatedAt < 10 * 60e3) return;
    auto.current = true;
    void run({ src: store.source, who: store.who, speed: store.speed, max: 300, quiet: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const showForm = !store || editing;
  return (
    <div className="picker style-page">
      <header className="picker-head">
        <h1>タイプ診断</h1>
        <p>
          あなたの対局から<strong>指し手の偏り</strong>を数値にして、「どの GM に近いか」と「強み・弱み」を出します。
          対局は 1 局ずつ貯めておき、更新のたびに新しい対局だけを足すので、結果は少しずつ動きます（診断は直近 {WINDOW} 局）。
        </p>
      </header>

      {store && !editing && (
        <div className="card style-bar">
          <span><b>{store.who}</b>（{SOURCE_JA[store.source]}）・ 貯めた対局 {store.games.length} 局 ・ 最終更新 {new Date(store.updatedAt).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
          <span className="legend-sep" />
          {store.source !== "pgn" && <button className="chip on" disabled={!!busy} onClick={() => run({ src: store.source, who: store.who, speed: store.speed, max: 300 })}>{busy ?? "⟳ 新しい対局を足す"}</button>}
          <button className="chip" onClick={() => setEditing(true)}>{store.source === "pgn" ? "棋譜を追加／別の元で診断" : "別のアカウントで診断"}</button>
          <button className="chip" onClick={() => { if (confirm("貯めた対局と履歴を消します。よろしいですか？")) { setStore(null); saveStore(null); setNote(undefined); } }}>リセット</button>
        </div>
      )}
      {note && <div className="muted small" style={{ marginTop: 8 }}>{note}</div>}
      {error && !showForm && <div className="tone-neg small" style={{ marginTop: 8 }}>{error}</div>}

      {showForm && (
        <div className="card style-form">
          <div className="spar-row">
            <span className="spar-label">対局の元</span>
            {(["chesscom", "lichess", "pgn"] as Source[]).map((id) => (
              <button key={id} className={`chip ${source === id ? "on" : ""}`} onClick={() => setSource(id)}>{id === "pgn" ? "棋譜を貼り付け" : SOURCE_JA[id]}</button>
            ))}
          </div>
          <div className="spar-row">
            <span className="spar-label">{source === "pgn" ? "自分の名前" : "ユーザー名"}</span>
            <input value={user} onChange={(e) => setUser(e.target.value)} placeholder={source === "pgn" ? "棋譜の White / Black に書かれた名前（空なら一番多い名前）" : "例：your_name"} onKeyDown={(e) => e.key === "Enter" && !busy && run({ src: source, who: user, speed, max })} />
          </div>
          {source === "pgn" ? (
            <textarea rows={5} value={pgn} onChange={(e) => setPgn(e.target.value)} placeholder="PGN をまとめて貼り付け（複数局可）。あとから追加で貼ると、同じ対局は数えずに新しい分だけ足します。" />
          ) : (
            <>
              <div className="spar-row">
                <span className="spar-label">最初の取得</span>
                {[50, 100, 200, 300].map((n) => <button key={n} className={`chip ${max === n ? "on" : ""}`} onClick={() => setMax(n)}>最新 {n} 局</button>)}
              </div>
              <div className="spar-row">
                <span className="spar-label">持ち時間</span>
                {([["all", "すべて"], ["blitz+", "ブリッツ以上"], ["rapid+", "ラピッド以上"]] as const).map(([id, ja]) => (
                  <button key={id} className={`chip ${speed === id ? "on" : ""}`} onClick={() => setSpeed(id)} title="1〜2 分の超早指しは、普段の指し方と違う傾向が出やすいので、既定では除きます">{ja}</button>
                ))}
              </div>
            </>
          )}
          <div className="fb-actions">
            <button className="primary" disabled={!!busy} onClick={() => run({ src: source, who: user, speed, max })}>{busy ?? "診断する ▶"}</button>
            {store && <button onClick={() => setEditing(false)}>やめる</button>}
          </div>
          {error && <div className="tone-neg small" style={{ marginTop: 8 }}>{error}</div>}
          <div className="muted small" style={{ marginTop: 8 }}>
            ユーザー名は、対局の取得のために chess.com / Lichess の公開 API にだけ送られます。結果はこのブラウザ内に保存されます。
            {store && source !== "pgn" && "別のアカウントで診断すると、いま貯めている対局は置き換わります。"}
          </div>
        </div>
      )}

      {store && <Report store={store} onClone={onClone} />}
    </div>
  );
}

function AxisRow({ a, v, gm, prev, recent, gmName }: { a: (typeof AXES)[number]; v: number; gm: number; prev?: number; recent?: number; gmName: string }) {
  const d = prev === undefined ? 0 : Math.round(v) - Math.round(prev);
  const tr = recent === undefined ? 0 : recent - v;
  return (
    <div className="ax">
      <div className="ax-head">
        <b>{a.ja}</b>
        <span>
          {d !== 0 && <i className="ax-delta" title="前回の更新からの変化">{d > 0 ? `+${d}` : d}</i>}
          {Math.abs(tr) >= 5 && <i className="ax-trend" title={`直近 ${RECENT} 局だけで測ると ${Math.round(recent!)}`}>{tr > 0 ? "↗" : "↘"} 直近 {Math.round(recent!)}</i>}
          {Math.round(v)}
        </span>
      </div>
      <div className="ax-bar">
        <span className="ax-fill" style={{ width: `${v}%` }} />
        <span className="ax-mid" />
        <span className="ax-gm" style={{ left: `${gm}%` }} title={gmName}>◆</span>
      </div>
      <div className="muted small">{v >= 55 ? a.hi : v <= 45 ? a.lo : "GM の標準に近い"}</div>
    </div>
  );
}

function Report({ store, onClone }: { store: Store; onClone?: (side: "w" | "b") => void }) {
  const games = useMemo(() => windowOf(store), [store]);
  const p = useMemo(() => aggregate(games), [games]);
  const ax = useMemo(() => axisScores(p.m, GM_STYLES), [p]);
  const near = useMemo(() => nearestGms(p.m, GM_STYLES), [p]);
  const base = useMemo(() => baseline(GM_STYLES), []);
  const f = useMemo(() => findings(p), [p]);
  // Recent trend: the latest games on their own (only when there are enough older games to compare with).
  const recent = useMemo(() => (store.games.length >= RECENT * 2 ? axisScores(aggregate(store.games.slice(-RECENT)).m, GM_STYLES) : undefined), [store]);
  const last = store.history[store.history.length - 1];
  const before = store.history.length >= 2 ? store.history[store.history.length - 2] : undefined;
  const top = near[0];
  const topAx = axisScores(GM_STYLES[top.id], GM_STYLES);
  const sim = (s: number) => Math.round(((s + 1) / 2) * 100);
  const biases = STYLE_KEYS.map((k) => ({ k, z: zOf(p.m[k], base[k]) })).filter((b) => Math.abs(b.z) >= 1).sort((a, b) => Math.abs(b.z) - Math.abs(a.z)).slice(0, 8);
  const gmRange = (k: MetricKey) => {
    const xs = Object.values(GM_STYLES).map((g) => g[k]).sort((a, b) => a - b);
    return `${fmt(k, xs[1])}〜${fmt(k, xs[xs.length - 2])}`;
  };
  const row = (a: (typeof AXES)[number]) => (
    <AxisRow key={a.id} a={a} v={ax[a.id]} gm={topAx[a.id]} prev={before?.axes[a.id]} recent={recent?.[a.id]} gmName={jaName(top.id)} />
  );

  return (
    <div className="style-report">
      <div className="card style-hero">
        <div className="muted small">
          {store.who} ・ {SOURCE_JA[store.source]} ・ 直近 {p.n} 局で診断（得点率 {pct(p.score)}）
          {last && before && ` ・ 前回の更新から +${last.added} 局`}
        </div>
        <h2 className="style-type">{typeName(ax)}</h2>
        <div className="style-near">GM でいうと <b>{jaName(top.id)}</b> 寄り <span className="muted">（偏りの方向の一致 {sim(top.sim)}%）</span></div>
        <div className="idea"><span className="idea-move">{jaName(top.id)}</span><span>{GM_NOTE[top.id]}</span></div>
        {before && before.top !== top.id && <div className="muted small" style={{ marginTop: 8 }}>前回は {jaName(before.top)} 寄りでした。</div>}
        {p.n < 30 && <div className="tone-neg small" style={{ marginTop: 8 }}>対局が {p.n} 局と少ないので、結果はまだ不安定です。30 局以上で傾向が落ち着きます。</div>}
        {onClone && (
          <div className="clone-cta">
            <span><b>🪞 過去の自分と対局する</b><span className="muted small">　序盤はあなたの実際の手、その先はあなたのクセとミスの頻度を再現した分身が相手です。</span></span>
            <button className="chip on" onClick={() => onClone("w")}>白を持つ</button>
            <button className="chip on" onClick={() => onClone("b")}>黒を持つ</button>
          </div>
        )}
      </div>

      <div className="style-cols">
        <div className="card">
          <div className="card-title">総合 5 軸 <span className="muted">— 50 が GM の標準。◆ は{jaName(top.id)}</span></div>
          {AXES.filter((a) => a.group === "総合").map(row)}
        </div>

        <div className="card">
          <div className="card-title">誰に近いか <span className="muted">— 偏りの方向がどれだけ一致するか</span></div>
          {near.map((g, i) => (
            <div key={g.id} className={`near ${i === 0 ? "top" : ""}`}>
              <span className="near-name">{GHOST_PLAYERS.find((x) => x.id === g.id)?.flag} {jaName(g.id)}</span>
              <span className="near-bar"><span style={{ width: `${sim(g.sim)}%` }} /></span>
              <span className="near-pct">{sim(g.sim)}%</span>
            </div>
          ))}
          <div className="muted small" style={{ marginTop: 8 }}>
            強さの比較ではなく「好みの向き」の比較です。物差しの確かさ：各 GM の対局を半分に分けて測り直すと、{SPLIT_HALF.of} 人中 {SPLIT_HALF.same} 人が本人に最も近いと判定されました。
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          詳細な軸 <span className="muted">— {AXES.length - 5} 項目。数字の左の <i className="ax-delta">+2</i> は前回の更新からの変化、<i className="ax-trend">↗ 直近</i> は直近 {RECENT} 局だけの値</span>
        </div>
        <div className="ax-groups">
          {AXIS_GROUPS.map((g) => (
            <div key={g} className="ax-group">
              <h4>{g}</h4>
              {AXES.filter((a) => a.group === g).map(row)}
            </div>
          ))}
        </div>
      </div>

      <div className="style-cols">
        <div className="card">
          <div className="card-title">強み <span className="muted">— あなた自身の成績から</span></div>
          {f.good.length === 0 && <div className="muted small">はっきりした強みは、この対局数ではまだ出ていません。</div>}
          {f.good.map((x) => (
            <div key={x.title} className="find good"><b>{x.title}</b><div className="small">{x.detail}</div></div>
          ))}
        </div>
        <div className="card">
          <div className="card-title">弱み <span className="muted">— と、このアプリでの直し方</span></div>
          {f.bad.length === 0 && <div className="muted small">はっきりした弱みは、この対局数ではまだ出ていません。</div>}
          {f.bad.map((x) => (
            <div key={x.title} className="find bad"><b>{x.title}</b><div className="small">{x.detail}</div>{x.fix && <div className="small fix">→ {x.fix}</div>}</div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">偏りが大きいところ <span className="muted">— GM の標準から離れている順</span></div>
        {biases.length === 0 && <div className="muted small">GM の標準から大きく外れた項目はありません。</div>}
        {biases.map(({ k, z }) => (
          <div key={k} className="bias">
            <span className="bias-name">{METRICS[k].ja}</span>
            <b>{fmt(k, p.m[k])}{METRICS[k].unit && !METRICS[k].pct ? ` ${METRICS[k].unit}` : ""}</b>
            <span className="muted small">{z > 0 ? "GM より多い" : "GM より少ない"}（GM は {gmRange(k)}）</span>
          </div>
        ))}
      </div>

      {store.history.length >= 2 && (
        <div className="card">
          <div className="card-title">更新の履歴 <span className="muted">— 総合 5 軸の動き</span></div>
          <table className="style-table">
            <thead><tr><th>更新日</th><th>対局数</th><th>近い GM</th>{AXES.filter((a) => a.group === "総合").map((a) => <th key={a.id}>{a.ja.replace(/（.*）/, "")}</th>)}</tr></thead>
            <tbody>
              {store.history.slice(-8).reverse().map((h) => (
                <tr key={h.t}>
                  <td>{new Date(h.t).toLocaleDateString("ja-JP")}</td>
                  <td>{h.n}（+{h.added}）</td>
                  <td>{jaName(h.top)}</td>
                  {AXES.filter((a) => a.group === "総合").map((a) => <td key={a.id}>{Math.round(h.axes[a.id] ?? 0)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details className="card">
        <summary className="card-title" style={{ cursor: "pointer" }}>すべての数値を見る（{Object.keys(METRICS).length} 項目）</summary>
        <table className="style-table">
          <thead><tr><th>項目</th><th>あなた</th><th>{jaName(top.id)}</th><th>GM の幅</th></tr></thead>
          <tbody>
            {(Object.keys(METRICS) as MetricKey[]).map((k) => (
              <tr key={k}><td>{METRICS[k].ja}</td><td><b>{fmt(k, p.m[k])}</b></td><td>{fmt(k, GM_STYLES[top.id][k])}</td><td className="muted">{gmRange(k)}</td></tr>
            ))}
          </tbody>
        </table>
        {p.splits.openings.length > 0 && (
          <>
            <div className="card-title" style={{ marginTop: 14 }}>型ごとの成績</div>
            <table className="style-table">
              <tbody>
                {p.splits.openings.map((o) => <tr key={o.name}><td>{o.name}</td><td>{o.n} 局</td><td><b>{pct(o.score)}</b></td></tr>)}
              </tbody>
            </table>
          </>
        )}
      </details>

      <p className="muted small">
        この診断は指し手の統計で、エンジンによる手の良し悪しは見ていません。「駒損」は捨て駒と見落としを区別できず、相手の強さも考慮しません。
        GM との比較は、GM 同士の対局と、あなたの普段の対局という条件の違いを含みます。偏りを知る目安として使ってください。
      </p>
    </div>
  );
}
