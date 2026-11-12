// One replay speed for every automatic replay (main line, demos, the moves of a followed game).
// Stored per browser and shared live between components.
import { useEffect, useState } from "react";
import { load, save } from "./storage";

const KEY = "dojo.replay.ms";
const MIN = 400, MAX = 3500, DEFAULT = 1500;
const EVENT = "dojo-replay-speed";

export function useReplaySpeed(): [number, (ms: number) => void] {
  const [ms, setMs] = useState<number>(() => load(KEY, DEFAULT));
  useEffect(() => {
    const on = (e: Event) => setMs((e as CustomEvent<number>).detail);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, []);
  const set = (v: number) => {
    save(KEY, v);
    setMs(v);
    window.dispatchEvent(new CustomEvent(EVENT, { detail: v }));
  };
  return [ms, set];
}

// The slider runs on a log scale, so the slow end has as much room as the fast end.
const toPos = (ms: number) => Math.round((100 * Math.log(MAX / ms)) / Math.log(MAX / MIN));
const toMs = (pos: number) => Math.round(MAX * (MIN / MAX) ** (pos / 100) / 50) * 50;

export function SpeedSlider({ compact }: { compact?: boolean }) {
  const [ms, setMs] = useReplaySpeed();
  return (
    <label className={`speed ${compact ? "compact" : ""}`} title="自動再生の速さ">
      <span className="speed-end">ゆっくり</span>
      <input type="range" min={0} max={100} value={toPos(ms)} onChange={(e) => setMs(toMs(+e.target.value))} aria-label="再生の速さ" />
      <span className="speed-end">はやい</span>
      <span className="speed-val">1 手 {(ms / 1000).toFixed(1)} 秒</span>
    </label>
  );
}
