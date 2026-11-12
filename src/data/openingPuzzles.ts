// Puzzles that come from the openings drilled in 型ドリル (Lichess puzzle database, CC0, OpeningTags column).
// scripts/build-openings.ts fills public/openings.json; the keys are `${courseId}`.

/** Lichess OpeningTags (family or variation names) that count as each 型ドリル course. */
export const COURSE_TAGS: Record<string, string[]> = {
  ruy: ["Ruy_Lopez"],
  italian: ["Italian_Game"],
  "open-sic": ["Sicilian_Defense_Najdorf_Variation", "Sicilian_Defense_Dragon_Variation", "Sicilian_Defense_Scheveningen_Variation", "Sicilian_Defense_Classical_Variation", "Sicilian_Defense_Open", "Sicilian_Defense_Accelerated_Dragon", "Sicilian_Defense_Taimanov_Variation", "Sicilian_Defense_Kan_Variation"],
  qg: ["Queens_Gambit_Declined", "Queens_Gambit_Accepted", "Slav_Defense", "Semi-Slav_Defense"],
  london: ["Queens_Pawn_Game_London_System", "London_System"],
  najdorf: ["Sicilian_Defense_Najdorf_Variation"],
  caro: ["Caro-Kann_Defense"],
  french: ["French_Defense"],
  e5black: ["Ruy_Lopez", "Italian_Game", "Scotch_Game", "Four_Knights_Game", "Two_Knights_Defense"],
  kid: ["Kings_Indian_Defense"],
  slav: ["Slav_Defense", "Semi-Slav_Defense"],
  nimzo: ["Nimzo-Indian_Defense"],
  "fischer-w": ["Ruy_Lopez_Exchange_Variation", "Sicilian_Defense", "Caro-Kann_Defense", "French_Defense"],
  "fischer-b": ["Sicilian_Defense_Najdorf_Variation", "Kings_Indian_Defense", "Grunfeld_Defense"],
  "kasparov-b": ["Sicilian_Defense_Najdorf_Variation", "Sicilian_Defense_Scheveningen_Variation", "Grunfeld_Defense"],
  "kasparov-w": ["Scotch_Game"],
  carlsen: ["Sicilian_Defense_Lasker-Pelikan_Variation"],
  capablanca: ["Queens_Gambit_Declined"],
  kramnik: ["Ruy_Lopez_Berlin_Defense"],
  tal: ["Benoni_Defense", "Modern_Benoni"],
};

/** [id, fen, uciMoves, rating, aimId ("" when none of our aims applies)] */
export type OpeningRow = [string, string, string, number, string];
export type OpeningData = Record<string, OpeningRow[]>;
