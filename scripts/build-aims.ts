// Build public/aims.json from the Lichess puzzle database (CC0): https://database.lichess.org/#puzzles
//   node scripts/build-aims.ts            (streams the database and stops as soon as every bucket is full)
// Columns: PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createZstdDecompress } from "node:zlib";
import { AIMS, levelOf, type AimData } from "../src/data/aims.ts";

const URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const PER_BUCKET = 50; // puzzles per aim per level
const MAX_ROWS = 1_500_000;

const want = new Set(AIMS.map((a) => a.id));
const buckets = new Map<string, number>(); // `${aim}|${level}` -> count
const out: AimData = Object.fromEntries(AIMS.map((a) => [a.id, []]));
const full = () => AIMS.every((a) => [0, 1, 2, 3].every((l) => (buckets.get(`${a.id}|${l}`) ?? 0) >= PER_BUCKET));

const res = await fetch(URL, { headers: { "User-Agent": "opening-dojo-personal/0.1" } });
if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
const src = Readable.fromWeb(res.body as never);
const rl = createInterface({ input: src.pipe(createZstdDecompress()) });
let rows = 0;
for await (const line of rl) {
  if (rows++ === 0) continue; // header
  const [id, fen, moves, rating, dev, pop, plays, themes] = line.split(",");
  const r = +rating;
  if (+pop < 85 || +plays < 300 || +dev > 95 || r < 600 || r > 2100) continue;
  const ms = moves.split(" ");
  if (ms.length < 2 || ms.length > 8) continue;
  // Board auto-queens, so skip puzzles that need an under-promotion from the solver.
  if (ms.some((m, i) => i % 2 === 1 && m.length === 5 && m[4] !== "q")) continue;
  const lvl = levelOf(r);
  for (const t of themes.split(" ")) {
    if (!want.has(t)) continue;
    const k = `${t}|${lvl}`;
    const n = buckets.get(k) ?? 0;
    if (n >= PER_BUCKET) continue;
    buckets.set(k, n + 1);
    out[t].push([id, fen, moves, r]);
  }
  if (rows % 100000 === 0) console.log(`${rows} rows…`);
  if (rows >= MAX_ROWS || (rows % 5000 === 0 && full())) break;
}
rl.close();
src.destroy();
for (const a of AIMS) {
  out[a.id].sort((x, y) => x[3] - y[3]);
  console.log(a.id.padEnd(18), [0, 1, 2, 3].map((l) => buckets.get(`${a.id}|${l}`) ?? 0).join(" / "));
}
const json = JSON.stringify(out);
writeFileSync("public/aims.json", json);
console.log(`rows read: ${rows}, size: ${(json.length / 1e6).toFixed(2)} MB`);
process.exit(0);
