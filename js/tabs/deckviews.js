// tabs/deckviews.js
// Two of the Build tab's deck views: Table (full card miniatures, like cards on a playmat)
// and Sheet (Konami's deck registration form, filled in, with PDF export).
// The third view, Categories, lives in build.js.
import { add, alphaCopies, ensureCopyOrder, ensureOrder, move, moveCopies, SECTIONS } from "../deck.js";
import { card, changed, count, deck, S, save } from "../store.js";
import { cardIsBad, deckCardEvents, dragData, dropAfter, dropData, dropZone, hideDropLine, mini, showDropLine } from "../ui.js";
import { KDE_FILE, MAIN_ROWS, SIDE_ROWS, SHEET_FIELDS, sheetData, fillKde, kdeTemplate, setKdeTemplate } from "../decklist.js";
import { $$, download, h, toast } from "../util.js";

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
// [card, copies] in the deck's own order.
function orderedItems(d, key) {
  const o = ensureOrder(d)[key];
  return o.filter(id => d[key][id]).map(id => [card(id), d[key][id]]).filter(([c]) => c);
}

// "Main Deck  40 cards (…)" heading shared by the Table and Categories views.
function sectionHeader(label, key, info = "") {
  return h("div", { class: "section-h" }, h("h2", {}, label), h("span", { class: "dim" }, plural(count(deck()[key]), "card"), info || ""));
}

/* ---------- Table ---------- */
// Two orders: Alphabetic (card type, then name) and Custom, where every copy has its own
// place. Drag a card to move that copy; hold Shift while dragging to move the whole playset.
// Dragging while in Alphabetic switches to Custom, starting from what's on screen.
const TABLE_ORDERS = [["alpha", "Alphabetic"], ["custom", "Custom"]];
const tableList = (d, key) => S.ui.tableOrder === "custom" ? ensureCopyOrder(d, key) : alphaCopies(d, key);

// Custom always starts from the arrangement on screen, so switching never reshuffles the cards.
function startCustomOrder(d, quiet = false) {
  if (S.ui.tableOrder === "custom") return;
  d.copyOrder = Object.fromEntries(SECTIONS.map(s => [s, alphaCopies(d, s)]));
  S.ui.tableOrder = "custom"; save();
  if (!quiet) toast("Switched to Custom order");
}
function setTableOrder(v) {
  if (v === "custom") startCustomOrder(deck(), true); else S.ui.tableOrder = v;
  save(); changed();
}
// Position of the k-th copy of `id` in list (k counts from 0), or list.length.
function occurrence(list, id, k) {
  for (let i = 0, seen = 0; i < list.length; i++) if (list[i] === id && seen++ === k) return i;
  return list.length;
}
// A card dropped at position `to` of section `sec` (to = list length: at the end).
function tableDrop(sec, data, to) {
  const d = deck(), c = data && card(data.id); if (!c) return;
  startCustomOrder(d);
  const before = ensureCopyOrder(d, sec).slice();
  if (data.from === sec && data.pos != null) {                         // rearranging within the section
    const from = data.set ? before.flatMap((x, i) => x === c.id ? [i] : []) : [data.pos];
    moveCopies(d, sec, from, to); changed(); return;
  }
  // Remember the drop spot as "the k-th copy of card X", since adding shifts positions.
  const anchor = before[to], anchorK = anchor == null ? 0 : before.slice(0, to).filter(x => x === anchor).length;
  const had = d[sec][c.id] || 0;
  if (data.from) {
    const n = data.set ? d[data.from][c.id] || 0 : 1;
    if (!data.set && data.pos != null) ensureCopyOrder(d, data.from).splice(data.pos, 1);   // take the dragged copy
    for (let k = 0; k < n; k++) move(c.id, data.from, sec);
  } else add(c.id, sec, 1, { quiet: true });
  const added = (d[sec][c.id] || 0) - had;
  if (added > 0) {
    const list = ensureCopyOrder(d, sec), mine = list.flatMap((x, i) => x === c.id ? [i] : []).slice(-added);
    moveCopies(d, sec, mine, anchor == null ? list.length : occurrence(list, anchor, anchorK));
  }
  changed();
}
function tableEvents(c, sec, pos) {
  return Object.assign(deckCardEvents(c, sec), {
    title: c.name,
    ondragstart: e => dragData(e, c.id, sec, undefined, { pos, set: e.shiftKey }),
    ondragover: e => {
      e.preventDefault(); e.stopPropagation();
      const el = e.currentTarget; el.dataset.after = dropAfter(e, el) ? "1" : ""; showDropLine(el, !!el.dataset.after);
    },
    ondrop: e => {
      e.preventDefault(); e.stopPropagation(); hideDropLine(); $$(".drop").forEach(x => x.classList.remove("drop"));
      tableDrop(sec, dropData(e), e.currentTarget.dataset.after ? pos + 1 : pos);
    },
    oncontextmenu: e => {
      e.preventDefault();
      if (S.ui.tableOrder === "custom") ensureCopyOrder(deck(), sec).splice(pos, 1);     // this copy, not the last one
      add(c.id, sec, -1);
    }
  });
}
function tableSection(key, label, info = "") {
  const d = deck(), list = tableList(d, key);
  const mat = h("div", { class: "mat" + (list.length ? "" : " mat-empty") },
    list.length ? list.map((id, i) => { const c = card(id); return c ? mini(c, key, tableEvents(c, key, i)) : null; })
      : null);
  mat.addEventListener("dragover", e => {
    e.preventDefault(); mat.classList.add("drop");
    const last = mat.querySelector(".mini:last-of-type");                 // empty space: the card goes last
    if (e.target === mat) last ? showDropLine(last, true) : hideDropLine();
  });
  mat.addEventListener("dragleave", e => { if (!mat.contains(e.relatedTarget)) mat.classList.remove("drop"); });
  mat.addEventListener("drop", e => { e.preventDefault(); mat.classList.remove("drop"); tableDrop(key, dropData(e), list.length); });
  return h("div", { class: "section" }, sectionHeader(label, key, info), mat);
}

/* ---------- Sheet ---------- */
// One column of the form: header, numbered slots (quantity + name), and the total line.
// Cards past the last slot are still listed, highlighted, so nothing silently disappears.
function sheetColumn(title, rows, slots, sec, totalLabel, total) {
  const row = (r, over) => {
    if (!r) return h("div", { class: "kde-row" }, h("span", { class: "q" }), h("span", { class: "n" }));
    const [c, n] = r;
    return h("div", Object.assign({ class: ["kde-row filled", S.sel === c.id && "sel", cardIsBad(c) && "illegal", over && "over"].filter(Boolean).join(" ") },
      deckCardEvents(c, sec), over ? { title: `${c.name} (no slot on the form)` } : {}),
      h("span", { class: "q" }, n), h("span", { class: "n" }, c.name));
  };
  return h("div", { class: "kde-col" },
    h("div", { class: "kde-colh" }, title),
    Array.from({ length: Math.max(slots, rows.length) }, (_, i) => row(rows[i], i >= slots)),
    h("div", { class: "kde-total" }, h("span", { class: "q" }, total), h("span", { class: "n" }, `<<< ${totalLabel}`)));
}
function sheetView() {
  const d = deck(), data = sheetData(d), info = (S.ui.sheet ||= {}), t = data.totals;
  const initial = h("b", {}, (info.last || "").trim().charAt(0).toUpperCase() || "\u00a0");
  const field = ([key, label]) => h("label", { class: "kde-field" }, h("span", {}, label),
    h("input", { value: info[key] || "", type: key === "date" ? "date" : "text", maxlength: key === "cgid" ? 10 : null,
      inputmode: key === "cgid" ? "numeric" : null, spellcheck: false, autocomplete: "off",
      oninput: e => { info[key] = e.target.value; save(); if (key === "last") initial.textContent = e.target.value.trim().charAt(0).toUpperCase() || "\u00a0"; } }));
  const status = h("p", {}, data.overflow.length ? h("span", { class: "warn" }, `Doesn't fit on the form: ${data.overflow.join("; ")}.`) : null);
  const picker = h("input", { type: "file", accept: ".pdf,application/pdf", hidden: true, onchange: async e => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    setKdeTemplate(new Uint8Array(await f.arrayBuffer())); exportPdf(); } });
  async function exportPdf() {
    status.textContent = "Filling in the form…";
    try {
      const bytes = await fillKde(await kdeTemplate(), d, info);
      download(new Blob([bytes], { type: "application/pdf" }), `${d.name.replace(/[\\/:*?"<>|]/g, "_")} - decklist.pdf`);
      status.replaceChildren(data.overflow.length ? h("span", { class: "warn" }, `Exported; doesn't fit: ${data.overflow.join("; ")}.`) : "Exported.");
    } catch (e) {
      status.replaceChildren(h("span", { class: "warn" }, `${e.message}. `), `Missing ${KDE_FILE}: `,
        h("button", { class: "small", onclick: () => picker.click() }, "choose the form file"), ".");
    }
  }
  return h("div", { class: "section kde" },
    h("div", { class: "kde-top" },
      h("div", { class: "kde-fields" }, SHEET_FIELDS.map(field)),
      h("div", { class: "kde-judge" },
        h("div", {}, h("span", {}, "Last name initial"), initial),
        h("div", {}, h("span", {}, "Main Deck total"), h("b", {}, t.main)))),
    dropZone(h("div", { class: "kde-main" },
      sheetColumn("MONSTER CARDS", data.monsters, MAIN_ROWS, "main", "TOTAL MONSTER CARDS", t.monsters),
      sheetColumn("SPELL CARDS", data.spells, MAIN_ROWS, "main", "TOTAL SPELL CARDS", t.spells),
      sheetColumn("TRAP CARDS", data.traps, MAIN_ROWS, "main", "TOTAL TRAP CARDS", t.traps)), "main"),
    h("div", { class: "kde-bottom" },
      dropZone(sheetColumn("SIDE DECK", data.side, SIDE_ROWS, "side", "TOTAL SIDE DECK", t.side), "side"),
      dropZone(sheetColumn("EXTRA DECK", data.extra, SIDE_ROWS, "extra", "TOTAL EXTRA DECK", t.extra), "extra"),
      h("div", { class: "kde-export" },
        h("button", { class: "primary", onclick: exportPdf }, "Export PDF"),
        status, picker)));
}

export { setTableOrder, startCustomOrder, orderedItems, sectionHeader, sheetView, TABLE_ORDERS, tableDrop, tableSection };
