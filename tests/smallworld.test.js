import { test } from "node:test";
import assert from "node:assert/strict";
import { swShared, swAdj, bridges, focusRows } from "../js/smallworld.js";

const m = (name, race, attr, level, atk, def) => ({ name, race, attr, level, atk, def });
// Hand H (Dragon DARK 4 1800/1000) -> bridge B (Warrior DARK 3 1200/500) -> target T (Warrior LIGHT 8 2500/2000)
const H = m("H", "Dragon", "DARK", 4, 1800, 1000), B = m("B", "Warrior", "DARK", 3, 1200, 500),
  T = m("T", "Warrior", "LIGHT", 8, 2500, 2000), X = m("X", "Fiend", "WATER", 1, 0, 0),
  C = m("C", "Zombie", "FIRE", 3, 0, 1800);                  // shares only Level with B
const P = [H, B, T, X, C], A = swAdj(P);

test("linked when exactly one property matches", () => {
  assert.deepEqual(swShared(H, B), ["Attribute"]);
  assert.equal(A[0][1], "Attribute");
  assert.equal(A[1][2], "Type");
  assert.equal(A[0][2], null);
  assert.equal(A[0][0], null);                                 // a card shares everything with itself
});

test("bridges are the middle cards of hand -> bridge -> target", () => {
  assert.deepEqual(bridges(P, A, 0, 2), [1]);
  assert.deepEqual(bridges(P, A, 0, 4), [1]);
});

test("focus rows: hand only", () => {
  const r = focusRows(P, A, 0, -1);
  assert.deepEqual([r.top, r.mid, r.bottom], [[0], [1], [2, 4]]);
  assert.deepEqual(r.rest, [3]);
});

test("focus rows: target only", () => {
  const r = focusRows(P, A, -1, 2);
  assert.deepEqual([r.top, r.mid, r.bottom], [[0, 4], [1], [2]]);
});

test("focus rows: both chosen shows only the bridges between them", () => {
  const r = focusRows(P, A, 0, 2);
  assert.deepEqual([r.top, r.mid, r.bottom], [[0], [1], [2]]);
  assert.deepEqual(r.rest.sort(), [3, 4]);
  assert.deepEqual(r.links, [[0, 1], [1, 2]]);
});

/* ---- radial layout: crossing minimisation ---- */
import { radialOrder, segmentsCross } from "../js/smallworld.js";

test("segment crossing test", () => {
  assert.equal(segmentsCross([0, 0], [2, 2], [0, 2], [2, 0]), true);
  assert.equal(segmentsCross([0, 0], [1, 0], [0, 1], [1, 1]), false);
});

test("a star with a matching outer ring has no crossings", () => {
  // inner a,b,c,d each with its own outer card A,B,C,D
  const links = [["a", "A"], ["b", "B"], ["c", "C"], ["d", "D"]];
  assert.equal(radialOrder(["a", "b", "c", "d"], ["A", "B", "C", "D"], links).cross, 0);
});

test("orders that would cross are untangled", () => {
  // outer cards each join two inner cards: a-b, b-c, c-d, d-e, e-a form a cycle; a crossing-free
  // drawing exists (inner order around the circle matching the cycle), even if given scrambled.
  const inner = ["a", "c", "e", "b", "d"];
  const links = [["a", "X1"], ["b", "X1"], ["b", "X2"], ["c", "X2"], ["c", "X3"], ["d", "X3"], ["d", "X4"], ["e", "X4"], ["e", "X5"], ["a", "X5"]];
  const r = radialOrder(inner, ["X1", "X2", "X3", "X4", "X5"], links);
  assert.equal(r.cross, 0);
});

test("fast at the exact-search limit and beyond", () => {
  const inner = ["a", "b", "c", "d", "e", "f", "g", "h"], outer = ["1", "2", "3", "4", "5", "6", "7"];
  const links = outer.flatMap((v, k) => [[inner[k], v], [inner[(k * 3 + 1) % 8], v]]);
  for (const n of [7, 8, 12]) {
    const t = performance.now();
    radialOrder(inner.concat(["i", "j", "k", "l"]).slice(0, n), outer, links);
    assert.ok(performance.now() - t < 400, `${n} bridges took ${performance.now() - t} ms`);
  }
});

test("triangles: two linked bridges are both bridges and fetchable, and their link is in the chain", () => {
  // O links to A and B (Attribute and Type), and A–B share only Level: O → A → B is a path of length two.
  const O = m("O", "Dragon", "DARK", 4, 1800, 1000), Am = m("A", "Warrior", "DARK", 3, 1200, 500), Bm = m("B", "Dragon", "LIGHT", 3, 0, 0);
  const Q = [O, Am, Bm], AQ = swAdj(Q);
  assert.equal(AQ[1][2], "Level");
  const r = focusRows(Q, AQ, 0, -1);
  assert.deepEqual([r.top, r.mid, r.bottom], [[0], [1, 2], []]);
  assert.ok(r.links.some(([a, b]) => (a === 1 && b === 2) || (a === 2 && b === 1)));
  assert.deepEqual(bridges(Q, AQ, 0, 2), [1]);                // B is fetchable from O through A
});

test("the relation is symmetric: centring as hand or as target gives the same cards", () => {
  const h = focusRows(P, A, 2, -1), t = focusRows(P, A, -1, 2);
  assert.deepEqual([h.mid, h.bottom.slice().sort()], [t.mid, t.top.slice().sort()]);
});

/* ---- twins ---- */
import { twinGroups, quotient } from "../js/smallworld.js";

test("cards with the same neighbours are grouped; different ones aren't", () => {
  // centre 0; bridges 1, 2; outer 3 and 4 both linked to exactly {1, 2}; outer 5 linked to {2}
  const links = [[0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [2, 4], [2, 5]];
  const { rep, groups } = twinGroups([1, 2, 3, 4, 5], links);
  assert.equal(rep.get(4), 3);
  assert.deepEqual(groups.get(3), [3, 4]);
  assert.equal(rep.get(5), 5);
  assert.equal(rep.get(1), 1); assert.equal(rep.get(2), 2);       // 1 and 2 differ (2 also reaches 5)
});

test("the quotient keeps one card per group and deduplicates links", () => {
  // outer 3 and 4 are linked to exactly the centre's bridges {1, 2}: they join the centre's group
  const F = { mid: [1, 2], bottom: [3, 4, 5], links: [[0, 1], [0, 2], [1, 3], [2, 3], [1, 4], [2, 4], [2, 5]] };
  const q = quotient(F, 0);
  assert.deepEqual(q.groups.get(0), [0, 3, 4]);
  assert.deepEqual([q.mid, q.bottom], [[1, 2], [5]]);
  assert.equal(q.links.length, 3);                                // 0-1, 0-2, 2-5
});

test("bridges that are twins merge too", () => {
  // bridges 1 and 2 are both linked only to the centre and to outer card 3
  const F = { mid: [1, 2], bottom: [3], links: [[0, 1], [0, 2], [1, 3], [2, 3]] };
  const q = quotient(F, 0);
  assert.deepEqual(q.groups.get(1), [1, 2]);
  assert.deepEqual(q.mid, [1]);
});

test("an outer card linked to every bridge is the centre's twin, and the centre leads the group", () => {
  // centre 5 with bridges 1, 2; outer 0 is linked to both bridges, exactly like the centre
  const F = { mid: [1, 2], bottom: [0, 3], links: [[5, 1], [5, 2], [1, 0], [2, 0], [2, 3]] };
  const q = quotient(F, 5);
  assert.deepEqual(q.groups.get(5), [0, 5]);
  assert.equal(q.rep.get(0), 5);
  assert.deepEqual(q.bottom, [3]);                                  // 0 is drawn with the centre
});

/* ---- overlaps count as crossings ---- */
import { layoutCrossings } from "../js/smallworld.js";

test("a line through a card counts as a crossing (collinear triangle A, B, C)", () => {
  const P = new Map([["A", [0, 0]], ["B", [1, 0]], ["C", [2, 0]]]);
  assert.equal(layoutCrossings(P, [["A", "B"], ["B", "C"], ["A", "C"]]).cross, 1);   // A–C runs through B
  const bent = new Map([["A", [0, 0]], ["B", [1, 0.5]], ["C", [2, 0]]]);
  assert.equal(layoutCrossings(bent, [["A", "B"], ["B", "C"], ["A", "C"]]).cross, 0);
});

test("a chord between opposite inner cards runs through the centre: the order avoids it", () => {
  // four bridges; a–c are linked. Opposite each other, the chord would cross the centre card.
  const r = radialOrder(["a", "b", "c", "d"], [], [["a", "c"]], 1.85);
  assert.equal(r.cross, 0);
  const d = Math.abs(Math.atan2(Math.sin(r.ang1.get("a") - r.ang1.get("c")), Math.cos(r.ang1.get("a") - r.ang1.get("c"))));
  assert.ok(d < Math.PI - 0.1, "a and c must not be opposite");
});
