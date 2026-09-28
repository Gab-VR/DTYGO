import { test } from "node:test";
import assert from "node:assert/strict";
import { handModel, enumerateHands, patternOdds } from "../js/prob.js";
import { binom } from "../js/util.js";

// A deck as the app stores it: counts in main, categories and tags.
function deckWith(cards, cats) {
  const main = {}, tags = {};
  cards.forEach(([id, n, t]) => { main[id] = n; tags[id] = t; });
  return { main, tags, cats: cats.map(c => ({ id: c, name: c })) };
}
const close = (a, b, eps = 1e-12) => assert.ok(Math.abs(a - b) < eps, `${a} ≠ ${b}`);
const ANY = [];

test("probabilities over all possible hands sum to 1", () => {
  const d = deckWith([[1, 3, ["A"]], [2, 4, ["A", "B"]], [3, 6, ["B"]], [4, 27, []]], ["A", "B"]);
  let total = 0;
  enumerateHands(handModel(d), 5, (_, p) => { total += p; });
  close(total, 1);
});

test("a hand bigger than the deck can't be opened", () => {
  const d = deckWith([[1, 3, ["A"]]], ["A"]);
  assert.equal(patternOdds(d, [[["A"], ANY, ANY, ANY, ANY]], 5).any, 0);
});

/* ---- slot patterns (the Hands page) ---- */

test("[Starter, Any×4] = at least one Starter", () => {
  const d = deckWith([[1, 3, ["S"]], [2, 37, []]], ["S"]);
  close(patternOdds(d, [[["S"], ANY, ANY, ANY, ANY]], 5).each[0], 1 - binom(37, 5) / binom(40, 5));
});

test("two slots of the same category = at least two of it", () => {
  const d = deckWith([[1, 6, ["S"]], [2, 34, []]], ["S"]);
  const atLeast2 = 1 - binom(34, 5) / binom(40, 5) - 6 * binom(34, 4) / binom(40, 5);
  close(patternOdds(d, [[["S"], ["S"], ANY, ANY, ANY]], 5).each[0], atLeast2);
});

test("a slot with two categories means either", () => {
  const d = deckWith([[1, 3, ["A"]], [2, 4, ["B"]], [3, 33, []]], ["A", "B"]);
  close(patternOdds(d, [[["A", "B"], ANY, ANY, ANY, ANY]], 5).each[0], 1 - binom(33, 5) / binom(40, 5));
});

test("one card in two categories can't fill two slots", () => {
  // Only card 1 is A and B: [A, B] needs two different cards, and there's just one kind that fits.
  const d = deckWith([[1, 3, ["A", "B"]], [2, 37, []]], ["A", "B"]);
  const atLeast2 = 1 - binom(37, 5) / binom(40, 5) - 3 * binom(37, 4) / binom(40, 5);
  close(patternOdds(d, [[["A"], ["B"], ANY, ANY, ANY]], 5).each[0], atLeast2);
});

test("Hall's condition: [A or B, A] with only B cards and one A card", () => {
  // Needs an A card for the A slot and another A-or-B card for the other slot.
  const d = deckWith([[1, 1, ["A"]], [2, 3, ["B"]], [3, 36, []]], ["A", "B"]);
  // P(the A card) and at least one B card
  const pA = binom(39, 4) / binom(40, 5), pAnoB = binom(36, 4) / binom(40, 5);
  close(patternOdds(d, [[["A", "B"], ["A"], ANY, ANY, ANY]], 5).each[0], pA - pAnoB);
});

test("several hands: 'any' is the union", () => {
  const d = deckWith([[1, 3, ["A"]], [2, 3, ["B"]], [3, 34, []]], ["A", "B"]);
  const r = patternOdds(d, [[["A"], ANY, ANY, ANY, ANY], [["B"], ANY, ANY, ANY, ANY]], 5);
  close(r.any, 1 - binom(34, 5) / binom(40, 5));
});

test("all-Any is certain; six slots use a six-card hand", () => {
  const d = deckWith([[1, 3, ["S"]], [2, 37, []]], ["S"]);
  close(patternOdds(d, [[ANY, ANY, ANY, ANY, ANY]], 5).each[0], 1);
  close(patternOdds(d, [[["S"], ANY, ANY, ANY, ANY, ANY]], 6).each[0], 1 - binom(37, 6) / binom(40, 6));
});
