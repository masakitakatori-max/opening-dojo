// 今日の練習: what is due today across every drill, where you left off, and your data (backup, offline).
import { useEffect, useRef, useState } from "react";
import { AIMS } from "../data/aims";
import { COURSES } from "../data/courses";
import { download, lastBackup, restore, usage } from "../lib/backup";
import { allPuzzles, KIND_INFO, REVIEW_STATS_KEY, tally } from "../lib/gameReview";
import { offlineStatus, offlineSupported, saveOffline } from "../lib/offline";
import { dayKey, load, statsKey, streak, type CourseStats } from "../lib/storage";
import type { AimGoto } from "./Aim";

interface Props {
  onAim: (g: AimGoto) => void;
  onDrill: (courseId: string) => void;
  onReview: (puzzles: boolean) => void;
  onMode: (mode: string) => void;
}

const dueIn = (st: CourseStats, now = Date.now()) => Object.values(st).filter((s) => s.due <= now).length;
const aimJa = (id: string) => (id === "mix" ? "ミックス" : id.startsWith("op:") ? COURSES.find((c) => c.id === id.slice(3))?.title ?? "型" : AIMS.find((a) => a.id === id)?.ja ?? id);
const ago = (t: number) => {
  const m = Math.round((Date.now() - t) / 60000);
  return m < 60 ? `${Math.max(1, m)} 分前` : m < 1440 ? `${Math.round(m / 60)} 時間前` : `${Math.round(m / 1440)} 日前`;
};

export default function Today({ onAim, onDrill, onReview, onMode }: Props) {
  const now = Date.now();
  const puzzles = allPuzzles();
  const rStats = load<CourseStats>(REVIEW_STATS_KEY, {});
  const rDue = puzzles.filter((p) => rStats[p.key] && rStats[p.key].due <= now).length;
  const rFresh = puzzles.filter((p) => !rStats[p.key]).length;
  const aimDue = dueIn(load<CourseStats>("dojo.aim.stats", {}));
  const threatDue = dueIn(load<CourseStats>("dojo.threat.stats", {}));
  const courseDue = COURSES.map((c) => ({ c, n: dueIn(load<CourseStats>(statsKey(c.id), {})) })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n);
  const t = tally();
  const weak = t.kinds.find((k) => KIND_INFO[k.kind].view !== "spar");
  const weakAim = weak ? Object.entries(weak.aims).sort((a, b) => b[1] - a[1])[0]?.[0] ?? KIND_INFO[weak.kind].aim : undefined;
  const lastAim = load<{ aim: string; view: "attack" | "threat"; t: number } | null>("dojo.last.aim", null);
  const lastDrill = load<{ id: string; t: number } | null>("dojo.last.drill", null);
  const lastCourse = lastDrill ? COURSES.find((c) => c.id === lastDrill.id) : undefined;
  const log = load<Record<string, [number, number]>>("dojo.days", {});
  const [todayN, todayClean] = log[dayKey()] ?? [0, 0];
  const days = streak();
  const week = Array.from({ length: 14 }, (_, i) => {
    const k = dayKey(now - (13 - i) * 864e5);
    return { k, n: log[k]?.[0] ?? 0 };
  });
  const maxDay = Math.max(1, ...week.map((d) => d.n));

  const menu: { icon: string; title: string; sub: string; n?: number; go: () => void }[] = [];
  if (rDue + rFresh > 0) menu.push({ icon: "🔁", title: "自分のミスを解く", sub: `期限 ${rDue} 問・未挑戦 ${rFresh} 問。自分の対局のミスが一番の教材。`, n: rDue + Math.min(rFresh, 5), go: () => onReview(true) });
  if (weak && weakAim) {
    const info = KIND_INFO[weak.kind];
    menu.push({ icon: info.view === "threat" ? "🛡" : "⚔️", title: `重点：${info.ja}`, sub: `あなたの対局で一番多いミス（${weak.n} 回）。${info.view === "threat" ? "相手の狙いを見抜く" : "狙いドリル"}の「${aimJa(weakAim)}」で鍛える。`, go: () => onAim({ aim: weakAim, view: info.view as "attack" | "threat" }) });
  }
  if (aimDue > 0) menu.push({ icon: "⚔️", title: "狙いドリルの復習", sub: `間違えた問題・期限が来た問題 ${aimDue} 問（ミックスで出題）。`, n: aimDue, go: () => onAim({ aim: "mix", view: "attack" }) });
  if (threatDue > 0) menu.push({ icon: "🛡", title: "相手の狙いの復習", sub: `期限 ${threatDue} 問。`, n: threatDue, go: () => onAim({ aim: "mix", view: "threat" }) });
  for (const x of courseDue.slice(0, 3)) menu.push({ icon: "🎯", title: `型ドリル：${x.c.title}`, sub: `復習の期限が来た手順 ${x.n} 本。`, n: x.n, go: () => onDrill(x.c.id) });
  if (!menu.length) menu.push({ icon: "🎲", title: "狙いドリル（ミックス）", sub: "期限の来た復習はありません。狙いを伏せたミックスで実戦の目を鍛える。", go: () => onAim({ aim: "mix", view: "attack" }) });

  return (
    <div className="picker">
      <header className="picker-head">
        <h1>今日の練習</h1>
        <p>
          期限が来た復習と、あなたのミスの傾向から、今日やることを並べました。<strong>上から順に</strong>やれば十分です。
        </p>
        <div className="today-stats">
          <span className="today-stat"><b>{todayN}</b> 問<small>今日（ノーミス {todayClean}）</small></span>
          <span className="today-stat"><b>{days}</b> 日<small>連続</small></span>
          <span className="today-week" title="直近 14 日に解いた数">
            {week.map((d) => <i key={d.k} style={{ height: `${4 + (d.n / maxDay) * 26}px`, opacity: d.n ? 1 : 0.25 }} />)}
          </span>
        </div>
      </header>

      <h3 className="picker-group">今日のメニュー</h3>
      <div className="today-menu">
        {menu.map((m, i) => (
          <button key={i} className="course today-item" onClick={m.go}>
            <span className="today-icon">{m.icon}</span>
            <span className="today-body">
              <span className="course-title">{m.title}</span>
              <span className="course-sub">{m.sub}</span>
            </span>
            {m.n !== undefined && <span className="today-n">{m.n}</span>}
          </button>
        ))}
      </div>

      {(lastAim || lastCourse) && (
        <>
          <h3 className="picker-group">続きから</h3>
          <div className="course-grid">
            {lastAim && (
              <button className="course" onClick={() => onAim({ aim: lastAim.aim, view: lastAim.view })}>
                <div className="course-title">{lastAim.view === "threat" ? "🛡 相手の狙い" : "⚔️ 狙いドリル"}：{aimJa(lastAim.aim)}</div>
                <div className="course-sub">{ago(lastAim.t)}</div>
              </button>
            )}
            {lastCourse && lastDrill && (
              <button className="course" onClick={() => onDrill(lastCourse.id)}>
                <div className="course-title">🎯 型ドリル：{lastCourse.title}</div>
                <div className="course-sub">{ago(lastDrill.t)}</div>
              </button>
            )}
          </div>
        </>
      )}

      {!puzzles.length && (
        <div className="card" style={{ marginTop: 18 }}>
          <b>自分の対局を取り込むと、メニューが賢くなります。</b>
          <div className="small muted">タイプ診断で chess.com / Lichess の対局を取り込み → 振り返りで分析すると、あなたのミスが問題になり、ミスの多い種類のドリルが毎日ここに出ます。</div>
          <div className="fb-actions">
            <button onClick={() => onMode("style")}>タイプ診断へ</button>
            <button onClick={() => onReview(false)}>振り返りへ</button>
          </div>
        </div>
      )}

      <DataCard />
    </div>
  );
}

function DataCard() {
  const [msg, setMsg] = useState<string>();
  const [mode, setMode] = useState<"merge" | "replace">("merge");
  const [off, setOff] = useState<{ have: number; total: number }>();
  const [busy, setBusy] = useState<string>();
  const file = useRef<HTMLInputElement>(null);
  const last = lastBackup();
  useEffect(() => {
    if (offlineSupported()) void offlineStatus().then(setOff).catch(() => undefined);
  }, []);

  return (
    <>
      <h3 className="picker-group">データ</h3>
      <div className="course-grid">
        <div className="card">
          <div className="card-title">書き出し・読み込み</div>
          <div className="small">
            進み具合（ドリルの復習予定・トロフィー・取り込んだ対局・分析など）は、この端末のブラウザの中だけにあります。
            Mac ⇄ iPhone の移動や、iPhone の Safari が長く使わないサイトのデータを消したときのために、ファイルに書き出しておけます。
          </div>
          <div className="muted small" style={{ marginTop: 4 }}>使用量 約 {Math.round(usage() / 1024)} KB ・ 最後の書き出し {last ? new Date(last).toLocaleDateString("ja-JP") : "なし"}</div>
          <div className="fb-actions">
            <button className="primary" onClick={() => setMsg(`${download()} 項目を書き出しました。iPhone なら「ファイル」アプリに保存されます。`)}>⬇ 書き出す</button>
            <button onClick={() => file.current?.click()}>⬆ 読み込む</button>
            <select value={mode} onChange={(e) => setMode(e.target.value as "merge" | "replace")} className="chip">
              <option value="merge">今のデータに足す</option>
              <option value="replace">今のデータを置き換える</option>
            </select>
          </div>
          <input
            ref={file}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              if (mode === "replace" && !confirm("今のこの端末のデータを、ファイルの内容で置き換えます。よろしいですか？")) return;
              try {
                const n = await restore(f, mode);
                setMsg(`${n} 項目を読み込みました。画面を読み込み直します…`);
                setTimeout(() => location.reload(), 900);
              } catch (err) {
                setMsg((err as Error).message);
              }
            }}
          />
          {msg && <div className="small" style={{ marginTop: 8 }}>{msg}</div>}
        </div>
        <div className="card">
          <div className="card-title">オフライン</div>
          {offlineSupported() ? (
            <>
              <div className="small">一度開いた画面はオフラインでも動きます。GM のゴースト（約 15 MB）・問題・エンジンもまとめて保存しておくと、地下や電車でも全部使えます。</div>
              {off && <div className="muted small" style={{ marginTop: 4 }}>保存済み {off.have}/{off.total} ファイル{off.have === off.total ? " ✓ オフライン準備完了" : ""}</div>}
              <div className="fb-actions">
                <button
                  className={off && off.have === off.total ? "" : "primary"}
                  disabled={!!busy}
                  onClick={async () => {
                    try {
                      await saveOffline((k, n) => setBusy(`保存中… ${k}/${n}`), !!off && off.have === off.total);
                      setBusy(undefined);
                      setOff(await offlineStatus());
                    } catch (err) {
                      setBusy((err as Error).message);
                    }
                  }}
                >
                  {busy ?? (off && off.have === off.total ? "もう一度保存（更新）" : "⬇ オフライン用に全部保存")}
                </button>
              </div>
              <div className="muted small" style={{ marginTop: 6 }}>iPhone は Safari の共有ボタン →「ホーム画面に追加」で、アプリのように全画面で開けます。</div>
            </>
          ) : (
            <div className="small muted">このブラウザはオフライン保存に対応していません。</div>
          )}
        </div>
      </div>
    </>
  );
}
