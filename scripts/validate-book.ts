import { Chess } from "chess.js";
import { BOOK } from "../src/data/book.ts";
let bad = 0;
for (const e of BOOK) {
  const c = new Chess();
  const mv = e.line.split(/\s+/).filter(Boolean).map((t) => t.replace(/\{[\d.]+\}$/, ""));
  for (let i = 0; i < mv.length; i++) {
    try { c.move(mv[i]); } catch { console.log("ILLEGAL", i, mv[i], "in", e.line); bad++; break; }
    const last = c.history().at(-1);
    if (last !== mv[i]) console.log("SAN-normalize", mv[i], "->", last, "in", e.line);
  }
}
console.log("entries", BOOK.length, "bad", bad);
