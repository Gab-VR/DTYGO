// deckmenu.js
// The "Deck" menu next to the deck selector: everything that acts on a whole deck.
import { newDeck } from "./deck.js";
import { changed, deck, S } from "./store.js";
import { $, h, toast, uid } from "./util.js";
import { exportYdk, fromYdke, importDeck, toYdke } from "./ydk.js";

function ydkeDialog() {
  const ta = h("textarea", {}, toYdke());
  $("#dlgBody").replaceChildren(h("h2", {}, "YDKE link"),
    ta,
    h("div", { class: "row", style: { marginTop: "10px", justifyContent: "flex-end" } },
      h("button", { type: "button", onclick: () => { navigator.clipboard?.writeText(ta.value); toast("Copied"); } }, "Copy"),
      h("button", { type: "button", class: "primary", onclick: () => {
        try { const { d, unknown } = fromYdke(ta.value); $("#dlg").close(); importDeck(d, unknown, "Imported deck"); }
        catch { toast("That doesn't look like a ydke:// link"); } } }, "Import as new deck"),
      h("button", {}, "Close")));
  $("#dlg").showModal(); ta.select();
}

const ITEMS = [
  ["New deck", () => { const n = newDeck(); S.decks.push(n); S.deckId = n.id; S.sel = null; changed(); }],
  ["Rename…", () => { const d = deck(), n = prompt("Deck name", d.name); if (n && n.trim()) { d.name = n.trim(); changed(); } }],
  ["Duplicate", () => { const d = deck(), c = structuredClone(d); c.id = uid(); c.name = d.name + " (copy)"; S.decks.push(c); S.deckId = c.id; changed(); }],
  ["Delete…", () => { const d = deck(); if (!confirm(`Delete "${d.name}"?`)) return;
    S.decks = S.decks.filter(x => x !== d); if (!S.decks.length) S.decks.push(newDeck()); S.deckId = S.decks[0].id; changed(); }],
  null,
  ["Import .ydk…", () => $("#fileIn").click()],
  ["Export .ydk", () => exportYdk()],
  ["YDKE link…", () => ydkeDialog()]
];

// Accessible drop-down: Enter/Space/Down open it, arrows move, Escape or a click outside closes it.
function initDeckMenu() {
  const btn = $("#deckMenuBtn"), menu = $("#deckMenu");
  menu.replaceChildren(...ITEMS.map(it => it ? h("button", { role: "menuitem", tabindex: -1, onclick: () => { close(); it[1](); } }, it[0]) : h("hr", { role: "separator" })));
  const items = () => [...menu.querySelectorAll("[role=menuitem]")];
  const open = () => { menu.hidden = false; btn.setAttribute("aria-expanded", "true"); items()[0].focus(); };
  function close(focus) { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); if (focus) btn.focus(); }
  btn.addEventListener("click", e => { e.stopPropagation(); menu.hidden ? open() : close(); });
  btn.addEventListener("keydown", e => { if (e.key === "ArrowDown") { e.preventDefault(); open(); } });
  menu.addEventListener("keydown", e => {
    const list = items(), i = list.indexOf(document.activeElement);
    if (e.key === "Escape") { e.preventDefault(); close(true); }
    else if (e.key === "ArrowDown") { e.preventDefault(); list[(i + 1) % list.length].focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); list[(i - 1 + list.length) % list.length].focus(); }
    else if (e.key === "Tab") close();
  });
  document.addEventListener("click", e => { if (!menu.hidden && !menu.contains(e.target)) close(); });
}

export { initDeckMenu, ydkeDialog };
