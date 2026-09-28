// tabs/probs.js
// The Probs page: build the opening hand you're hoping for out of card-shaped slots, and see
// how likely it is. Each slot is "Any" or one or more categories (either will do); drag a
// category from the palette onto a slot. Several hands show the chance of opening any of them.
import { categoryCopies } from "../deck.js";
import { patternOdds } from "../prob.js";
import { deck, save } from "../store.js";
import { $, h, pct } from "../util.js";

const SIZES = [5, 6];
// d.probs = { size: 5 | 6, hands: [ [slot, slot, …], … ] }, a slot being a list of category ids.
function probsState(d) {
  const st = (d.probs ||= { size: 5, hands: [[]] });
  const known = new Set(d.cats.map(k => k.id));
  st.hands = st.hands.map(hand => Array.from({ length: st.size }, (_, i) => (hand[i] || []).filter(id => known.has(id))));
  return st;
}

function renderProbs() {
  const root = $("#tab-probs"), d = deck(), st = probsState(d);
  const r = patternOdds(d, st.hands, st.size), many = st.hands.length > 1;
  const redraw = () => { save(); renderProbs(); };
  const catOf = id => d.cats.find(k => k.id === id);

  const slot = (hand, i) => {
    const ids = hand[i], one = ids.length === 1 ? catOf(ids[0]) : null;
    const el = h("div", { class: "pslot" + (ids.length ? " set" : ""), style: one ? { "--c": one.color } : {},
      title: ids.length ? "Right-click to reset to Any" : "Drag a category here",
      ondragover: e => { if (e.dataTransfer.types.includes("text/x-category")) { e.preventDefault(); el.classList.add("drop"); } },
      ondragleave: () => el.classList.remove("drop"),
      ondrop: e => { e.preventDefault(); el.classList.remove("drop");
        const id = e.dataTransfer.getData("text/x-category"); if (id && !ids.includes(id)) { ids.push(id); redraw(); } },
      oncontextmenu: e => { e.preventDefault(); if (ids.length) { hand[i] = []; redraw(); } } },
      ids.length ? ids.flatMap((id, j) => {
        const k = catOf(id);
        return [j ? h("span", { class: "or" }, "or") : null,
          h("span", { class: "pchip", style: { "--c": k.color } }, k.name,
            h("button", { class: "x", title: `Remove ${k.name}`, "aria-label": `Remove ${k.name} from this slot`, onclick: () => { ids.splice(j, 1); redraw(); } }, "×"))];
      }) : h("span", { class: "any" }, "Any"));
    return el;
  };

  // Every row has the same four columns (chance, slots, size button, remove), so slots line up.
  const handRow = (hand, n) => h("div", { class: "phand" },
    h("div", { class: "phand-p" }, many ? pct(r.each[n]) : ""),
    h("div", { class: "pslots" }, hand.map((_, i) => slot(hand, i))),
    n === 0 ? h("button", { class: "psize", title: st.size === 5 ? "Test a 6-card hand (going second)" : "Back to a 5-card hand (going first)",
      "aria-label": st.size === 5 ? "Add a sixth card" : "Remove the sixth card",
      onclick: () => { st.size = st.size === 5 ? 6 : 5; redraw(); } }, st.size === 5 ? "+" : "−") : h("span"),
    many ? h("button", { class: "phand-x", title: "Remove this hand", "aria-label": "Remove this hand", onclick: () => { st.hands.splice(n, 1); redraw(); } }, "×") : h("span"));

  root.className = "tab on probs";
  root.replaceChildren(h("div", { class: "probs-wrap" },
    h("div", { class: "probs-big" }, r.N >= st.size ? pct(r.any) : "–"),
    h("div", { class: "probs-sub dim" },
      r.N < st.size ? `Your Main Deck needs at least ${st.size} cards.`
        : `chance of opening ${many ? "at least one of these hands" : "this hand"}, ${st.size} cards (going ${st.size === 5 ? "first" : "second"})`),
    st.hands.map(handRow),
    h("button", { class: "ghost padd", onclick: () => { st.hands.push(Array.from({ length: st.size }, () => [])); redraw(); } }, "+ Add another hand"),
    h("div", { class: "palette" },
      d.cats.map(k => h("div", { class: "pcat", draggable: true, style: { "--c": k.color }, title: k.hint || k.name,
        ondragstart: e => { e.dataTransfer.setData("text/x-category", k.id); e.dataTransfer.effectAllowed = "copy"; } },
        h("span", {}, k.name), h("small", {}, categoryCopies(d, k.id))))),
    h("p", { class: "dim probs-help" }, "Drag a category onto a slot. Two categories in one slot mean either one. Right-click a slot to reset it.")));
}

export { probsState, renderProbs, SIZES };
