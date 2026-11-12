// Every trophy has a demo, the route to it is legal, and its last move earns the trophy.
//   node scripts/check-trophy-demos.ts
import { Chess } from "chess.js";
import { TROPHY_DEMOS } from "../src/data/trophyDemos.ts";
import { TROPHY_NOTES } from "../src/data/trophyNotes.ts";
import { detect, TROPHIES, type MoveCtx } from "../src/lib/trophies.ts";

const EXACT = new Set(["brilliant", "queenSac"]); // judged by the engine in games: here the move itself is the answer
let bad = 0;
for (const t of TROPHIES) {
  const d = TROPHY_DEMOS[t.id];
  if (!d) { console.log("NG", t.id, "見本なし"); bad++; continue; }
  if (!TROPHY_NOTES[t.id] || TROPHY_NOTES[t.id].slice(0, 4).some((x) => !x)) { console.log("NG", t.id, "解説なし"); bad++; continue; }
  try {
    const c = new Chess(d.fen);
    for (const s of d.lead ?? []) c.move(s);
    const me = c.turn();
    const own: NonNullable<MoveCtx["prevOwn"]> = [];
    let got: string[] = [];
    d.line.forEach((u, i) => {
      const m = { from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] };
      const fen = c.fen();
      if (i === d.line.length - 1) got = detect(fen, m, { prevOwn: own }).map((a) => a.id);
      if (c.turn() === me) own.push({ fenBefore: fen, move: m });
      c.move(m);
    });
    if (d.line.length % 2 === 0) { console.log("NG", t.id, "手順が相手の手で終わっている"); bad++; }
    else if (!EXACT.has(t.id) && !got.includes(t.id)) { console.log("NG", t.id, "判定:", got.join(",") || "なし"); bad++; }
  } catch (e) {
    console.log("NG", t.id, String(e).slice(0, 90)); bad++;
  }
}
const extra = Object.keys(TROPHY_DEMOS).filter((k) => !TROPHIES.some((t) => t.id === k));
console.log(`${TROPHIES.length - bad} / ${TROPHIES.length} OK`, extra.length ? `余分: ${extra}` : "");
