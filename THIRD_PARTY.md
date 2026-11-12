# Third-party material

This app bundles or serves the following. Each keeps its own licence.

| What | Where in this repo | Source | Licence |
| --- | --- | --- | --- |
| Chess piece images (cburnett set, by Colin M.L. Burnett) | `public/pieces/*.svg` | https://github.com/lichess-org/chessground | CC BY-SA 3.0 |
| Stockfish 18 chess engine, WebAssembly build | copied at install time to `public/engine/` (not committed) | https://github.com/nmrugg/stockfish.js — engine source: https://github.com/official-stockfish/Stockfish | GPL-3.0 |
| Puzzles for the aim drill | `public/aims.json` (a selection made by `scripts/build-aims.ts`) | https://database.lichess.org/#puzzles | CC0 1.0 |
| Game records of nine grandmasters | `public/ghosts/*.json` (built by `scripts/build-ghosts.ts`), style statistics in `src/data/gmStyles.ts` | https://www.pgnmentor.com/files.html | game scores as published by the source |
| chess.js (move generation and rules) | npm dependency | https://github.com/jhlywa/chess.js | BSD-2-Clause |
| React, Vite | npm dependencies | https://react.dev, https://vite.dev | MIT |

The engine runs as a separate program in a Web Worker and talks to the app over the UCI text protocol.
Its unmodified source and build are available from the links above.
