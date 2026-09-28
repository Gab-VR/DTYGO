import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { add, move, reorder, ensureOrder, addCategory, customCats, MAX_CUSTOM_CATS } from "../js/deck.js";
import { S } from "../js/store.js";
import { reset } from "./helpers.js";

let d;
beforeEach(() => ({ d } = reset("TCG")));

test("adding respects the card limit unless overridden", () => {
  assert.equal(add(3), true);
  assert.equal(add(3), false);          // Limited
  assert.equal(d.main[3], 1);
  S.ui.overrideLimit = true;
  assert.equal(add(3), true);
  assert.equal(d.main[3], 2);
});

test("the limit counts Main, Extra and Side together", () => {
  add(4); add(4, "side");
  assert.equal(add(4), false);          // Semi-Limited: 2 total
});

test("Extra Deck monsters go to the Extra Deck even if sent to Main", () => {
  add(9, "main");
  assert.equal(d.extra[9], 1);
  assert.equal(d.main[9], undefined);
});

test("moving to the Side keeps the total and isn't blocked by the limit", () => {
  add(3); move(3, "main", "side");
  assert.deepEqual([d.main[3], d.side[3]], [undefined, 1]);
});

test("custom order: new cards go last, reorder puts a card before another", () => {
  add(1); add(2); add(4);
  assert.deepEqual(ensureOrder(d).main, [1, 2, 4]);
  reorder("main", 4, 1);
  assert.deepEqual(d.order.main, [4, 1, 2]);
});

test("at most five custom categories", () => {
  for (let i = 0; i < 7; i++) addCategory(d, "c" + i);
  assert.equal(customCats(d).length, MAX_CUSTOM_CATS);
});

/* ---- Table view: order of individual copies ---- */
import { ensureCopyOrder, moveCopies, alphaCopies } from "../js/deck.js";

test("copy order starts from the card order, one entry per copy", () => {
  d.main = { 1: 2, 2: 1 }; d.order = { main: [2, 1] };
  assert.deepEqual(ensureCopyOrder(d, "main"), [2, 1, 1]);
});

test("copies of one card can be separated and stay separated", () => {
  d.main = { 1: 3, 2: 1 }; d.order = { main: [1, 2] };
  ensureCopyOrder(d, "main");                  // [1, 1, 1, 2]
  moveCopies(d, "main", [0], 4);               // first copy of card 1 to the end
  assert.deepEqual(ensureCopyOrder(d, "main"), [1, 1, 2, 1]);
});

test("a whole playset moves together", () => {
  d.main = { 1: 3, 2: 1 }; d.order = { main: [1, 2] };
  ensureCopyOrder(d, "main");
  moveCopies(d, "main", [0, 1, 2], 4);
  assert.deepEqual(ensureCopyOrder(d, "main"), [2, 1, 1, 1]);
});

test("the order doesn't re-sort itself: new copy after its card, new card at the end, removals from the run's end", () => {
  d.main = { 1: 2, 2: 1 }; d.order = { main: [1, 2] };
  ensureCopyOrder(d, "main");
  moveCopies(d, "main", [2], 0);               // [2, 1, 1]
  d.main[1] = 3; d.main[3] = 1;
  assert.deepEqual(ensureCopyOrder(d, "main"), [2, 1, 1, 1, 3]);
  d.main[1] = 1;
  assert.deepEqual(ensureCopyOrder(d, "main"), [2, 1, 3]);
});

test("alphabetic order groups by card type first", () => {
  d.main = { 10: 1, 2: 2, 1: 1 };              // Pot J (spell), Extender B, Starter A
  assert.deepEqual(alphaCopies(d, "main"), [2, 2, 1, 10]);
});

/* ---- Built-in categories ---- */
import { newDeck, migrateCats, CATS_VERSION } from "../js/deck.js";
const names = d => d.cats.map(k => k.name);

test("new decks get the six built-in categories", () => {
  assert.deepEqual(names(newDeck()), ["Starter", "Half Starter", "Extender", "Hand-trap", "Interaction", "Brick"]);
  assert.ok(newDeck().cats.every(k => k.builtin && k.hint));
});

test("a deck with the old categories is migrated without losing tags", () => {
  const old = { catsV: 2, tags: {}, cats: [
    { id: "s", name: "Starter", builtin: true }, { id: "e", name: "Extender", builtin: true },
    { id: "f", name: "Follow-up", builtin: true }, { id: "h", name: "Hand trap", builtin: true },
    { id: "b", name: "Brick", builtin: true }, { id: "g", name: "Garnet", builtin: false }] };
  old.tags = { 1: ["s"], 2: ["f", "h"], 3: ["g"] };
  migrateCats(old);
  assert.deepEqual(names(old), ["Starter", "Half Starter", "Extender", "Hand-trap", "Interaction", "Brick", "Follow-up", "Garnet"]);
  assert.equal(old.cats.find(k => k.name === "Follow-up").builtin, false);        // now one of your own
  assert.equal(old.cats.find(k => k.name === "Hand-trap").id, "h");               // same category, renamed
  assert.deepEqual(old.tags, { 1: ["s"], 2: ["f", "h"], 3: ["g"] });
  assert.equal(old.catsV, CATS_VERSION);
});

test("a deck from before built-ins existed is migrated too, and migrating twice changes nothing", () => {
  const ancient = { cats: [{ id: "s", name: "Starter" }, { id: "t", name: "Hand trap" }, { id: "x", name: "Mine" }], tags: {} };
  migrateCats(ancient);
  const once = JSON.stringify(ancient);
  migrateCats(ancient);
  assert.equal(JSON.stringify(ancient), once);
  assert.deepEqual(names(ancient), ["Starter", "Half Starter", "Extender", "Hand-trap", "Interaction", "Brick", "Mine"]);
  assert.equal(ancient.cats.find(k => k.name === "Mine").builtin, undefined);
});

import { removeCategory, categoryCopies } from "../js/deck.js";
test("removing a custom category untags cards and clears it from Hands slots; built-ins stay", () => {
  const k = addCategory(d, "Garnet");
  d.main = { 1: 3, 2: 2 }; d.tags = { 1: [k.id, d.cats[0].id], 2: [k.id] };
  d.probs = { size: 5, hands: [[[k.id, d.cats[0].id], [k.id], [], [], []]] };
  assert.equal(categoryCopies(d, k.id), 5);
  assert.equal(removeCategory(d, d.cats[0].id), false);          // built-in: refused
  assert.equal(removeCategory(d, k.id), true);
  assert.deepEqual(d.tags, { 1: [d.cats[0].id], 2: [] });
  assert.deepEqual(d.probs.hands[0].slice(0, 2), [[d.cats[0].id], []]);
  assert.ok(!d.cats.includes(k));
});

import { moveCategory } from "../js/deck.js";
test("categories can be reordered", () => {
  const ids = d.cats.map(k => k.id), names = () => d.cats.map(k => k.name);
  moveCategory(d, ids[5], ids[0]);                              // Brick before Starter
  assert.deepEqual(names(), ["Brick", "Starter", "Half Starter", "Extender", "Hand-trap", "Interaction"]);
  moveCategory(d, ids[0], null);                                // Starter to the end
  assert.deepEqual(names(), ["Brick", "Half Starter", "Extender", "Hand-trap", "Interaction", "Starter"]);
});
