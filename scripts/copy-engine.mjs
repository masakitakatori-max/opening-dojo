// Copy the single-threaded lite Stockfish build into public/engine so Vite serves it.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
const src = "node_modules/stockfish/bin";
const dst = "public/engine";
if (existsSync(src)) {
  mkdirSync(dst, { recursive: true });
  for (const f of ["stockfish-18-lite-single.js", "stockfish-18-lite-single.wasm"]) copyFileSync(`${src}/${f}`, `${dst}/${f}`);
  console.log("engine copied");
}
