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

export function recordResult(stats: CourseStats, lineKey: string, mistakes: number): CourseStats {
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
