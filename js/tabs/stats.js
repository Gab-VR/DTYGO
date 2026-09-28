// tabs/stats.js
import { baseFrame, isMonster, isSpell } from "../cards.js";
import { deckPoints, pointsOf } from "../legality.js";
import { categoryCopies } from "../deck.js";
import { card, count, deck, fmt } from "../store.js";
import { $, binom, h, pct } from "../util.js";

/* ================= stats tab ================= */
function bars(title, entries, color) {
  const max = Math.max(1, ...entries.map(e => e[1]));
  return h("div", { class: "panel bars" }, h("h2", { style: { marginBottom: "8px" } }, title),
    entries.length ? entries.map(([label, v, col]) => h("div", { class: "b" }, h("span", { title: label }, label),
      h("div", { class: "track" }, h("i", { style: { width: 100 * v / max + "%", background: col || color || "var(--teal)" } })), h("span", { class: "num" }, v)))
      : h("p", { class: "dim" }, "Nothing to show yet."));
}
function tally(sec, keyFn, filter = () => true) {
  const m = new Map();
  for (const [id, n] of Object.entries(sec)) { const c = card(id); if (!c || !filter(c)) continue; const k = keyFn(c); if (k == null) continue; m.set(k, (m.get(k) || 0) + n); }
  return [...m].sort((a, b) => b[1] - a[1]);
}
function renderStats() {
  const root = $("#tab-stats"), d = deck(), f = fmt(), N = count(d.main);
  const mainMon = c => isMonster(c);
  const kinds = [["Monsters", 0, "var(--f-effect)"], ["Spells", 0, "var(--f-spell)"], ["Traps", 0, "var(--f-trap)"]];
  for (const [id, n] of Object.entries(d.main)) { const c = card(id); if (c) kinds[isMonster(c) ? 0 : isSpell(c) ? 1 : 2][1] += n; }
  const extra = tally(d.extra, c => baseFrame(c)[0].toUpperCase() + baseFrame(c).slice(1)).map(([k, v]) => [k, v, `var(--f-${k.toLowerCase()})`]);
  const lv = tally(d.main, c => c.level, mainMon).sort((a, b) => a[0] - b[0]).map(([k, v]) => ["Level " + k, v]);
  // chance of opening at least one card of each category (a card counts once per category it's in)
  const pOpen = (n, hs) => N >= hs ? 1 - binom(N - n, hs) / binom(N, hs) : 0;
  const catRows = d.cats.map(k => [k, categoryCopies(d, k.id)]).filter(([, n]) => n);
  const panels = [
    bars(`Main Deck (${N})`, kinds.filter(k => k[1])),
    bars(`Extra Deck (${count(d.extra)})`, extra),
    bars("Attributes", tally(d.main, c => c.attr, mainMon)),
    bars("Monster types", tally(d.main, c => c.race, mainMon)),
    bars("Levels", lv),
    h("div", { class: "panel cat-odds" }, h("h2", {}, "Opening a category"),
      catRows.length ? h("table", {},
        h("tr", {}, h("th", {}), h("th", { class: "num" }, "copies"), h("th", { class: "num", title: "5-card hand" }, "going 1st"), h("th", { class: "num", title: "6-card hand" }, "going 2nd")),
        catRows.map(([k, n]) => h("tr", { title: k.hint || null }, h("td", {}, h("span", { style: { color: k.color } }, "● "), k.name),
          h("td", { class: "num" }, n), h("td", { class: "num" }, pct(pOpen(n, 5))), h("td", { class: "num" }, pct(pOpen(n, 6))))))
        : h("p", { class: "dim" }, "No categories used yet."))
  ];
  if (f.points) {
    const pts = [];
    for (const s of ["main", "extra", "side"]) for (const [id, n] of Object.entries(d[s])) { const c = card(id); if (c && pointsOf(c)) pts.push([`${c.name}${s === "side" ? " (side)" : ""}`, n * pointsOf(c)]); }
    panels.unshift(bars(`${f.name} points (${deckPoints()}/${f.cap})`, pts.sort((a, b) => b[1] - a[1]), "var(--teal)"));
  }
  root.className = "tab on stats"; root.replaceChildren(...panels);
}

export { bars, renderStats, tally };
