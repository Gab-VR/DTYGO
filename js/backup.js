// backup.js
import { migrateCats } from "./deck.js";
import { count, S } from "./store.js";
import { download, uid } from "./util.js";

function backupAll() {
  download(new Blob([JSON.stringify({ app: "deck-forge", backup: 1, saved: new Date().toISOString(), decks: S.decks, formats: S.formats, ui: S.ui }, null, 1)],
    { type: "application/json" }), `deckbuilder-backup-${new Date().toISOString().slice(0, 10)}.json`);
}
// Adds the backup's decks and formats; anything with the same id as an existing one gets a fresh id.
function restoreAll(b) {
  if (!b || b.app !== "deck-forge" || !Array.isArray(b.decks)) throw new Error("missing deck list");
  const deckIds = new Set(S.decks.map(d => d.id)), fmtIds = new Set(S.formats.map(f => f.id));
  const lonelyStarter = S.decks.length === 1 && !count(S.decks[0].main) && !count(S.decks[0].extra) && !count(S.decks[0].side);
  if (lonelyStarter) { S.decks = []; deckIds.clear(); }        // replace the empty default deck
  for (const d of b.decks) { migrateCats(d); if (deckIds.has(d.id)) d.id = uid(); d.order ||= {}; d.swPool ||= []; d.tags ||= {}; S.decks.push(d); }
  for (const f of b.formats || []) {
    if (S.formats.some(x => x.name === f.name && JSON.stringify({ ...x, id: 0 }) === JSON.stringify({ ...f, id: 0 }))) continue;   // identical format already here
    if (fmtIds.has(f.id)) f.id = uid(); f.over ||= {}; f.pover ||= {}; S.formats.push(f);
  }
  if (b.ui) for (const k of ["deckView", "tableOrder", "catCols", "searchSort", "searchDir", "textSearch", "sheet"]) if (b.ui[k] != null) S.ui[k] = b.ui[k];
  S.deckId = S.decks[S.decks.length - 1].id;
  return { decks: b.decks.length, formats: (b.formats || []).length };
}

export { backupAll, restoreAll };
