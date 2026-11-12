import type { OpeningNotes } from "../data/openingNotes";

/** The long commentary of an opening family: history, structure, plans, tactics, mistakes, tip. */
export function OpeningNotesView({ name, notes, own }: { name: string; notes: OpeningNotes; own: boolean }) {
  const list = (label: string, items: string[]) => (
    <div className="note">
      <span className="note-label">{label}</span>
      <ul>{items.map((x) => <li key={x}>{x}</li>)}</ul>
    </div>
  );
  return (
    <>
      {!own && <div className="muted small" style={{ margin: "10px 0 2px" }}>▼ 系統「{name}」全体の解説</div>}
      <div className="note"><span className="note-label">由来</span><p>{notes.history}</p></div>
      <div className="note"><span className="note-label">ポーンの形と意味</span><p>{notes.structure}</p></div>
      {list("白の作戦", notes.white)}
      {list("黒の作戦", notes.black)}
      {list("典型的な戦術・罠", notes.tactics)}
      {list("よくあるミス", notes.mistakes)}
      <div className="note"><span className="note-label">覚え方のコツ</span><p>{notes.tip}</p></div>
    </>
  );
}
