// Compact position identity shared by the ghost index builder (Node) and the app (browser).
// Position = first four FEN fields (pieces, turn, castling, en passant) → 53-bit hash in base 36.
export function posHash(fen: string): string {
  const key = fen.split(" ").slice(0, 4).join(" ");
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < key.length; i++) {
    const ch = key.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Plies from the start that are indexed by position; deeper lookups replay candidate games. */
export const INDEX_PLIES = 40;
