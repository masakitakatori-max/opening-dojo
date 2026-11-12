// トロフィー: everything that can earn 芸術点, and what has been earned so far.
import { useEffect, useMemo, useState } from "react";
import { namedNodes, openingChain } from "../lib/tree";
import { loadLog, openingPoints, TROPHIES, type TrophyCat } from "../lib/trophies";

const CATS: TrophyCat[] = ["特別な手", "戦術", "陣形・構え", "詰みの型"];

export default function Trophies() {
  const [log, setLog] = useState(loadLog);
  useEffect(() => setLog(loadLog()), []); // the game just left saves its score as it closes
  const openings = useMemo(
    () =>
      namedNodes()
        .map((n) => ({ name: n.info!.name!, pts: openingPoints(openingChain(n).length) }))
        .filter((o, i, a) => a.findIndex((x) => x.name === o.name) === i)
        .sort((a, b) => a.pts - b.pts || a.name.localeCompare(b.name, "ja")),
    [],
  );
  const got = (id: string) => log.earned[id];
  const earnedCount = TROPHIES.filter((t) => got(t.id)).length;
  const openCount = openings.filter((o) => got(`open:${o.name}`)).length;

  return (
    <div className="picker trophy-page">
      <header className="picker-head">
        <h1>トロフィー</h1>
        <p>
          名前のついた手・陣形・詰みの型・定跡を、<strong>補助なしで</strong>自分で指すと「芸術点」が入ります。
          対象は「局面練習」と「セルフ対局」。補助が ON の間は、達成しても点は入りません（参考として表示だけされます）。同じものは 1 局に 1 回まで。
        </p>
      </header>

      <div className="trophy-summary">
        <div className="card"><div className="muted small">累計の芸術点</div><b>{log.total}</b></div>
        <div className="card"><div className="muted small">1 局の最高点</div><b>{log.best}</b></div>
        <div className="card"><div className="muted small">集めた種類</div><b>{earnedCount + openCount}<span className="muted"> / {TROPHIES.length + openings.length}</span></b></div>
      </div>

      {CATS.map((cat) => (
        <section key={cat}>
          <h3 className="picker-group">{cat}</h3>
          <div className="trophy-grid">
            {TROPHIES.filter((t) => t.cat === cat).map((t) => {
              const e = got(t.id);
              return (
                <div key={t.id} className={`trophy ${e ? "got" : ""}`}>
                  <div className="trophy-top">
                    <span className="trophy-icon">{e ? "🏆" : "🔒"}</span>
                    <span className="trophy-name">{t.ja}</span>
                    <span className="trophy-pts">+{t.pts}</span>
                  </div>
                  <div className="trophy-what">{t.what}</div>
                  <div className="muted small">{e ? `${e.n} 回達成 ・ 初回 ${new Date(e.first).toLocaleDateString("ja-JP")}` : "未達成"}</div>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <section>
        <h3 className="picker-group">型（定跡）コレクション <span className="muted small">— 自分の一手でその型に入ると獲得。{openCount} / {openings.length}</span></h3>
        <div className="trophy-openings">
          {openings.map((o) => {
            const e = got(`open:${o.name}`);
            return (
              <span key={o.name} className={`op-chip ${e ? "got" : ""}`} title={e ? `${e.n} 回` : "未達成"}>
                {o.name} <b>+{o.pts}</b>
              </span>
            );
          })}
        </div>
      </section>
    </div>
  );
}
