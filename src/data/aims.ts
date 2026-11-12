// 狙い (aims): tactical / strategic motifs. Puzzles come from the Lichess puzzle database (CC0),
// selected by scripts/build-aims.ts into public/aims.json.
export interface Aim {
  id: string; // Lichess theme tag
  ja: string;
  en: string;
  what: string; // the idea in one line
  cue: string; // what to look for on the board
  group: "基本の戦術" | "守りを崩す" | "詰みの型" | "一歩先の手";
}

export const AIMS: Aim[] = [
  { id: "hangingPiece", group: "基本の戦術", ja: "タダ取り", en: "Hanging piece", what: "守られていない駒、守りより攻めの数が多い駒を取る。", cue: "相手の駒を 1 つずつ見て「これは守られているか？」と数える。" },
  { id: "fork", group: "基本の戦術", ja: "フォーク（両取り）", en: "Fork", what: "1 つの駒で 2 つ以上を同時に狙う。片方しか逃げられない。", cue: "守られていない駒とキングが、ナイト 1 跳び・同じ斜め・同じ列で結べないか。" },
  { id: "pin", group: "基本の戦術", ja: "ピン", en: "Pin", what: "動くと後ろの駒（キングやクイーン）が取られる駒は、動けない・守れない。", cue: "相手のキングやクイーンと同じ直線上に、間に 1 枚だけ挟まった駒はないか。" },
  { id: "skewer", group: "基本の戦術", ja: "スキュア（串刺し）", en: "Skewer", what: "価値の高い駒を攻めて逃がし、その後ろの駒を取る。", cue: "キングやクイーンの真後ろ（同じ直線）に、別の駒が並んでいないか。" },
  { id: "discoveredAttack", group: "基本の戦術", ja: "ディスカバード・アタック", en: "Discovered attack", what: "前の駒をどかすと、後ろの駒の利きが通る。どかす駒でも別の狙いを作る。", cue: "自分のビショップ・ルーク・クイーンの直線を、自分の駒が塞いでいないか。" },
  { id: "doubleCheck", group: "基本の戦術", ja: "ダブルチェック", en: "Double check", what: "2 つの駒で同時にチェック。相手はキングを動かすしかない。", cue: "どかす駒自身もチェックになるディスカバードを探す。" },
  { id: "trappedPiece", group: "基本の戦術", ja: "駒の捕獲", en: "Trapped piece", what: "逃げ場のない駒を攻めて取る。", cue: "深く入り込んだ相手の駒の、逃げ先のマスを全部数える。" },

  { id: "deflection", group: "守りを崩す", ja: "そらし（デフレクション）", en: "Deflection", what: "大事なマスや駒を守っている駒を、持ち場から引き離す。", cue: "「この駒さえいなければ」と思う守り駒に、取らざるを得ない餌を出せないか。" },
  { id: "attraction", group: "守りを崩す", ja: "おびき寄せ（アトラクション）", en: "Attraction", what: "捨て駒で相手の駒（多くはキング）を悪いマスに引き込む。", cue: "相手のキングがあのマスにいればフォークや詰みになる、というマスを先に見つける。" },
  { id: "capturingDefender", group: "守りを崩す", ja: "守り駒の除去", en: "Removing the defender", what: "狙いの駒を守っている駒を先に取る（交換する）。", cue: "取りたい駒を守っているのは誰か。その守り駒を取れないか。" },
  { id: "sacrifice", group: "守りを崩す", ja: "サクリファイス（捨て駒）", en: "Sacrifice", what: "駒を捨てて、それ以上の見返り（詰み・駒得・攻め）を得る。", cue: "チェック・駒取り・強い脅しを、損に見えても全部読む。" },
  { id: "clearance", group: "守りを崩す", ja: "クリアランス（道を開ける）", en: "Clearance", what: "自分の駒をどかして、別の駒が使いたいマスや筋を空ける。", cue: "「自分のこの駒が邪魔」なら、テンポ良く（チェックや当たりで）どかせないか。" },
  { id: "xRayAttack", group: "守りを崩す", ja: "X 線攻撃", en: "X-ray", what: "相手の駒越しに、その先のマスを攻める・守る。", cue: "同じ列・斜めに自分の長い駒が 2 枚以上並ぶ、または相手駒の先に狙いがないか。" },

  { id: "backRankMate", group: "詰みの型", ja: "バックランク・メイト", en: "Back-rank mate", what: "自分のポーンに閉じ込められた最下段のキングを、ルークやクイーンで詰ます。", cue: "相手キングの前の 3 枚のポーンが動いていない＋最下段の守りが薄い。" },
  { id: "smotheredMate", group: "詰みの型", ja: "窒息メイト（スマザード）", en: "Smothered mate", what: "味方の駒に囲まれて動けないキングを、ナイトで詰ます。", cue: "隅のキングが自分の駒に囲まれている。クイーンを捨てて囲いを完成させる。" },
  { id: "kingsideAttack", group: "詰みの型", ja: "キングサイド攻撃", en: "Kingside attack", what: "キャスリングしたキングの前の守りを壊して攻め込む。", cue: "h7・g7・f7（h2・g2・f2）に利いている自分の駒を数える。守りより多ければ突破できる。" },
  { id: "exposedKing", group: "詰みの型", ja: "裸のキング", en: "Exposed king", what: "ポーンの守りを失ったキングを、チェックの連続で追い詰める。", cue: "チェックを全部読む。チェックしながら駒を近づける。" },

  { id: "intermezzo", group: "一歩先の手", ja: "中間手（ツヴィッシェンツーク）", en: "Intermezzo", what: "当然の取り返しをする前に、もっと強い手（チェックや脅し）を挟む。", cue: "取り返す前に一呼吸。「先に入れられるチェックや当たりはないか」。" },
  { id: "quietMove", group: "一歩先の手", ja: "静かな手", en: "Quiet move", what: "チェックでも駒取りでもないのに、受けのない脅しを作る決め手。", cue: "相手の駒が動けない・受けがないとき、急がずに脅しを 1 つ足す。" },
  { id: "defensiveMove", group: "一歩先の手", ja: "受けの一手", en: "Defensive move", what: "相手の脅しを正確に受けて、有利を保つ。", cue: "まず相手の狙いを言葉にする。それを消す手の中で最も得な手を選ぶ。" },
  { id: "advancedPawn", group: "一歩先の手", ja: "進んだポーン", en: "Advanced pawn", what: "昇格目前のポーンを使って、駒得や昇格を勝ち取る。", cue: "6・7 段目のポーンの前を空ける、止めている駒をそらす。" },
];

export const LEVELS = [
  { id: 0, ja: "入門", range: "〜1100" },
  { id: 1, ja: "初級", range: "1100〜1400" },
  { id: 2, ja: "中級", range: "1400〜1700" },
  { id: 3, ja: "上級", range: "1700〜2100" },
] as const;
export const levelOf = (rating: number) => (rating < 1100 ? 0 : rating < 1400 ? 1 : rating < 1700 ? 2 : 3);

/** [id, fen, uciMoves (first = opponent's move that sets up the puzzle), rating] */
export type PuzzleRow = [string, string, string, number];
export type AimData = Record<string, PuzzleRow[]>;
