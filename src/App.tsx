import { useEffect, useState } from "react";
import { BASE } from "./lib/asset";
import AimMode, { type AimGoto } from "./modes/Aim";
import Drill from "./modes/Drill";
import Explore, { type Settings } from "./modes/Explore";
import Spar from "./modes/Spar";
import StyleMode from "./modes/Style";
import Review from "./modes/Review";
import Today from "./modes/Today";
import Trophies from "./modes/Trophies";
import { setMuted } from "./lib/sound";
import { load, save } from "./lib/storage";
import { useScrollTop } from "./lib/useScrollTop";

type Mode = "today" | "explore" | "aim" | "spar" | "self" | "drill" | "review" | "library" | "style" | "trophy";

const NAV: { id: Mode; label: string; icon: string; desc: string }[] = [
  { id: "today", label: "今日", icon: "☀️", desc: "期限が来た復習・自分のミスの傾向から、今日やることを並べる。データの書き出し・オフライン保存もここ" },
  { id: "explore", label: "探索", icon: "♞", desc: "自由に指して型を知る" },
  { id: "aim", label: "狙いドリル", icon: "⚔️", desc: "同じ狙いを違う局面で反復する" },
  { id: "spar", label: "局面練習", icon: "🥊", desc: "好きな局面を再現して、エンジン相手に何度も指す" },
  { id: "self", label: "セルフ対局", icon: "👥", desc: "白も黒も自分で指す。探索と同じ補助が全部使え、まとめて ON/OFF できる" },
  { id: "drill", label: "型ドリル", icon: "🎯", desc: "定跡の型を体で覚える" },
  { id: "review", label: "振り返り", icon: "🔍", desc: "自分の対局を再生し、ミスした局面を問題にして解く。ミスの種類を数えてドリルにつなぐ" },
  { id: "trophy", label: "図鑑", icon: "📖", desc: "名前のついた手・戦術・陣形・詰み・定跡の解説と、獲得したトロフィー（芸術点）" },
  { id: "style", label: "タイプ診断", icon: "🧬", desc: "自分の対局から、指し方の偏りと近い GM を出す" },
];

const RESETTABLE = new Set<Mode>(["today", "aim", "drill", "review", "spar", "trophy", "library", "style"]);

export default function App() {
  const [mode, setMode] = useState<Mode>(() => load("dojo.mode", "today"));
  const [aimGoto, setAimGoto] = useState<AimGoto & { nonce: number }>();
  const [drillCourse, setDrillCourse] = useState<{ id: string; nonce: number }>();
  const [reviewPuzzles, setReviewPuzzles] = useState<number>();
  // Tapping the tab you are already on goes back to that tab's start (list of drills, etc.).
  const [navNonce, setNavNonce] = useState(0);
  const [settings, setSettings] = useState<Settings>(() => load("dojo.settings", { marks: true, arrows: true, engine: true, sound: true }));
  const [openMoves, setOpenMoves] = useState<string[]>();
  const [sparFen, setSparFen] = useState<string>();
  const [sparQuick, setSparQuick] = useState<{ side: "w" | "b"; nonce: number }>();

  useEffect(() => save("dojo.mode", mode), [mode]);
  useScrollTop(mode);
  useEffect(() => {
    save("dojo.settings", settings);
    setMuted(!settings.sound);
  }, [settings]);

  const openInExplore = (moves: string[]) => {
    setOpenMoves([...moves]);
    setMode("explore");
  };
  const goAim = (g: AimGoto) => {
    setAimGoto({ ...g, nonce: Date.now() });
    setMode("aim");
  };
  const goDrill = (id: string) => {
    setDrillCourse({ id, nonce: Date.now() });
    setMode("drill");
  };
  const goSpar = (fen: string) => {
    setSparFen(fen);
    setSparQuick(undefined);
    setMode("spar");
  };

  return (
    <div className="app">
      <nav className="sidebar">
        <div className="logo">
          <img src={`${BASE}pieces/wN.svg`} alt="" />
          <span>Opening<br />Dojo</span>
        </div>
        {NAV.map((n) => (
          <button key={n.id} className={`nav ${mode === n.id || (n.id === "trophy" && mode === "library") ? "on" : ""}`} onClick={() => { if (n.id === mode && RESETTABLE.has(mode)) setNavNonce((x) => x + 1); setSparQuick(undefined); setAimGoto(undefined); setDrillCourse(undefined); setReviewPuzzles(undefined); setMode(n.id); }} title={n.desc}>
            <span className="nav-icon">{n.icon}</span>
            <span className="nav-label">{n.label}</span>
          </button>
        ))}
        <div className="sidebar-foot">型 × 線 で覚える<br />オープニング道場</div>
      </nav>
      <main className="main" key={RESETTABLE.has(mode) ? navNonce : -1}>
        {mode === "explore" && (
          <Explore
            key="explore"
            initial={openMoves}
            settings={settings}
            setSettings={setSettings}
            onSpar={(fen) => {
              setSparFen(fen);
              setMode("spar");
            }}
          />
        )}
        {mode === "spar" && <Spar key="spar" initialFen={sparFen} quick={sparQuick} />}
        {mode === "self" && (
          <Explore
            key="self"
            selfPlay
            settings={settings}
            setSettings={setSettings}
            onSpar={(fen) => {
              setSparFen(fen);
              setMode("spar");
            }}
          />
        )}
        {mode === "today" && (
          <Today
            onAim={goAim}
            onDrill={goDrill}
            onReview={(puzzles) => {
              setReviewPuzzles(puzzles ? Date.now() : undefined);
              setMode("review");
            }}
            onMode={(m) => setMode(m as Mode)}
          />
        )}
        {mode === "review" && (
          <Review key={reviewPuzzles ?? "review"} startPuzzles={reviewPuzzles} onDrill={(t) => goAim(t)} onSpar={(fen) => goSpar(fen)} onImport={() => setMode("style")} />
        )}
        {mode === "aim" && <AimMode key={aimGoto?.nonce ?? "aim"} goto={aimGoto} />}
        {mode === "drill" && <Drill key={drillCourse?.nonce ?? "drill"} initialCourse={drillCourse?.id} onExplore={openInExplore} onAim={(id) => goAim({ aim: `op:${id}`, view: "attack" })} />}
        {(mode === "trophy" || mode === "library") && <Trophies onOpen={openInExplore} />}
        {mode === "style" && (
          <StyleMode
            onClone={(side) => {
              setSparQuick({ side, nonce: Date.now() });
              setMode("spar");
            }}
          />
        )}
      </main>
    </div>
  );
}
