// A position for every trophy where the named move or pattern can be played out.
// `line` = moves in UCI, the player's move first, then the opponent's reply, and so on.
// The last move of the line is the one that earns the trophy (checked with the same detector as in games).
export interface TrophyDemo {
  fen: string;
  line: string[];
  tip?: string;
}

export const TROPHY_DEMOS: Record<string, TrophyDemo> = {
  // 特別な手
  castle: { fen: "r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4", line: ["e1g1"], tip: "キングを 2 マス右へ。ルークが飛び越えて隣に来ます。" },
  castleLong: { fen: "r3kbnr/ppp1pppp/2nq4/3p1b2/3P1B2/2N5/PPPQPPPP/R3KBNR w KQkq - 6 5", line: ["e1c1"], tip: "キングを 2 マス左へ。" },
  oppositeCastle: { fen: "r1bq1rk1/ppp1bppp/2np1n2/4p3/2B1P3/2NPBN2/PPPQ1PPP/R3K2R w KQ - 4 8", line: ["e1c1"], tip: "黒はキング側に囲っています。白は反対のクイーン側へ。" },
  enPassant: { fen: "rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3", line: ["e5f6"], tip: "黒の f ポーンが 2 マス進んで横に並んだ直後。e5 のポーンで、f6 に進みながら取れます。" },
  promotion: { fen: "8/4P1k1/8/8/8/8/6K1/8 w - - 0 50", line: ["e7e8q"], tip: "ポーンを最終段へ。" },
  brilliant: { fen: "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5", line: ["f3e5"], tip: "ナイトが動くとクイーンを取られます。それでも e5 のポーンを取るのが好手（取られたら Bxf7+ から詰み）。" },

  // 戦術
  pin: { fen: "4k3/pp3ppp/8/4n3/8/8/PP3PPP/R5K1 w - - 0 30", line: ["a1e1"], tip: "ナイトの後ろにキングがいます。同じ列にルークを。" },
  fork: { fen: "r3k3/pp3ppp/8/3N4/8/8/PP3PPP/6K1 w - - 0 30", line: ["d5c7"], tip: "ナイトでキングとルークを同時に。" },
  royalFork: { fen: "q3k3/pp3ppp/8/3N4/8/8/PP3PPP/6K1 w - - 0 30", line: ["d5c7"], tip: "ナイトでキングとクイーンを同時に。" },
  skewer: { fen: "4k2r/8/8/8/8/8/1P3PPP/R5K1 w - - 0 30", line: ["a1a8"], tip: "キングにチェック。逃げたら、その後ろのルークが取れます。" },
  discovered: { fen: "4k3/pp3ppp/8/8/8/4N3/PP3PPP/4R1K1 w - - 0 30", line: ["e3c4"], tip: "ナイトをどかすと、後ろのルークのチェックになります。" },
  doubleCheck: { fen: "4k3/pp3ppp/8/8/4N3/8/PP3PPP/4R1K1 w - - 0 30", line: ["e4d6"], tip: "ナイト自身もチェックになるマスへどかします。" },
  greekGift: { fen: "r1bq1rk1/pppn1ppp/4p3/3pP3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQ - 0 8", line: ["d3h7"], tip: "ビショップを h7 に捨てます。" },

  // 陣形・構え
  fianchetto: { fen: "rnbqkbnr/pppppppp/8/8/8/6P1/PPPPPP1P/RNBQKBNR w KQkq - 0 2", line: ["f1g2"], tip: "g3 を突いた後、ビショップを g2 へ。" },
  doubleFianchetto: { fen: "rnbqkbnr/pppppppp/8/8/8/1P4P1/P1PPPPBP/RNBQK1NR w KQkq - 0 4", line: ["c1b2"], tip: "もう 1 枚のビショップも b2 へ。" },
  modelOpening: { fen: "r1bq1rk1/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPPB1PPP/R2QK2R w KQ - 6 7", line: ["e1g1"], tip: "小駒は 4 枚とも出ています。あとは囲うだけ。" },
  connected: { fen: "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/R2Q1RK1 w - - 0 15", line: ["d1d2"], tip: "ルークの間にいるクイーンをどかします。" },
  rook7: { fen: "6k1/pp3ppp/8/8/8/8/PP3PPP/3R2K1 w - - 0 30", line: ["d1d7"], tip: "ルークを 7 段目へ。" },
  pigs: { fen: "6k1/1R3ppp/8/8/8/8/5PPP/3R2K1 w - - 0 30", line: ["d1d7"], tip: "2 枚目のルークも 7 段目へ。" },
  outpost: { fen: "r2q1rk1/pp3ppp/3p4/4p3/4P3/2N5/PPP2PPP/R2Q1RK1 w - - 0 15", line: ["c3d5"], tip: "d5 は e4 のポーンが守り、黒のポーンには追い払えません。" },
  passed: { fen: "6k1/5ppp/8/8/3P4/8/5PPP/6K1 w - - 0 30", line: ["d4d5"], tip: "止める黒ポーンがいない d ポーンを 5 段目へ。" },
  london: { fen: "rnbqkbnr/pppppppp/8/8/3P1B2/4P3/PPP2PPP/RN1QKBNR w KQkq - 0 4", line: ["g1f3"], tip: "Bf4・d4・e3 は済み。最後に Nf3。" },
  kingsIndian: { fen: "rnbqkbnr/pppppppp/8/8/8/3P1NP1/PPP1PPBP/RNBQK2R w KQkq - 0 5", line: ["e1g1"], tip: "Nf3・g3・Bg2・d3 は済み。囲えば完成。" },
  stonewall: { fen: "rnbqkbnr/pppppppp/8/8/3P1P2/4P3/PPP3PP/RNBQKBNR w KQkq - 0 4", line: ["c2c3"], tip: "d4・e3・f4 は済み。c3 で壁が完成。" },
  maroczy: { fen: "r1bqkbnr/pp1ppp1p/2n3p1/8/3NP3/8/PPP2PPP/RNBQKB1R w KQkq - 0 5", line: ["c2c4"], tip: "e4 に加えて c4 を突き、d5 を押さえ込みます。" },
  hedgehog: { fen: "rnbqkb1r/1p3ppp/p2ppn2/8/2PNP3/2N5/PP2BPPP/R1BQ1RK1 b kq - 0 7", line: ["b7b6"], tip: "黒番。a6・d6・e6 は済み。b6 で針ねずみの完成。" },
  gun: { fen: "3r2k1/pp3ppp/8/8/8/3R4/PP1R1PPP/5QK1 w - - 0 25", line: ["f1d1"], tip: "d 列のルーク 2 枚の後ろに、クイーンを並べます。" },

  // 詰みの型
  mate: { fen: "k7/8/1K6/8/8/8/8/7Q w - - 0 50", line: ["h1h8"], tip: "クイーンを最上段へ。" },
  scholar: { fen: "r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4", line: ["h5f7"], tip: "ビショップが守っている f7 を、クイーンで取ります。" },
  fools: { fen: "rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq g3 0 2", line: ["d8h4"], tip: "黒番。白が f3 と g4 を突いて、キングへの斜めの道が開いています。" },
  kiss: { fen: "7k/8/5K2/8/8/8/8/6Q1 w - - 0 50", line: ["g1g7"], tip: "キングに守られたマスへ、クイーンを相手キングの隣に。" },
  backRank: { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 30", line: ["a1a8"], tip: "黒キングは自分のポーン 3 枚に閉じ込められています。" },
  ladder: { fen: "7k/R7/8/8/8/8/8/1R4K1 w - - 0 40", line: ["b1b8"], tip: "7 段目はもう押さえています。もう 1 枚で 8 段目を。" },
  knightMate: { fen: "7k/6pp/7N/4N3/8/8/8/6K1 w - - 0 40", line: ["e5f7"], tip: "h6 のナイトが g8 を押さえています。もう 1 枚のナイトでチェックを。" },
  pawnMate: { fen: "7k/5K2/5NP1/8/8/8/8/8 w - - 0 50", line: ["g6g7"], tip: "ポーンを 1 つ進めるとチェック。逃げ道は全部ふさがっています。" },
  doubleCheckMate: { fen: "3qkb2/3p1p2/8/8/4N3/8/8/4RK2 w - - 0 30", line: ["e4f6"], tip: "ナイトをチェックになるマスへ。ルークのチェックも同時にかかります。" },
  epaulette: { fen: "3rkr2/8/8/8/8/8/4Q3/6K1 w - - 0 40", line: ["e2e6"], tip: "黒キングの両隣は自分のルーク。正面からクイーンで。" },
  arabian: { fen: "7k/R7/5N2/8/8/8/8/6K1 w - - 0 40", line: ["a7h7"], tip: "ナイトが守る h7 に、ルークを。" },
  anastasia: { fen: "8/4N1pk/8/8/8/8/6K1/3R4 w - - 0 40", line: ["d1h1"], tip: "ナイトが g6 と g8 を押さえています。ルークを h 列へ。" },
  boden: { fen: "2kr4/pp1n1ppp/2p5/8/5B2/5Q2/8/4KB2 w - - 0 20", line: ["f3c6", "b7c6", "f1a6"], tip: "まずクイーンを c6 に捨てて、b ポーンに取らせます。" },
  legal: { fen: "rn1qkbnr/ppp2p1p/3p2p1/4p3/2B1P1b1/2N2N2/PPPP1PPP/R1BQK2R w KQkq - 0 5", line: ["f3e5", "g4d1", "c4f7", "e8e7", "c3d5"], tip: "ナイトで e5 を取り、クイーンを取らせます。そこから Bxf7+、Nd5 の 3 手詰め。" },
  smothered: { fen: "5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 30", line: ["c4g8", "f8g8", "h6f7"], tip: "クイーンを g8 に捨てて、ルークに取らせます（フィリドールの遺産）。" },
  castleMate: { fen: "rn3r2/pbppq1p1/1p2pN2/8/3P2NP/6P1/PPP1BP1R/R3K1k1 w Q - 5 18", line: ["e1c1"], tip: "Ed. ラスカー対トーマス（1912）の最終局面。黒キングは白陣まで引きずり出されています。" },
};
