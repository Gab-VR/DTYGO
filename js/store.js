// store.js
import { emit } from "./util.js";

/* ================= storage ================= */
const idb = {
  db: null, mem: new Map(),
  open() { return new Promise(res => {
    try { const r = indexedDB.open("deck-forge", 1);
      r.onupgradeneeded = () => r.result.createObjectStore("kv");
      r.onsuccess = () => { this.db = r.result; res(); }; r.onerror = () => res();
    } catch { res(); } }); },
  get(k) { if (!this.db) return Promise.resolve(this.mem.get(k)); return new Promise(res => {
    const r = this.db.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => res(r.result); r.onerror = () => res(undefined); }); },
  set(k, v) { if (!this.db) { this.mem.set(k, v); return Promise.resolve(); } return new Promise(res => {
    const tx = this.db.transaction("kv", "readwrite"); tx.objectStore("kv").put(v, k); tx.oncomplete = res; tx.onerror = res; }); }
};
const LS = {
  get(k, d) { try { const v = localStorage.getItem("deck-forge:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("deck-forge:" + k, JSON.stringify(v)); } catch {} }
};
/* ================= state ================= */
const S = {
  cards: new Map(), alias: new Map(), list: [], races: [], gp: {}, gpo: {}, meta: null,
  decks: [], deckId: null, formats: [], fmtId: null, sel: null, tab: "build",
  ui: Object.assign({ img: "off", imgTpl: "pics/{id}.jpg", artTpl: "", textSearch: true,
    deckView: "table", tableOrder: "alpha", searchSort: "alpha", searchDir: "asc", overrideLimit: false }, LS.get("ui", {}))
};
const card = id => S.cards.get(S.alias.get(+id) ?? +id);
const deck = () => S.decks.find(d => d.id === S.deckId);
const fmt = () => S.formats.find(f => f.id === S.fmtId);
function save() { LS.set("decks", S.decks); LS.set("formats", S.formats); LS.set("cur", { deck: S.deckId, fmt: S.fmtId, tab: S.tab, tab2: S.tab2 }); LS.set("ui", S.ui); }
const count = sec => Object.values(sec).reduce((a, b) => a + b, 0);

// Call after editing decks or formats: saves, then lets the interface redraw.
function changed() { save(); emit("changed"); }

export { card, changed, count, deck, fmt, idb, LS, S, save };
