// A demo for every trophy: where it starts, the moves that lead to the moment, and the move(s) to play.
//  - `fen`  : starting position (default: the initial position)
//  - `lead` : SAN moves played automatically to reach the moment (the route to the formation)
//  - `line` : UCI moves from the moment — the player's move first, then the reply, and so on.
//             The last move earns the trophy (checked against the same detector used in games).
export interface TrophyDemo {
  fen?: string;
  lead?: string[];
  line: string[];
  tip?: string;
  source?: string; // a famous game the route comes from
  show?: string[]; // squares that make up the formation (highlighted by the assist)
}

const L = (s: string) => s.split(" ");

export const TROPHY_DEMOS: Record<string, TrophyDemo> = {
  // ── 特別な手 ──
  castle: { lead: L("e4 e5 Nf3 Nc6 Bc4 Bc5"), line: ["e1g1"], tip: "キングを 2 マス右へ。ルークが飛び越えて隣に来ます。" },
  castleLong: { lead: L("d4 d5 Bf4 Bf5 Nc3 Nc6 Qd2 Qd6"), line: ["e1c1"], tip: "キングを 2 マス左へ。" },
  oppositeCastle: { lead: L("e4 e5 Nf3 Nc6 Bc4 Nf6 d3 Be7 Nc3 d6 Be3 O-O Qd2 a6"), line: ["e1c1"], tip: "黒はキング側に囲いました。白は反対のクイーン側へ。" },
  enPassant: { lead: L("e4 a6 e5 f5"), line: ["e5f6"], tip: "黒の f ポーンが 2 マス進んで横に並んだ直後。e5 のポーンで、f6 に進みながら取れます。" },
  promotion: { fen: "8/6k1/4P3/8/8/8/6K1/8 w - - 0 50", lead: L("e7 Kg6"), line: ["e7e8q"], tip: "ポーンを最終段へ。" },
  underPromotion: { fen: "8/4P3/5k2/8/8/8/8/4K3 w - - 0 50", line: ["e7e8n"], tip: "クイーンではなくナイトに昇格させると、チェックになります（昇格する駒を選べます）。" },

  // ── 戦術 ──
  fork: { fen: "r3k3/pp3ppp/8/3N4/8/8/PP3PPP/6K1 w - - 0 30", line: ["d5c7"], tip: "ナイトでキングとルークを同時に。" },
  pawnFork: { fen: "4k3/8/8/2n1b3/8/2PP4/8/4K3 w - - 0 30", line: ["d3d4"], tip: "ポーンを 1 つ進めて、ナイトとビショップを両取り。" },
  royalFork: { fen: "q3k3/pp3ppp/8/3N4/8/8/PP3PPP/6K1 w - - 0 30", line: ["d5c7"], tip: "ナイトでキングとクイーンを同時に。" },
  familyFork: { fen: "r3k3/8/4q3/3N4/8/8/8/7K w - - 0 30", line: ["d5c7"], tip: "ナイト 1 頭で、キング・クイーン・ルークの「一家」を全部狙います。" },
  pin: { fen: "4k3/pp3ppp/8/4n3/8/8/PP3PPP/R5K1 w - - 0 30", line: ["a1e1"], tip: "ナイトの後ろにキングがいます。同じ列にルークを。" },
  skewer: { fen: "4k2r/8/8/8/8/8/1P3PPP/R5K1 w - - 0 30", line: ["a1a8"], tip: "キングにチェック。逃げたら、その後ろのルークが取れます。" },
  discoveredAttack: { fen: "3q2k1/5ppp/8/8/3N4/8/5PPP/3Q2K1 w - - 0 25", line: ["d4b5"], tip: "ナイトをどかすと、後ろのクイーンの利きが黒のクイーンに通ります。" },
  discovered: { fen: "4k3/pp3ppp/8/8/8/4N3/PP3PPP/4R1K1 w - - 0 30", line: ["e3c4"], tip: "ナイトをどかすと、後ろのルークのチェックになります。" },
  doubleCheck: { fen: "4k3/pp3ppp/8/8/4N3/8/PP3PPP/4R1K1 w - - 0 30", line: ["e4d6"], tip: "ナイト自身もチェックになるマスへどかします。" },
  trapped: { fen: "4k3/5p2/8/5P1b/8/7P/6P1/6K1 w - - 0 30", line: ["g2g4"], tip: "h5 のビショップの逃げ道は g6 と g4 だけ。どちらも取られるマスにしてから当たりを。" },
  windmill: { fen: "5r1k/3p1pR1/8/8/8/8/1B6/2K5 w - - 0 30", line: ["g7f7", "h8g8", "f7g7", "g8h8", "g7d7"], tip: "ルークが動くたびに b2 のビショップのチェックが通ります。取って、戻って、また取る。", source: "トーレ対ラスカー（1925）の型" },

  // ── 捨て駒 ──
  brilliant: { lead: L("e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6"), line: ["f3e5"], tip: "ナイトが動くとクイーンを取られます。それでも e5 を取るのが好手（取られたら Bxf7+ から詰み）。", source: "レガルの罠" },
  exchangeSac: { lead: L("e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8 Bb3 Ne5 h4"), line: ["c8c3"], tip: "ドラゴンの定番。c3 のナイトをルークで取り、白のキングの囲いを崩します。" },
  queenSac: { fen: "5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 30", line: ["c4g8"], tip: "クイーンを g8 に捨てます。ルークで取ると、Nf7 の窒息メイト。" },
  greekGift: { lead: L("e4 e6 d4 d5 Nc3 Nf6 e5 Nfd7 Nf3 Be7 Bd3 O-O"), line: ["d3h7"], tip: "黒はキング側に囲い、f6 のナイトがいません。ビショップを h7 に捨てます。" },

  // ── 駒の配置 ──
  fianchetto: { lead: L("g3 d5"), line: ["f1g2"], tip: "g3 を突いた後、ビショップを g2 へ。" , show: ["g2", "g3"]},
  doubleFianchetto: { lead: L("g3 d5 Bg2 Nf6 b3 e6"), line: ["c1b2"], tip: "もう 1 枚のビショップも b2 へ。" , show: ["b2", "b3", "g2", "g3"]},
  modelOpening: { lead: L("e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 Nc3 d6 Bd2 O-O"), line: ["e1g1"], tip: "小駒は 4 枚とも出ました。あとは囲うだけ。" , show: ["f3", "c3", "c4", "d2", "g1"]},
  london: { lead: L("d4 d5 Bf4 Nf6 e3 e6"), line: ["g1f3"], tip: "Bf4・d4・e3 は済み。最後に Nf3。" , show: ["f4", "d4", "e3", "f3"]},
  colle: { lead: L("d4 d5 Nf3 Nf6 e3 e6 Bd3 c5"), line: ["c2c3"], tip: "d4・e3・Nf3・Bd3 は済み。c3 で完成。" , show: ["d4", "e3", "c3", "f3", "d3"]},
  kingsIndian: { lead: L("Nf3 d5 g3 Nf6 Bg2 e6 d3 Be7"), line: ["e1g1"], tip: "Nf3・g3・Bg2・d3 は済み。囲えば完成。" , show: ["f3", "g3", "g2", "d3", "g1", "f1"]},
  outpost: { lead: L("e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Bxf6 gxf6"), line: ["c3d5"], tip: "d5 は e4 のポーンが守り、黒の c ポーンはもうありません。追い払われない拠点です。" },
  octopus: { fen: "r2q1rk1/pp3ppp/2p5/4P3/4N3/8/PPP2PPP/R2Q1RK1 w - - 0 15", line: ["e4d6"], tip: "d6 は e5 のポーンが守り、黒のポーンには追い払えません。ここからナイトが 8 方向に睨みを利かせます。" },
  battery: { lead: L("d4 d5 c4 e6 Nc3 Nf6 e3 Nbd7 Bd3 Be7 Nf3 O-O"), line: ["d1c2"], tip: "d3 のビショップの後ろにクイーンを重ね、h7 に照準を合わせます。" },
  doubledRooks: { fen: "3r2k1/pp3ppp/8/8/8/8/P1R2PPP/3R2K1 w - - 0 20", line: ["c2d2"], tip: "d 列にルークを重ねます。" , show: ["d1", "d2"]},
  connected: { fen: "r4rk1/ppp2ppp/8/8/8/8/PPP2PPP/R2Q1RK1 w - - 0 15", line: ["d1d2"], tip: "ルークの間にいるクイーンをどかします。" , show: ["a1", "f1"]},
  rook7: { fen: "6k1/pp3ppp/8/8/8/8/PP3PPP/3R2K1 w - - 0 30", line: ["d1d7"], tip: "ルークを 7 段目へ。" },
  pigs: { fen: "6k1/1R3ppp/8/8/8/8/5PPP/3R2K1 w - - 0 30", line: ["d1d7"], tip: "2 枚目のルークも 7 段目へ。" , show: ["b7", "d7"]},
  gun: { fen: "3r2k1/pp3ppp/8/8/8/3R4/PP1R1PPP/5QK1 w - - 0 25", line: ["f1d1"], tip: "d 列のルーク 2 枚の後ろに、クイーンを並べます。", source: "アレヒン対ニムゾヴィッチ（1930）の型" , show: ["d1", "d2", "d3"]},

  // ── ポーン構造 ──
  passed: { fen: "6k1/5ppp/8/8/3P4/8/5PPP/6K1 w - - 0 30", line: ["d4d5"], tip: "止める黒ポーンがいない d ポーンを 5 段目へ。" , show: ["d5"]},
  protectedPasser: { fen: "6k1/5ppp/8/8/2PP4/8/5PPP/6K1 w - - 0 30", line: ["d4d5"], tip: "d5 に進めると、c4 のポーンが守ります。" , show: ["d5", "c4"]},
  connectedPassers: { fen: "6k1/5ppp/8/3P4/8/2P5/5PPP/6K1 w - - 0 30", line: ["c3c4"], tip: "c ポーンを 4 段目へ。d5 と並んで連結します。" , show: ["c4", "d5"]},
  iqp: { fen: "4k3/pp3ppp/8/8/1p1P4/2P5/P4PPP/4K3 w - - 0 20", line: ["c3b4"], tip: "c ポーンで取ると、d4 のポーンの両隣（c・e 列）にポーンがいなくなります。" , show: ["d4"]},
  hangingPawns: { fen: "4k3/pp3ppp/8/8/3P4/2P5/P4PPP/4K3 w - - 0 20", line: ["c3c4"], tip: "c ポーンを d4 の隣へ。b・e 列にポーンはいません。" , show: ["c4", "d4"]},
  stonewall: { lead: L("d4 d5 e3 Nf6 f4 e6"), line: ["c2c3"], tip: "d4・e3・f4 は済み。c3 で壁が完成。" , show: ["c3", "d4", "e3", "f4"]},
  maroczy: { lead: L("e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6"), line: ["c2c4"], tip: "e4 に加えて c4 を突き、d5 を押さえ込みます。" , show: ["c4", "e4"]},
  hedgehog: { lead: L("c4 c5 Nf3 Nf6 Nc3 e6 g3 b6 Bg2 Bb7 O-O Be7 d4 cxd4 Qxd4 d6 Rd1"), line: ["a7a6"], tip: "b6・d6・e6 は済み。a6 で針ねずみの完成。" , show: ["a6", "b6", "d6", "e6"]},

  // ── 詰みの型 ──
  mate: { fen: "k7/8/1K6/8/8/8/8/7Q w - - 0 50", line: ["h1h8"], tip: "クイーンを最上段へ。" },
  scholar: { lead: L("e4 e5 Bc4 Nc6 Qh5 Nf6"), line: ["h5f7"], tip: "ビショップが守っている f7 を、クイーンで取ります。" },
  fools: { lead: L("f3 e5 g4"), line: ["d8h4"], tip: "白が f3 と g4 を突いて、キングへの斜めの道が開いています。" },
  kiss: { fen: "7k/8/5K2/8/8/8/8/6Q1 w - - 0 50", line: ["g1g7"], tip: "キングに守られたマスへ、クイーンを相手キングの隣に。" },
  backRank: { fen: "6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 30", line: ["a1a8"], tip: "黒キングは自分のポーン 3 枚に閉じ込められています。" },
  ladder: { fen: "7k/8/8/8/8/8/R7/1R4K1 w - - 0 40", lead: L("Ra7 Kg8"), line: ["b1b8"], tip: "7 段目はもう押さえています。もう 1 枚で 8 段目を。" },
  knightMate: { fen: "7k/6pp/7N/4N3/8/8/8/6K1 w - - 0 40", line: ["e5f7"], tip: "h6 のナイトが g8 を押さえています。もう 1 枚のナイトでチェックを。" },
  pawnMate: { fen: "7k/5K2/5NP1/8/8/8/8/8 w - - 0 50", line: ["g6g7"], tip: "ポーンを 1 つ進めるとチェック。逃げ道は全部ふさがっています。" },
  damiano: { fen: "5rk1/5p2/6P1/7Q/8/8/8/6K1 w - - 0 30", line: ["h5h7"], tip: "g6 のポーンが守る h7 へ、クイーンを。" },
  lolli: { fen: "5rk1/5p1p/5P2/6Q1/8/8/8/6K1 w - - 0 30", line: ["g5g7"], tip: "f6 のポーンが守る g7 へ、クイーンを。" },
  greco: { fen: "7k/6p1/8/8/2B5/8/4Q3/6K1 w - - 0 30", line: ["e2h5"], tip: "c4 のビショップが g8 を押さえています。クイーンで h 列からチェック。" },
  hook: { fen: "3rkn2/8/8/5N2/6P1/8/8/4R1K1 w - - 0 30", line: ["e1e7"], tip: "e7 はナイトが守り、そのナイトは g4 のポーンが守ります。" },
  opera: { fen: "4k3/5p2/4q3/6B1/8/8/8/3R2K1 w - - 0 20", line: ["d1d8"], tip: "g5 のビショップが d8 と e7 を押さえています。", source: "モーフィーのオペラ座の一局（1858）の型" },
  morphy: { fen: "3B3k/7p/8/8/8/8/8/6RK w - - 0 30", line: ["d8f6"], tip: "g1 のルークが g 列を押さえています。ビショップで斜めからチェック。" },
  doubleCheckMate: { fen: "3qkb2/3p1p2/8/8/4N3/8/8/4RK2 w - - 0 30", line: ["e4f6"], tip: "ナイトをチェックになるマスへ。ルークのチェックも同時にかかります。" },
  epaulette: { fen: "3rkr2/8/8/8/8/8/4Q3/6K1 w - - 0 40", line: ["e2e6"], tip: "黒キングの両隣は自分のルーク。正面からクイーンで。" },
  dovetail: { fen: "8/4p3/4kp2/8/2P5/8/8/3Q2K1 w - - 0 40", line: ["d1d5"], tip: "c4 のポーンが守る d5 へ。キングの後ろ（e7・f6）は黒自身のポーンがふさいでいます。" },
  swallowsTail: { fen: "8/3p1p2/4k3/8/3P4/8/7Q/6K1 w - - 0 40", line: ["h2e5"], tip: "d4 のポーンが守る e5 へ。キングの斜め後ろ（d7・f7）は黒自身のポーンです。" },
  arabian: { fen: "7k/R7/5N2/8/8/8/8/6K1 w - - 0 40", line: ["a7h7"], tip: "ナイトが守る h7 に、ルークを。" },
  anastasia: { fen: "8/4N1pk/8/8/8/8/6K1/3R4 w - - 0 40", line: ["d1h1"], tip: "ナイトが g6 と g8 を押さえています。ルークを h 列へ。" },
  boden: { lead: L("e4 e5 Nf3 d6 c3 f5 Bc4 Nf6 d4 fxe4 dxe5 exf3 exf6 Qxf6 gxf3 Nc6 f4 Bd7 Be3 O-O-O Nd2 Re8 Qf3 Bf5 O-O-O d5 Bxd5"), line: ["f6c3", "b2c3", "f8a3"], tip: "クイーンを c3 に捨て、b ポーンに取らせます。", source: "シュルダー対ボーデン（1853）" },
  legal: { lead: L("e4 e5 Nf3 d6 Bc4 Bg4 Nc3 g6"), line: ["f3e5", "g4d1", "c4f7", "e8e7", "c3d5"], tip: "ナイトで e5 を取り、クイーンを取らせます。そこから Bxf7+、Nd5 の 3 手詰め。", source: "レガルの罠" },
  smothered: { fen: "5r1k/6pp/7N/8/2Q5/8/8/6K1 w - - 0 30", line: ["c4g8", "f8g8", "h6f7"], tip: "クイーンを g8 に捨てて、ルークに取らせます（フィリドールの遺産）。" },
  castleMate: { lead: L("d4 e6 Nf3 f5 Nc3 Nf6 Bg5 Be7 Bxf6 Bxf6 e4 fxe4 Nxe4 b6 Ne5 O-O Bd3 Bb7 Qh5 Qe7 Qxh7+ Kxh7 Nxf6+ Kh6 Neg4+ Kg5 h4+ Kf4 g3+ Kf3 Be2+ Kg2 Rh2+ Kg1"), line: ["e1c1"], tip: "黒キングは白の陣地の奥まで引きずり出されています。最後はキャスリングで。", source: "エドワード・ラスカー対トーマス（1912）" },

  // ── 終盤の技術 ──
  opposition: { fen: "8/8/4k3/8/8/3PK3/8/8 w - - 0 50", line: ["e3e4"], tip: "キングを e4 へ。e6 の黒キングと 1 マス空けて向かい合い、黒に手番を渡します。" , show: ["e4", "e6"]},
  kqk: { fen: "6k1/8/6K1/8/8/8/8/Q7 w - - 0 60", line: ["a1a8"], tip: "キングが 7 段目を押さえています。クイーンで 8 段目を。" },
  krk: { fen: "6k1/8/6K1/8/8/8/8/R7 w - - 0 60", line: ["a1a8"], tip: "キングが 7 段目を押さえています。ルークで 8 段目を。" },
  twoBishops: { fen: "7k/8/6K1/8/2B2B2/8/8/8 w - - 0 70", line: ["f4e5"], tip: "c4 のビショップが g8 を押さえています。もう 1 枚で斜めからチェック。" },
  bishopKnight: { fen: "7k/4N3/3B2K1/8/8/8/8/8 w - - 0 70", line: ["d6e5"], tip: "ナイトが g8 を、キングが g7・h7 を押さえています。ビショップで斜めからチェック。" },
};
