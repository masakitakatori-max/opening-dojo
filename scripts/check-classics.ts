// Verify that each curated famous game resolves to exactly one game in the built ghost data.
import { readFileSync } from "node:fs";
import { CLASSICS } from "../src/lib/ghosts.ts";
for (const c of CLASSICS) {
  const pd = JSON.parse(readFileSync(`public/ghosts/${c.player}.json`, "utf8"));
  const hits = pd.games.filter((g: any[]) => g[2] === c.year && g[4] === c.result && g[5].startsWith(c.prefix) && c.opp.test(g[6] === "w" ? g[1] : g[0]));
  console.log(hits.length === 1 ? "OK " : `!! ${hits.length}`, c.title, "→", hits.map((g: any[]) => `${g[0]} – ${g[1]} ${g[2]} ${g[3]} ${g[4]} (${g[5].split(" ").length} plies)`).join(" | "));
}
