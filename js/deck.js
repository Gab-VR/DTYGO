// deck.js
import { isExtra, kindRank, sortKey } from "./cards.js";
import { limitLabel, limitOf, totalCopies } from "./legality.js";
import { card, changed, deck, fmt, S } from "./store.js";
import { emit, toast, uid } from "./util.js";

// The built-in categories, in display order: [name, colour, what it means].
const DEFAULT_CATS = [
  ["Starter", "#e6b24a", "Starts your combo on its own"],
  ["Half Starter", "#d8c47c", "Starts your combo, but needs a fodder"],
  ["Extender", "#5aa7e8", "Adds to a combo that's already going"],
  ["Hand-trap", "#62c78f", "Interrupts the opponent from your hand"],
  ["Interaction", "#b48cf0", "Other ways to interfere with the opponent"],
  ["Brick", "#e0665c", "A card you don't want to open"]
];
const CATS_VERSION = 3;
function newDeck(name = "New deck") {
  const cats = DEFAULT_CATS.map(([n, c, hint]) => ({ id: uid(), name: n, color: c, hint, builtin: true }));
  return { id: uid(), name, main: {}, extra: {}, side: {}, order: {}, tags: {}, cats, catsV: CATS_VERSION, swPool: [] };
}
/* Brings a deck's categories up to the current built-ins, keeping every card's tags:
   v1 (no built-ins yet): the old default names become built-ins, then as below.
   v2 -> v3: "Hand trap" becomes "Hand-trap", "Follow-up" becomes a custom category,
   "Half Starter" and "Interaction" are added, and the built-ins go first in the new order. */
function migrateCats(d) {
  if ((d.catsV || 1) >= CATS_VERSION) return d;
  d.cats ||= [];
  if (!d.catsV) for (const k of d.cats) if (["Starter", "Extender", "Follow-up", "Hand trap", "Brick"].includes(k.name)) k.builtin = true;
  for (const k of d.cats) {
    if (!k.builtin) continue;
    if (k.name === "Hand trap") k.name = "Hand-trap";
    if (k.name === "Follow-up") k.builtin = false;
  }
  const builtins = DEFAULT_CATS.map(([n, c, hint]) => {
    const k = d.cats.find(x => x.builtin && x.name === n) || { id: uid(), name: n, color: c, builtin: true };
    k.hint = hint; return k;
  });
  d.cats = [...builtins, ...d.cats.filter(k => !builtins.includes(k))];
  d.catsV = CATS_VERSION;
  return d;
}
const SECTIONS = ["main", "extra", "side"];
// Custom order: one list of passcodes per section; cards missing from it go at the end in card-type order.
function ensureOrder(d = deck()) {
  d.order ||= {};
  for (const s of SECTIONS) {
    const ids = Object.keys(d[s]).map(Number), have = new Set(ids);
    const kept = (d.order[s] || []).filter(id => have.has(id)), inList = new Set(kept);
    const rest = ids.filter(id => !inList.has(id)).map(card).filter(Boolean).sort((a, b) => sortKey(a).localeCompare(sortKey(b))).map(c => c.id);
    d.order[s] = kept.concat(rest);
  }
  return d.order;
}
function placeInOrder(d, sec, id, before) {
  const o = ensureOrder(d)[sec].filter(x => x !== id);
  const i = before != null ? o.indexOf(+before) : -1;
  i >= 0 ? o.splice(i, 0, id) : o.push(id);
  d.order[sec] = o;
}
function add(id, sec, n = 1, opt = {}) {
  const d = deck(), c = card(id); if (!c) return false;
  id = c.id;
  if (!sec) sec = isExtra(c) ? "extra" : "main";
  if (sec === "main" && isExtra(c)) sec = "extra";
  if (sec === "extra" && !isExtra(c)) sec = "main";
  if (n > 0 && !S.ui.overrideLimit) {
    const l = limitOf(c), have = totalCopies(d, id);
    if (have + n > l) {
      const lab = limitLabel(c);
      toast(l === 0 ? `${c.name} is ${lab ? lab.text : "not allowed"} in ${fmt().name}.`
        : `${c.name} is ${lab ? lab.text : `limited to ${l}`} (${l} cop${l === 1 ? "y" : "ies"}). Turn on "Override card limit" to add more.`);
      S.sel = id; emit("select"); return false;
    }
  }
  const isNew = !d[sec][id];
  d[sec][id] = (d[sec][id] || 0) + n;
  if (d[sec][id] <= 0) { delete d[sec][id]; ensureOrder(d); }
  else if (isNew || opt.before != null) placeInOrder(d, sec, id, opt.before);
  S.sel = id; if (!opt.quiet) changed(); return true;
}
function move(id, from, to, before) {
  const d = deck(); if (!d[from][id]) return;
  add(id, from, -1, { quiet: true });
  if (!add(id, to, 1, { before, quiet: true })) add(id, from, 1, { quiet: true });   // put it back if refused
  changed();
}
function reorder(sec, id, before) { if (+id === +before) return; placeInOrder(deck(), sec, +id, before); changed(); }
/* ---- categories: the five built-ins plus up to five of your own ---- */
const MAX_CUSTOM_CATS = 5;
const customCats = d => d.cats.filter(k => !k.builtin);
function addCategory(d, name) {
  if (customCats(d).length >= MAX_CUSTOM_CATS) { toast(`You can add up to ${MAX_CUSTOM_CATS} custom categories.`); return null; }
  const used = new Set(d.cats.map(k => k.color));
  const color = ["#e87fb0", "#6fd0d0", "#c9d45a", "#f0955a", "#8fa6ff", "#b98a6a"].find(c => !used.has(c)) || "#bbbbbb";
  const k = { id: uid(), name: name.trim().slice(0, 24) || "New category", color };
  d.cats.push(k); return k;
}
// Removes one of your own categories (built-ins can't be): its tag comes off every card and
// it leaves any slot on the Hands page.
function removeCategory(d, id) {
  const k = d.cats.find(x => x.id === id); if (!k || k.builtin) return false;
  d.cats = d.cats.filter(x => x !== k);
  for (const cid in d.tags) d.tags[cid] = d.tags[cid].filter(t => t !== id);
  for (const hand of d.probs?.hands || []) for (const slot of hand) { const i = slot.indexOf(id); if (i >= 0) slot.splice(i, 1); }
  return true;
}
// Moves category `id` to just before category `before` (or to the end when before is null).
// The order is used everywhere categories are listed, and decides which box a card with
// several categories appears in (its first one).
function moveCategory(d, id, before) {
  const k = d.cats.find(x => x.id === id); if (!k || id === before) return;
  const rest = d.cats.filter(x => x !== k), i = before == null ? -1 : rest.findIndex(x => x.id === before);
  i >= 0 ? rest.splice(i, 0, k) : rest.push(k);
  d.cats = rest;
}
// How many Main Deck copies carry the category.
function categoryCopies(d, id) { return Object.entries(d.main).reduce((a, [cid, n]) => a + ((d.tags[cid] || []).includes(id) ? n : 0), 0); }
// A card's box in the Categories view: the first of its categories in list order.
function primaryCat(d, id) { const t = d.tags[id] || []; return d.cats.find(k => t.includes(k.id)) || null; }

/* Table view order. Unlike ensureOrder (one entry per card), this lists every copy, so copies
   of the same card can sit apart. It never re-sorts itself: when the deck changes, extra copies
   of a card go right after that card's last copy, new cards go at the end, and removed copies
   come off the end of that card's run. */
function ensureCopyOrder(d, sec) {
  d.copyOrder ||= {};
  let list = d.copyOrder[sec];
  if (!list) list = ensureOrder(d)[sec].flatMap(id => Array(d[sec][id]).fill(id));   // start from the card order
  list = list.filter(id => d[sec][id]);
  const seen = {};
  for (let i = list.length - 1; i >= 0; i--) {                    // too many copies listed: drop the last ones
    const id = list[i]; seen[id] = (seen[id] || 0) + 1;
    if (seen[id] > d[sec][id]) { list.splice(i, 1); seen[id]--; }
  }
  for (const [key, n] of Object.entries(d[sec])) {                 // too few: add after the card's last copy, or at the end
    const id = +key;
    for (let k = seen[id] || 0; k < n; k++) {
      const last = list.lastIndexOf(id);
      last >= 0 ? list.splice(last + 1, 0, id) : list.push(id);
    }
  }
  return d.copyOrder[sec] = list;
}
// Moves the copies at positions `from` so they start at position `to` (a position in the
// list before the move; to = list length means "at the end").
function moveCopies(d, sec, from, to) {
  const list = ensureCopyOrder(d, sec), take = new Set(from);
  const moving = from.slice().sort((a, b) => a - b).map(i => list[i]);
  const shift = from.filter(i => i < to).length;
  const rest = list.filter((_, i) => !take.has(i));
  rest.splice(Math.max(0, to - shift), 0, ...moving);
  d.copyOrder[sec] = rest;
}
// Card type first (effect, normal, Link, Xyz, Synchro, Fusion, Spell, Trap), then name.
function alphaCopies(d, sec) {
  return Object.entries(d[sec]).map(([id, n]) => [card(id), n]).filter(([c]) => c)
    .sort((a, b) => kindRank(a[0]) - kindRank(b[0]) || a[0].name.localeCompare(b[0].name))
    .flatMap(([c, n]) => Array(n).fill(c.id));
}

export { categoryCopies, moveCategory, removeCategory, CATS_VERSION, migrateCats, add, alphaCopies, ensureCopyOrder, moveCopies, addCategory, customCats, DEFAULT_CATS, ensureOrder, MAX_CUSTOM_CATS, move, newDeck, placeInOrder, primaryCat, reorder, SECTIONS };
