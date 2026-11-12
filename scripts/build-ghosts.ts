// Build the GM "ghost" data from PGN collections (e.g. https://www.pgnmentor.com/players/<Name>.zip).
//   node scripts/build-ghosts.ts <dir-with-pgn-files> [out-dir=public/ghosts]
// Per player: games as compact rows + an index  positionHash -> [gameIdx, ply, ...]  for the first INDEX_PLIES plies.
import { Chess } from "chess.js";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { INDEX_PLIES, posHash } from "../src/lib/poshash.ts";

const PLAYERS = ["Fischer", "Kasparov", "Carlsen", "Capablanca", "Morphy", "Tal", "Karpov", "Alekhine", "Petrosian"];
// Fast time controls say little about how a GM really treats a position.
const SKIP_EVENT = /blitz|bullet|speed|banter|rapid|armageddon|chess\.com|lichess|chess24|titled|online|simul|blind|odds|exhibition|freestyle|960|fischer random/i;
const MIN_PLIES = 16;

const [srcDir, outDir = "public/ghosts"] = process.argv.slice(2);
if (!srcDir) throw new Error("usage: node scripts/build-ghosts.ts <pgn-dir> [out-dir]");
mkdirSync(outDir, { recursive: true });
const manifest: { id: string; games: number }[] = [];

for (const name of PLAYERS) {
  const file = join(srcDir, `${name}.pgn`);
  if (!existsSync(file)) {
    console.log("skip (no file):", name);
    continue;
  }
  const text = readFileSync(file, "latin1").replace(/\r/g, "");
  const chunks = text.split(/\n(?=\[Event )/);
  const tag = (g: string, t: string) => g.match(new RegExp(`\\[${t} "([^"]*)"\\]`))?.[1] ?? "";
  // The collection's player = most frequent name.
  const freq = new Map<string, number>();
  for (const g of chunks) for (const t of ["White", "Black"]) freq.set(tag(g, t), (freq.get(tag(g, t)) ?? 0) + 1);
  const gm = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];

  const games: [string, string, number, string, string, string, "w" | "b"][] = [];
  const idx: Record<string, number[]> = {};
  const seen = new Set<string>();
  let bad = 0, skipped = 0;
  for (const g of chunks) {
    const white = tag(g, "White"), black = tag(g, "Black"), result = tag(g, "Result"), event = tag(g, "Event");
    if (/\[(FEN|SetUp) /.test(g) || SKIP_EVENT.test(event) || (white !== gm && black !== gm) || !["1-0", "0-1", "1/2-1/2"].includes(result)) {
      skipped++;
      continue;
    }
    const c = new Chess();
    try {
      c.loadPgn(g);
    } catch {
      bad++;
      continue;
    }
    const hist = c.history({ verbose: true });
    if (hist.length < MIN_PLIES) {
      skipped++;
      continue;
    }
    const moves = hist.map((m) => m.san).join(" ");
    if (seen.has(moves)) continue;
    seen.add(moves);
    const gi = games.length;
    const short = (n: string) => n.replace(/,\s*/, ", ").replace(/\s+/g, " ").trim();
    games.push([short(white), short(black), +tag(g, "Date").slice(0, 4) || 0, event, result, moves, white === gm ? "w" : "b"]);
    for (let p = 0; p < Math.min(INDEX_PLIES, hist.length); p++) (idx[posHash(hist[p].before)] ??= []).push(gi, p);
  }
  const id = name.toLowerCase();
  const json = JSON.stringify({ id, gm, games, idx });
  writeFileSync(join(outDir, `${id}.json`), json);
  manifest.push({ id, games: games.length });
  console.log(`${name}: ${games.length} games (skipped ${skipped}, unparsable ${bad}), ${Object.keys(idx).length} positions, ${(json.length / 1e6).toFixed(1)} MB`);
}
writeFileSync(join(outDir, "index.json"), JSON.stringify(manifest));
