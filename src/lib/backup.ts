// All progress lives in this browser's localStorage under "dojo.*". Export it as one file and read
// it back on another device (or after iOS Safari has cleared site data).
const PREFIX = "dojo.";
const FORMAT = "opening-dojo-backup";

export interface Backup {
  format: typeof FORMAT;
  version: 1;
  savedAt: string;
  data: Record<string, string>;
}

export function collect(): Backup {
  const data: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) data[k] = localStorage.getItem(k) ?? "";
  }
  return { format: FORMAT, version: 1, savedAt: new Date().toISOString(), data };
}

export function download() {
  const b = collect();
  const blob = new Blob([JSON.stringify(b)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  a.href = url;
  a.download = `opening-dojo-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  localStorage.setItem("dojo.backup.at", JSON.stringify(Date.now()));
  return Object.keys(b.data).length;
}

/** Read a backup file. "replace" wipes current progress first; "merge" keeps keys the file doesn't have. */
export async function restore(file: File, mode: "replace" | "merge"): Promise<number> {
  let b: Backup;
  try {
    b = JSON.parse(await file.text());
  } catch {
    throw new Error("ファイルを読めませんでした（JSON ではありません）。");
  }
  if (b?.format !== FORMAT || typeof b.data !== "object") throw new Error("Opening Dojo のバックアップファイルではありません。");
  const keys = Object.keys(b.data).filter((k) => k.startsWith(PREFIX));
  if (mode === "replace") {
    const old: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) old.push(k);
    }
    old.forEach((k) => localStorage.removeItem(k));
  }
  for (const k of keys) localStorage.setItem(k, b.data[k]);
  return keys.length;
}

export const lastBackup = (): number | undefined => {
  try {
    return JSON.parse(localStorage.getItem("dojo.backup.at") ?? "null") ?? undefined;
  } catch {
    return undefined;
  }
};

/** Bytes used by this app in localStorage (rough). */
export function usage() {
  let n = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(PREFIX)) n += k.length + (localStorage.getItem(k)?.length ?? 0);
  }
  return n * 2;
}
