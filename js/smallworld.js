// smallworld.js
// Small World: which monsters connect. Two monsters are linked when they share exactly one of
// Type, Attribute, Level, ATK or DEF. A bridge from hand card i to deck card k is a monster j
// linked to both (the entries of A²).
import { isExtra, isMonster, statOk } from "./cards.js";
import { card, deck } from "./store.js";

function swShared(a, b) {
  const s = [];
  if (a.race === b.race) s.push("Type");
  if (a.attr === b.attr) s.push("Attribute");
  if (a.level != null && a.level === b.level) s.push("Level");
  if (statOk(a.atk) && a.atk === b.atk) s.push("ATK");
  if (statOk(a.def) && a.def === b.def) s.push("DEF");
  return s;
}
function swPool(d = deck()) {
  const ids = new Set();
  for (const id of Object.keys(d.main)) { const c = card(id); if (c && isMonster(c) && !isExtra(c)) ids.add(c.id); }
  for (const id of d.swPool) { const c = card(id); if (c) ids.add(c.id); }
  return [...ids].map(card).sort((a, b) => a.name.localeCompare(b.name));
}
function swAdj(P) {
  const n = P.length, A = Array.from({ length: n }, () => new Array(n).fill(null));
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const s = swShared(P[i], P[j]); if (s.length === 1) A[i][j] = A[j][i] = s[0]; }
  return A;
}
// bridges(i -> k) = { j : A[i][j] && A[j][k] }  (entries of A^2)
function bridges(P, A, i, k) { const out = []; for (let j = 0; j < P.length; j++) if (A[i][j] && A[j][k]) out.push(j); return out; }

/* Rows for the bridge finder's focus layout (indices into the pool P):
     hand only:   top = [hand], mid = cards it can reveal, bottom = cards those can fetch
     target only: bottom = [target], mid = cards that fetch it, top = hand cards that reach them
     both:        top = [hand], mid = the bridges between them, bottom = [target]
   Everything else is `rest`. `links` are the pairs to highlight, including links between two
   middle cards (triangles with the chosen card). A card that could sit in two rows goes in the
   first one that applies. The relation is symmetric, so "hand only" and "target only" give the
   same cards, mirrored. */
function focusRows(P, A, hand, target) {
  const n = P.length, idx = [...Array(n).keys()], linked = (i, j) => !!A[i][j];
  let top = [], mid = [], bottom = [];
  if (hand >= 0 && target >= 0) {
    top = [hand]; mid = idx.filter(j => linked(hand, j) && linked(j, target));
    if (target !== hand) bottom = [target];
  } else if (hand >= 0) {
    top = [hand]; mid = idx.filter(j => linked(hand, j));
    bottom = idx.filter(k => k !== hand && !mid.includes(k) && mid.some(j => linked(j, k)));
  } else if (target >= 0) {
    bottom = [target]; mid = idx.filter(j => linked(j, target));
    top = idx.filter(k => k !== target && !mid.includes(k) && mid.some(j => linked(k, j)));
  }
  const used = new Set([...top, ...mid, ...bottom]);
  const links = [];
  for (const a of top) for (const b of mid) if (linked(a, b)) links.push([a, b]);
  // Two linked middle cards close a triangle with the chosen card: each is also a card the other
  // can fetch (a path of length two), so their link belongs to the chain too.
  if (!(hand >= 0 && target >= 0)) for (let x = 0; x < mid.length; x++) for (let y = x + 1; y < mid.length; y++) if (linked(mid[x], mid[y])) links.push([mid[x], mid[y]]);
  for (const a of mid) for (const b of bottom) if (linked(a, b)) links.push([a, b]);
  return { top, mid, bottom, rest: idx.filter(i => !used.has(i)), links };
}

/* Twins: cards with exactly the same neighbours among `links` are interchangeable in the
   chain, so the graph draws each such group as one point. Only `nodes` are grouped. Twins can't be linked to each other (each would be in its
   own neighbourhood), so merging never hides a link. Returns rep: card → its group's first
   card (lowest index, i.e. alphabetical), groups: first card → all members. */
function twinGroups(nodes, links) {
  const nb = new Map();
  for (const [a, b] of links) { (nb.get(a) || nb.set(a, new Set()).get(a)).add(b); (nb.get(b) || nb.set(b, new Set()).get(b)).add(a); }
  const byKey = new Map();
  for (const v of nodes) {
    const key = [...(nb.get(v) || [])].sort((x, y) => x - y).join(",");
    (byKey.get(key) || byKey.set(key, []).get(key)).push(v);
  }
  const rep = new Map(), groups = new Map();
  for (const members of byKey.values()) {
    members.sort((x, y) => x - y);
    groups.set(members[0], members);
    for (const m of members) rep.set(m, members[0]);
  }
  return { rep, groups };
}
// The chain with each twin group replaced by one card (links deduplicated). The centre can have
// twins too (an outer card linked to every bridge); it always leads its group.
function quotient(F, center) {
  const { rep, groups } = twinGroups([center, ...F.mid, ...F.bottom], F.links);
  const lead = rep.get(center);
  if (lead !== center) {
    const members = groups.get(lead); groups.delete(lead); groups.set(center, members);
    for (const m of members) rep.set(m, center);
  }
  const r = v => rep.get(v) ?? v, seen = new Set(), links = [];
  for (const [a, b] of F.links) {
    const x = r(a), y = r(b), key = x < y ? `${x},${y}` : `${y},${x}`;
    if (x !== y && !seen.has(key)) { seen.add(key); links.push([x, y]); }
  }
  return { rep, groups, mid: F.mid.filter(v => r(v) === v), bottom: F.bottom.filter(v => r(v) === v), links };
}

/* Radial layout for the bridge finder when one card is chosen: the card in the centre, `ring1`
   (its bridges) on an inner circle, `ring2` on an outer circle. The angular order is chosen to
   minimise edge crossings (then total edge length): every order of ring1 is tried when it has
   at most MAX_EXACT cards (otherwise a swap-based local search from several starts), each ring2 card sits near the
   mean angle of its ring1 neighbours (the barycenter heuristic), and crossings are counted on the
   actual straight segments, including the spokes from the centre, and a line through a card counts
   as a crossing (see layoutCrossings). Ties are broken by outer cards sitting straight behind inner
   ones (their labels would overlap), then by total length.
   Radii are relative (r2/r1). */
const MAX_EXACT = 6;
function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
/* Crossings in a drawing: two lines crossing, or a line passing through a card that isn't one of
   its own ends. The second covers collinear triangles (A–C running through B) and overlapping
   lines, which a proper-crossing test alone misses; both count the same. `P` maps cards to points
   (unit = inner ring radius), `segs` are [card, card] pairs. Also returns total length. */
const CARD_RADIUS = 0.08;
function layoutCrossings(P, segs) {
  let cross = 0, len = 0;
  for (let i = 0; i < segs.length; i++) {
    const [a, b] = segs[i], A = P.get(a), B = P.get(b); len += Math.hypot(A[0] - B[0], A[1] - B[1]);
    for (let j = i + 1; j < segs.length; j++) {
      const [c, d] = segs[j]; if (a === c || a === d || b === c || b === d) continue;
      if (segmentsCross(A, B, P.get(c), P.get(d))) cross++;
    }
    for (const [v, q] of P) if (v !== a && v !== b && distToSegment(q, A, B) < CARD_RADIUS) cross++;
  }
  return { cross, len };
}
function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}
const radialCache = new Map();
function radialOrder(ring1, ring2, links, r2 = 1.8) {
  const key = JSON.stringify([ring1, ring2, links, r2]);
  if (!radialCache.has(key)) { if (radialCache.size > 50) radialCache.clear(); radialCache.set(key, computeRadial(ring1, ring2, links, r2)); }
  return radialCache.get(key);
}
function computeRadial(ring1, ring2, links, r2) {
  const n1 = ring1.length, n2 = ring2.length, TAU = 2 * Math.PI;
  const nbr = new Map(ring2.map(v => [v, links.filter(([a, b]) => (a === v && ring1.includes(b)) || (b === v && ring1.includes(a))).map(([a, b]) => a === v ? b : a)]));
  const pt = (r, t) => [r * Math.cos(t), r * Math.sin(t)];
  // Evaluate one order of ring1: place ring2, then score it (crossings, overlaps, length).
  function evaluate(order) {
    const ang1 = new Map(order.map((u, k) => [u, -Math.PI / 2 + TAU * k / n1]));
    const bary = ring2.map(v => {
      const ns = nbr.get(v); if (!ns.length) return [v, 0];
      const sx = ns.reduce((a, u) => a + Math.cos(ang1.get(u)), 0), sy = ns.reduce((a, u) => a + Math.sin(ang1.get(u)), 0);
      return [v, Math.atan2(sy, sx)];
    }).sort((a, b) => a[1] - b[1]);
    // Even spacing in barycenter order, rotated to stay close to the barycenters, or half a step
    // off that so outer cards don't hide straight behind inner ones.
    const base = n2 ? Math.atan2(...[1, 0].map(f => bary.reduce((a, [, t], k) => a + (f ? Math.sin(t - TAU * k / n2) : Math.cos(t - TAU * k / n2)), 0))) : 0;
    let best = null;
    for (const off of n2 ? [base, base + Math.PI / n2, base - Math.PI / n2] : [0]) {
      const ang2 = new Map(bary.map(([v], k) => [v, off + TAU * k / n2]));
      const r = score(order, ang1, ang2);
      if (better(r, best)) best = r;
    }
    return best;
  }
  function score(order, ang1, ang2) {
    const P = new Map([["c", [0, 0]], ...order.map(u => [u, pt(1, ang1.get(u))]), ...ring2.map(v => [v, pt(r2, ang2.get(v))])]);
    const segs = [...order.map(u => ["c", u]), ...links.filter(([a, b]) => P.has(a) && P.has(b))];
    const { cross, len } = layoutCrossings(P, segs);
    // tie-break only: an outer card straight behind an inner card puts their labels on top of each other
    let aligned = 0;
    for (const t2 of ang2.values()) for (const t1 of ang1.values()) if (Math.abs(Math.atan2(Math.sin(t2 - t1), Math.cos(t2 - t1))) < 0.18) aligned++;
    return { cross, overlap: aligned, len, ang1, ang2 };
  }
  function better(x, y) {
    if (!y) return true;
    if (x.cross !== y.cross) return x.cross < y.cross;
    if (x.overlap !== y.overlap) return x.overlap < y.overlap;
    return x.len < y.len - 1e-9;
  }
  let best = null;
  if (n1 <= MAX_EXACT) {
    // All orders with ring1[0] fixed in place (rotations of a circle look the same).
    const rest = ring1.slice(1), used = new Array(rest.length).fill(false), cur = [ring1[0]];
    (function perm() {
      if (cur.length === n1) { const r = evaluate(cur.slice()); if (better(r, best)) best = r; return; }
      for (let i = 0; i < rest.length; i++) if (!used[i]) { used[i] = true; cur.push(rest[i]); perm(); cur.pop(); used[i] = false; }
    })();
  } else {
    // Local search: swap pairs while it helps, from a few starting orders (seeded, so repeatable).
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let start = 0; start < 6; start++) {
      let order = ring1.slice();
      if (start) for (let i = n1 - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
      let cur = evaluate(order);
      for (let improved = true; improved;) {
        improved = false;
        for (let i = 0; i < n1; i++) for (let j = i + 1; j < n1; j++) {
          const o = order.slice(); [o[i], o[j]] = [o[j], o[i]];
          const r = evaluate(o); if (better(r, cur)) { cur = r; order = o; improved = true; }
        }
      }
      if (better(cur, best)) best = cur;
    }
  }
  // Refinement: alternately move one inner card (outer order kept) and one outer card (inner order
  // kept) to any other slot, at a few rotations of the outer ring, while that lowers the score.
  // Placing outer cards by barycenter alone sometimes leaves crossings a different order avoids.
  if (best && n1 > 1 || best && n2 > 1) {
    const place = (o1, o2) => {
      const ang1 = new Map(o1.map((u, k) => [u, -Math.PI / 2 + TAU * k / n1]));
      let b = null;
      for (let s = 0; s < (n2 ? 4 : 1); s++) {
        const off = -Math.PI / 2 + TAU * s / (4 * Math.max(1, n2)), ang2 = new Map(o2.map((v, k) => [v, off + TAU * k / n2]));
        const r = score(o1, ang1, ang2); if (better(r, b)) b = r;
      }
      return b;
    };
    const byAngle = m => [...m.keys()].sort((a, b) => m.get(a) - m.get(b));
    let o1 = byAngle(best.ang1), o2 = byAngle(best.ang2);
    const cur = place(o1, o2); if (better(cur, best)) best = cur;
    const moves = (arr, apply) => {
      let improved = false;
      for (let i = 0; i < arr.length; i++) for (let j = 0; j < arr.length; j++) {
        if (i === j) continue;
        const o = arr.slice(); o.splice(j, 0, o.splice(i, 1)[0]);
        const r = apply(o); if (better(r, best)) { best = r; arr.splice(0, arr.length, ...o); improved = true; }
      }
      return improved;
    };
    for (let round = 0; round < 4; round++) {
      const a = n1 > 2 && moves(o1, o => place(o, o2)), b = n2 > 1 && moves(o2, o => place(o1, o));
      if (!a && !b) break;
    }
  }
  return best || { cross: 0, overlap: 0, len: 0, ang1: new Map(), ang2: new Map() };
}

export { bridges, distToSegment, layoutCrossings, focusRows, quotient, twinGroups, MAX_EXACT, radialOrder, segmentsCross, swAdj, swPool, swShared };
