// Build public/openings.json: puzzles that arise from the openings drilled in 型ドリル.
//   node scripts/build-openings.ts
// Lichess puzzle database (CC0). The OpeningTags column is set for puzzles from the early game.
// Only puzzles where the solver plays the course's side are kept (your opening, your tactic).
import { writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import { Readable } from "node:stream";
import { createZstdDecompress } from "node:zlib";
import { AIMS, levelOf } from "../src/data/aims.ts";
import { COURSES } from "../src/data/courses.ts";
import { COURSE_TAGS, type OpeningData } from "../src/data/openingPuzzles.ts";

const URL = "https://database.lichess.org/lichess_db_puzzle.csv.zst";
const PER_LEVEL = 12;
const MAX_ROWS = 4_000_000;
const sideOf = Object.fromEntries(COURSES.map((c) => [c.id, c.side]));
const ids = Object.keys(COURSE_TAGS);
const out: OpeningData = Object.fromEntries(ids.map((id) => [id, []]));
const count = new Map<string, number>();
const full = () => ids.every((id) => [0, 1, 2, 3].every((l) => (count.get(`${id}|${l}`) ?? 0) >= PER_LEVEL));
const aimOrder = AIMS.map((a) => a.id);

const res = await fetch(URL, { headers: { "User-Agent": "opening-dojo-personal/0.1" } });
if (!res.ok || !res.body) throw new Error(`download failed: ${res.status}`);
const src = Readable.fromWeb(res.body as never);
const rl = createInterface({ input: src.pipe(createZstdDecompress()) });
let rows = 0;
for await (const line of rl) {
  if (rows++ === 0) continue;
  const [id, fen, moves, rating, dev, pop, plays, themes, , tags] = line.split(",");
  if (!tags) continue;
  const r = +rating;
  if (+pop < 80 || +plays < 200 || +dev > 100 || r < 600 || r > 2100) continue;
  const ms = moves.split(" ");
  if (ms.length < 2 || ms.length > 8) continue;
  if (ms.some((m, i) => i % 2 === 1 && m.length === 5 && m[4] !== "q")) continue;
  const solver = fen.split(" ")[1] === "w" ? "b" : "w";
  const tagSet = new Set(tags.split(" "));
  const th = new Set(themes.split(" "));
  const aim = aimOrder.find((a) => th.has(a)) ?? "";
  const lvl = levelOf(r);
  for (const cid of ids) {
    if (sideOf[cid] !== solver) continue;
    if (!COURSE_TAGS[cid].some((t) => tagSet.has(t))) continue;
    const k = `${cid}|${lvl}`;
    if ((count.get(k) ?? 0) >= PER_LEVEL) continue;
    count.set(k, (count.get(k) ?? 0) + 1);
    out[cid].push([id, fen, moves, r, aim]);
  }
  if (rows % 200000 === 0) console.log(`${rows} rows…`);
  if (rows >= MAX_ROWS || (rows % 5000 === 0 && full())) break;
}
rl.close();
src.destroy();
for (const id of ids) {
  out[id].sort((a, b) => a[3] - b[3]);
  console.log(id.padEnd(12), [0, 1, 2, 3].map((l) => count.get(`${id}|${l}`) ?? 0).join(" / "));
}
const json = JSON.stringify(out);
writeFileSync("public/openings.json", json);
console.log(`rows read: ${rows}, size: ${(json.length / 1e6).toFixed(2)} MB`);
process.exit(0);
