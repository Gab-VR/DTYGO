// tabs/smallworld.js
import { isExtra, isMonster } from "../cards.js";
import { bridges, distToSegment, focusRows, quotient, radialOrder, swAdj, swPool } from "../smallworld.js";
import { card, deck, save } from "../store.js";
import { cardPicker } from "../ui.js";
import { $, h } from "../util.js";

/* ================= small world ================= */
const SW = { view: "graph", center: null, mark: null, sim: null };
const ATTR_COL = { DARK: "#8e6bc9", LIGHT: "#e8d77a", EARTH: "#a47a4e", WATER: "#4f9ad8", FIRE: "#e0664a", WIND: "#6cc58b", DIVINE: "#72d5c8" };
function renderSW() {
  const root = $("#tab-sw"), d = deck(), P = swPool(d), A = swAdj(P);
  const ix = new Map(P.map((c, i) => [c.id, i]));
  // Always one card in the centre: the first alphabetically unless another was chosen.
  if (!ix.has(SW.center)) SW.center = P.length ? P[0].id : null;
  if (!ix.has(SW.mark)) SW.mark = null;
  const setView = v => { SW.view = v; renderSW(); };
  let main;
  if (!P.length) main = h("div", { class: "panel" }, h("h2", {}, "No monsters"), null);
  else if (SW.view === "graph") { const cv = h("canvas", { "aria-label": "Small World graph" }); main = h("div", { class: "panel" }, cv); requestAnimationFrame(() => startGraph(cv, P, A)); }
  else {
    const M = P.map((_, i) => P.map((_, k) => bridges(P, A, i, k).length)), mx = Math.max(1, ...M.flat());
    main = h("div", { class: "panel" }, h("div", { class: "matrix-wrap" }, h("table", { class: "matrix" },
        h("tr", {}, h("th", {}), P.map(c => h("th", { class: "ch", title: c.name }, c.name))),
        P.map((c, i) => h("tr", {}, h("th", { class: "rh", title: c.name }, c.name), P.map((t, k) => h("td", {
          style: { background: M[i][k] ? `rgba(47,181,165,${0.18 + 0.82 * M[i][k] / mx})` : "transparent", color: M[i][k] / mx > .5 ? "#06201d" : "" },
          title: `${c.name} → ${t.name}: ${M[i][k]} bridge${M[i][k] === 1 ? "" : "s"}`,
          onclick: () => { SW.center = c.id; SW.mark = t.id; SW.view = "graph"; renderSW(); } }, M[i][k] || "")))))));
  }
  // Top bar: view switch, counts, and extra monsters for the pool (ones not in the Main Deck).
  const extras = d.swPool.map(card).filter(Boolean);
  const dropExtra = id => { d.swPool = d.swPool.filter(x => x !== id); save(); renderSW(); };
  root.className = "tab on";
  root.replaceChildren(h("div", { class: "row sw-bar" },
    h("div", { class: "seg" }, [["graph", "Graph"], ["matrix", "Bridge matrix"]].map(([v, l]) => h("button", { "aria-pressed": SW.view === v, onclick: () => setView(v) }, l))),
    h("span", { class: "dim" }, `${P.length} monsters, ${A.flat().filter(Boolean).length / 2} links`),
    h("div", { class: "sw-extras" },
      h("div", { class: "sw-add" }, cardPicker(c => { if (!d.swPool.includes(c.id) && !d.main[c.id]) { d.swPool.push(c.id); save(); renderSW(); } }, c => isMonster(c) && !isExtra(c), "Add a monster to the pool")),
      extras.map(c => h("span", { class: "sw-chip" }, c.name,
        h("button", { class: "x", "aria-label": `Remove ${c.name} from the pool`, onclick: () => dropExtra(c.id) }, "×"))))),
    main);
}
/* The graph: always radial. One card sits in the centre (click a card to centre it); its
   bridges are on the inner ring and the cards two steps away on the outer ring, ordered to
   minimise crossings. Small World links are symmetric, so this shows both what the centre card
   can fetch and what can fetch it. A marked card (from the Bridge matrix) has its paths drawn
   brighter. Cards with the same neighbours (twins) share one point, drawn as a stack. Cards
   outside the chain are parked, faded, at the sides. Link labels appear only for
   the hovered card or link. The canvas is redrawn at its real size whenever it's resized. */
function startGraph(cv, P, A) {
  if (SW.sim) { cancelAnimationFrame(SW.sim.raf); SW.sim.ro?.disconnect(); }
  const g = cv.getContext("2d");
  // Tall enough for true circles, but never taller than the window.
  const fitsWindow = Math.max(420, window.innerHeight - cv.getBoundingClientRect().top - 24);
  cv.style.height = Math.round(Math.min(900, fitsWindow, Math.max(cv.clientWidth < 600 ? 420 : 600, cv.clientWidth * 0.78))) + "px";
  let W = cv.clientWidth, H = cv.clientHeight;
  const fit = () => { const dpr = window.devicePixelRatio || 1; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); };
  fit();
  const old = SW.sim && SW.sim.pos || new Map();
  const N = P.map(c => { const o = old.get(c.id); return { c, x: o ? o.x : W / 2, y: o ? o.y : H / 2, tx: null, ty: null }; });
  const E = []; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (A[i][j]) E.push([i, j, A[i][j]]);
  const ci = P.findIndex(c => c.id === SW.center), mi = SW.mark != null ? P.findIndex(c => c.id === SW.mark) : -1;
  const F = focusRows(P, A, ci, -1);
  const inChain = new Set([ci, ...F.mid, ...F.bottom]);
  const pair = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
  const chainLink = new Set(F.links.map(([a, b]) => pair(a, b)));
  // Paths centre → bridge → marked card, drawn brighter.
  const markLink = new Set(mi >= 0 && mi !== ci ? bridges(P, A, ci, mi).flatMap(j => [pair(ci, j), pair(j, mi)]) : []);
  // Inner-ring cards (and the centre itself) that are also two steps away get a thin ring.
  const twoSteps = new Set([ci, ...F.mid].filter(k => bridges(P, A, ci, k).length));
  // Twins (same neighbours in the chain) share one point; the layout is computed on that smaller graph.
  const Q = quotient(F, ci), repOf = i => Q.rep.get(i) ?? i, groupOf = i => Q.groups.get(repOf(i)) || [i];
  const R = radialOrder(Q.mid, Q.bottom, Q.links, 1.85);
  const sim = SW.sim = { raf: 0, drag: null, hover: -1, hoverEdge: -1, pos: new Map(), ro: null, rings: null };

  function place() {
    const side = F.rest.length ? Math.min(130, W * 0.14) : 10;           // room for parked cards only if there are any
    const cx = W / 2, cy = H / 2 + 6, u = Math.max(40, Math.min((W / 2 - side - 70) / 1.85, (H / 2 - 44) / 1.85));
    sim.rings = { cx, cy, r1: u, r2: u * 1.85 };
    for (const n of N) { n.ang = null; n.ring = 0; }
    const c = N[ci]; c.tx = cx; c.ty = cy;
    const ring = (angles, k) => { for (const [i, t] of angles) { N[i].tx = cx + k * u * Math.cos(t); N[i].ty = cy + k * u * Math.sin(t); N[i].ang = t; N[i].ring = k === 1 ? 1 : 2; } };
    ring(R.ang1, 1); ring(R.ang2, 1.85);
    for (const [r, members] of Q.groups) for (const m of members) if (m !== r) Object.assign(N[m], { tx: N[r].tx, ty: N[r].ty, ang: N[r].ang, ring: N[r].ring });
    const perCol = Math.max(1, Math.floor((H - 40) / 42));
    F.rest.forEach((i, k) => {
      const left = k % 2 === 0, col = Math.floor(k / 2 / perCol), r = Math.floor(k / 2) % perCol;
      N[i].tx = left ? 16 + col * 60 + 30 : W - 16 - col * 60 - 30;
      N[i].ty = 24 + r * 42;
    });
  }
  place();
  const glide = () => {
    const dragged = sim.drag ? groupOf(N.indexOf(sim.drag)) : [];
    for (const [k, n] of N.entries()) {
      if (dragged.includes(k)) { n.x = sim.drag.x; n.y = sim.drag.y; continue; }   // a group moves together
      if (n.tx != null) { n.x += (n.tx - n.x) * 0.14; n.y += (n.ty - n.y) * 0.14; }
    }
  };

  // Text with a dark outline, readable on top of lines.
  const label = (text, x, y) => { g.lineJoin = "round"; g.lineWidth = 4; g.strokeStyle = "#1e1f22"; g.strokeText(text, x, y); g.fillText(text, x, y); };
  // A link's label, turned to follow the line (never upside down) and set just above it.
  const edgeLabel = (text, a, b) => {
    let t = Math.atan2(b.y - a.y, b.x - a.x);
    if (t > Math.PI / 2 || t < -Math.PI / 2) t += Math.PI;
    g.save(); g.translate((a.x + b.x) / 2, (a.y + b.y) / 2); g.rotate(t);
    g.textAlign = "center"; label(text, 0, -5);
    g.restore();
  };
  // Soft bands behind the rings (areas, not lines, so they don't read as extra links).
  const bands = () => {
    const rg = sim.rings;
    const band = (r, fill) => {
      g.beginPath(); g.arc(rg.cx, rg.cy, r + 24, 0, 2 * Math.PI); g.arc(rg.cx, rg.cy, Math.max(0, r - 24), 0, 2 * Math.PI, true);
      g.fillStyle = fill; g.fill();
    };
    band(rg.r1, "rgba(47,181,165,0.10)"); band(rg.r2, "rgba(159,162,168,0.06)");
  };
  const circle = (n, r, col, w) => { g.lineWidth = w; g.strokeStyle = col; g.beginPath(); g.arc(n.x, n.y, r, 0, 2 * Math.PI); g.stroke(); };
  const draw = () => {
    g.clearRect(0, 0, W, H);
    bands();
    const hv = sim.hover, he = sim.hoverEdge, hoverGroup = hv >= 0 ? groupOf(hv) : [], shown = new Map();
    // Twins share a point, so their links share a line: draw each line once, in its strongest style.
    const lines = new Map();
    E.forEach(([i, j, lab], k) => {
      const a = repOf(i), b = repOf(j); if (a === b) return;
      const key = pair(a, b), cur = lines.get(key) || { a, b, chain: false, marked: false, labs: new Set(), hovered: false };
      cur.chain ||= chainLink.has(pair(i, j)); cur.marked ||= markLink.has(pair(i, j)); cur.labs.add(lab);
      cur.hovered ||= hoverGroup.includes(i) || hoverGroup.includes(j) || (he >= 0 && key === pair(repOf(E[he][0]), repOf(E[he][1])));
      lines.set(key, cur);
    });
    for (const [key, L] of lines) {
      g.strokeStyle = L.marked ? "rgba(255,255,255,.95)" : L.chain ? (markLink.size ? "rgba(114,213,200,.45)" : "rgba(114,213,200,.9)") : "rgba(159,162,168,.07)";
      g.lineWidth = L.marked ? 2.6 : L.chain ? 1.8 : 1;
      g.beginPath(); g.moveTo(N[L.a].x, N[L.a].y); g.lineTo(N[L.b].x, N[L.b].y); g.stroke();
      if (L.hovered) shown.set(key, [N[L.a], N[L.b], L.labs]);         // hovering only adds labels
    }
    g.fillStyle = "#72d5c8"; g.font = "11px system-ui";
    for (const [a, b, labs] of shown.values()) edgeLabel([...labs].join(" / "), a, b);
    N.forEach((n, i) => {
      if (repOf(i) !== i) return;                                       // twins are drawn with their group
      const members = groupOf(i), faded = !inChain.has(i);
      g.globalAlpha = faded ? 0.3 : 1;
      // a group is a small stack of dots, one per card (up to four), in each card's Attribute colour
      members.slice(0, 4).reverse().forEach((m, k, arr) => {
        const off = (arr.length - 1 - k) * 4;
        g.beginPath(); g.arc(n.x + off, n.y - off, 9, 0, 2 * Math.PI); g.fillStyle = ATTR_COL[P[m].attr] || "#999"; g.fill();
        if (arr.length > 1) { g.lineWidth = 1.2; g.strokeStyle = "#1e1f22"; g.stroke(); }
      });
      if (i === ci) { circle(n, 14, "#fff", 2); if (twoSteps.has(i)) circle(n, 18, "#72d5c8", 1.5); }
      else if (members.some(m => twoSteps.has(m))) circle(n, 13, "#72d5c8", 1.5);
      if (mi >= 0 && mi !== ci && members.includes(mi)) { circle(n, 13, "#fff", 2); circle(n, 17, "#fff", 1.2); }
      g.fillStyle = "#e8e8e6"; g.font = (i === ci || members.includes(mi) || i === hv ? "600 " : "") + "12px system-ui";
      const short = c => { let t = c.name.length > 26 ? c.name.slice(0, 25) + "…" : c.name; return faded && t.length > 14 ? t.slice(0, 13) + "…" : t; };
      const names = members.length > 4 ? [...members.slice(0, 3).map(m => short(P[m])), `+${members.length - 3} more`] : members.map(m => short(P[m]));
      // Several names stack into lines, growing away from the card.
      const nameLines = (x, y, up) => names.forEach((t, k) => label(t, x, up ? y - (names.length - 1 - k) * 14 : y + k * 14));
      if (n.ring === 2) {                                               // outer ring: label points outward
        const cs = Math.cos(n.ang), sn = Math.sin(n.ang);
        g.textAlign = cs > 0.35 ? "left" : cs < -0.35 ? "right" : "center";
        const y = n.y + sn * 16 + (Math.abs(cs) > 0.35 ? 4 : sn > 0 ? 12 : -2);
        nameLines(n.x + cs * 16, Math.abs(cs) > 0.35 ? y - (names.length - 1) * 7 : y, Math.abs(cs) <= 0.35 && sn < 0);
      } else if (n.ring === 1) {                                        // inner ring: beside the card, across its spoke
        const sn = Math.sin(n.ang);
        if (Math.abs(sn) > 0.7) { g.textAlign = "left"; nameLines(n.x + 14, n.y + 4 - (names.length - 1) * 7, false); }
        else { g.textAlign = "center"; nameLines(n.x, n.y + (sn >= 0 ? 24 : -14), sn < 0); }
      } else if (i === ci) { g.textAlign = "center"; nameLines(n.x, n.y - 22, true); }
      else { g.textAlign = "center"; nameLines(n.x, n.y + 24, false); }
    });
    g.globalAlpha = 1;
  };
  const loop = () => {
    if (!cv.isConnected) { sim.ro?.disconnect(); return; }
    glide(); draw(); placePop(); N.forEach(n => sim.pos.set(n.c.id, { x: n.x, y: n.y })); sim.raf = requestAnimationFrame(loop);
  };

  // Redraw at the new size instead of letting the browser stretch the picture.
  sim.ro = new ResizeObserver(() => {
    const w = cv.clientWidth, h = cv.clientHeight; if (!w || !h || (w === W && h === H)) return;
    for (const n of N) { n.x *= w / W; n.y *= h / H; }
    W = w; H = h; fit(); place();
  });
  sim.ro.observe(cv);

  const at = e => { const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, i = N.findIndex(n => (n.x - x) ** 2 + (n.y - y) ** 2 < 180); return i < 0 ? i : repOf(i); };
  // The chain link under the pointer (within 5px).
  const edgeAt = e => {
    const r = cv.getBoundingClientRect(), p = [e.clientX - r.left, e.clientY - r.top];
    let best = -1, bestD = 5;
    E.forEach(([i, j], k) => {
      if (!chainLink.has(pair(i, j))) return;
      const d = distToSegment(p, [N[i].x, N[i].y], [N[j].x, N[j].y]);
      if (d < bestD) { bestD = d; best = k; }
    });
    return best;
  };
  // Clicking a stack lists its cards in a small box beside it; a name there centres that card.
  const pop = h("div", { class: "sw-pop", hidden: true });
  cv.parentElement.style.position = "relative"; cv.parentElement.append(pop);
  sim.popFor = -1;
  const openPop = i => {
    sim.popFor = i;
    pop.replaceChildren(...groupOf(i).map(m => h("button", { class: "sw-pop-item", onclick: () => { SW.center = P[m].id; SW.mark = null; renderSW(); } },
      h("span", { class: "dot", style: { background: ATTR_COL[P[m].attr] || "#999" } }), P[m].name)));
    pop.hidden = false; placePop();
  };
  const closePop = () => { sim.popFor = -1; pop.hidden = true; };
  const placePop = () => {
    if (sim.popFor < 0) return;
    const n = N[sim.popFor], left = cv.offsetLeft + n.x + 20, flip = n.x > W - 220;
    pop.style.left = (flip ? cv.offsetLeft + n.x - 20 - pop.offsetWidth : left) + "px";
    pop.style.top = Math.max(4, cv.offsetTop + n.y - 14) + "px";
  };
  let downAt = null;
  cv.oncontextmenu = e => e.preventDefault();
  cv.onpointerdown = e => { if (e.button !== 0) return; const i = at(e); downAt = { x: e.clientX, y: e.clientY, i }; if (i >= 0) { sim.drag = N[i]; cv.setPointerCapture(e.pointerId); } };
  cv.onpointermove = e => { const r = cv.getBoundingClientRect();
    if (sim.drag) { sim.drag.x = e.clientX - r.left; sim.drag.y = e.clientY - r.top; }
    else { sim.hover = at(e); sim.hoverEdge = sim.hover >= 0 ? -1 : edgeAt(e); } };
  cv.onpointerup = e => {
    if (e.button !== 0) return;
    const moved = downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4, n = sim.drag, i = downAt ? downAt.i : -1;
    sim.drag = null; downAt = null;
    if (!moved) {
      if (i < 0) { closePop(); if (SW.mark != null) { SW.mark = null; renderSW(); } return; }   // the void: close the list, clear the mark
      if (groupOf(i).length > 1) { sim.popFor === i ? closePop() : openPop(i); return; }       // a stack: list its cards
      if (P[i].id !== SW.center) { SW.center = P[i].id; SW.mark = null; renderSW(); }          // a single card: centre it
      return;
    }
    if (n) for (const m of groupOf(N.indexOf(n))) { N[m].tx = n.x; N[m].ty = n.y; }            // the dragged group stays where it's dropped
  };
  cv.onpointerleave = () => { sim.hover = -1; sim.hoverEdge = -1; };
  loop();
}

export { ATTR_COL, renderSW, startGraph, SW };
