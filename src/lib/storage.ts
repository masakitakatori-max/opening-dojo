export function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
export function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: progress just won't persist */
  }
}

// Leitner-style spaced repetition per drill line.
export interface LineStat { box: number; due: number; seen: number; clean: number }
export type CourseStats = Record<string, LineStat>;
const INTERVALS = [0, 10 * 60e3, 24 * 3600e3, 3 * 24 * 3600e3, 7 * 24 * 3600e3, 21 * 24 * 3600e3];

export const statsKey = (courseId: string) => `dojo.stats.${courseId}`;

export const dayKey = (t = Date.now()) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
/** Practice log: problems solved per day (for 今日の練習 and the streak). */
export function markPracticed(clean: boolean) {
  const log = load<Record<string, [number, number]>>("dojo.days", {});
  const k = dayKey();
  const [n, c] = log[k] ?? [0, 0];
  log[k] = [n + 1, c + (clean ? 1 : 0)];
  const keys = Object.keys(log).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 400))) delete log[old];
  save("dojo.days", log);
}
export function streak(): number {
  const log = load<Record<string, [number, number]>>("dojo.days", {});
  let n = 0;
  const t = Date.now();
  // Today not done yet doesn't break the streak.
  for (let i = log[dayKey(t)] ? 0 : 1; i < 400; i++) {
    if (!log[dayKey(t - i * 864e5)]) break;
    n++;
  }
  return n;
}

export function recordResult(stats: CourseStats, lineKey: string, mistakes: number): CourseStats {
  markPracticed(mistakes === 0);
  const s = stats[lineKey] ?? { box: 0, due: 0, seen: 0, clean: 0 };
  const box = mistakes === 0 ? Math.min(s.box + 1, INTERVALS.length - 1) : 1;
  const due = Date.now() + (mistakes === 0 ? INTERVALS[box] : 60e3);
  return { ...stats, [lineKey]: { box, due, seen: s.seen + 1, clean: s.clean + (mistakes === 0 ? 1 : 0) } };
}

export function pickLine<T extends { key: string }>(lines: T[], stats: CourseStats, avoid?: string): T {
  const now = Date.now();
  const pool = lines.length > 1 ? lines.filter((l) => l.key !== avoid) : lines;
  const due = pool.filter((l) => stats[l.key] && stats[l.key].due <= now).sort((a, b) => stats[a.key].box - stats[b.key].box);
  if (due.length) return due[0];
  const fresh = pool.filter((l) => !stats[l.key]);
  if (fresh.length) return fresh[Math.floor(Math.random() * fresh.length)];
  return [...pool].sort((a, b) => stats[a.key].due - stats[b.key].due)[0];
}

export const mastered = (s?: LineStat) => !!s && s.box >= 3;
