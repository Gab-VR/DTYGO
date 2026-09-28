// prob.js
import { binom } from "./util.js";

/* ================= hand probabilities =================
   The Main Deck is partitioned into "atoms": cards with identical category sets.
   A hand is a vector x of atom counts; P(x) = prod C(n_i, x_i) / C(N, h)
   (multivariate hypergeometric). We enumerate all x with |x| = h. */
function handModel(d) {
  const idx = new Map(d.cats.map((k, i) => [k.id, i])), atoms = new Map(); let N = 0;
  for (const [id, n] of Object.entries(d.main)) {
    let mask = 0; for (const t of d.tags[id] || []) if (idx.has(t)) mask |= 1 << idx.get(t);
    atoms.set(mask, (atoms.get(mask) || 0) + n); N += n;
  }
  return { N, idx, k: d.cats.length, atoms: [...atoms].map(([mask, n]) => ({ mask, n })) };
}
function enumerateHands(M, hs, visit) {
  const A = M.atoms, total = binom(M.N, hs); if (!A.length || hs > M.N || hs < 0) return;
  const x = new Array(A.length).fill(0), cc = new Array(M.k).fill(0);
  const leaf = w => { cc.fill(0); for (let i = 0; i < A.length; i++) if (x[i]) for (let j = 0; j < M.k; j++) if (A[i].mask >> j & 1) cc[j] += x[i]; visit(cc, w / total, x); };
  (function rec(i, left, w) {
    if (i === A.length - 1) { if (left > A[i].n) return; x[i] = left; leaf(w * binom(A[i].n, left)); return; }
    const top = Math.min(left, A[i].n);
    for (let t = 0; t <= top; t++) { x[i] = t; rec(i + 1, left - t, w * binom(A[i].n, t)); }
    x[i] = 0;
  })(0, hs, 1);
}
/* ================= hand patterns (the Hands page) =================
   A pattern is a list of slots, one per card in hand; a slot is a list of category ids
   (a card fits if it has any of them) or empty for "Any". A hand matches when every
   card can be given its own slot. With |hand| = |slots| the "Any" slots take whatever is
   left, so the hand matches iff the specific slots can be filled by distinct cards, which
   by Hall's theorem means: every group T of specific slots has at least |T| drawn cards
   fitting at least one slot of T. */
function slotMask(M, slot) { let m = 0; for (const id of slot) if (M.idx.has(id)) m |= 1 << M.idx.get(id); return m; }
function hallChecks(M, pattern) {
  const req = pattern.map(s => slotMask(M, s)).filter(Boolean), out = [];
  for (let t = 1; t < 1 << req.length; t++) {
    let union = 0, size = 0;
    for (let j = 0; j < req.length; j++) if (t >> j & 1) { union |= req[j]; size++; }
    out.push([union, size]);
  }
  return out;
}
// Chance of each pattern, and of matching at least one of them, in a hand of `hs` cards.
function patternOdds(d, patterns, hs) {
  const M = handModel(d), res = { each: patterns.map(() => 0), any: 0, N: M.N };
  const checks = patterns.map(p => hallChecks(M, p));
  enumerateHands(M, hs, (cc, p, x) => {
    let any = false;
    checks.forEach((groups, i) => {
      const ok = groups.every(([union, size]) => {
        let fit = 0;
        for (let a = 0; a < x.length; a++) if (x[a] && (M.atoms[a].mask & union)) fit += x[a];
        return fit >= size;
      });
      if (ok) { res.each[i] += p; any = true; }
    });
    if (any) res.any += p;
  });
  return res;
}
export { enumerateHands, handModel, patternOdds };
