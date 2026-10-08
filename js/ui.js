// ui.js
import { baseFrame, DARK_FRAMES, frameColor, isPend, loadDataFile, syncData } from "./cards.js";
import { add, ensureOrder, move, reorder } from "./deck.js";
import { canRememberFolder, chooseImages, connectFolder, coverage, folderReport, IMG_FULL, imgOn, IMGS } from "./images.js";
import { deckPoints, inPool, limitLabel, limitOf, pointsOf, totalCopies, validate } from "./legality.js";
import { changed, deck, fmt, S, save } from "./store.js";
import { $, $$, h, toast } from "./util.js";

/* ================= header ================= */
function renderHeader() {
  const ds = $("#deckSel"); ds.replaceChildren(...S.decks.map(d => h("option", { value: d.id, selected: d.id === S.deckId }, d.name)));
  const fs = $("#fmtSel"); fs.replaceChildren(...S.formats.map(f => h("option", { value: f.id, selected: f.id === S.fmtId }, f.name)));
  const f = fmt(); $("#ptsToggle").checked = f.points;
  const meter = $("#meter"); meter.hidden = !f.points;
  if (f.points) {
    const p = deckPoints(); meter.classList.toggle("over", p > f.cap);
    $("i", meter).style.width = Math.min(100, 100 * p / Math.max(1, f.cap)) + "%";
    $("span", meter).textContent = `${p}/${f.cap}`;
  }
  const iss = S.cards.size ? validate() : [], errs = iss.filter(i => i.lvl === "err").length;
  const pill = $("#legalPill");
  pill.className = "pill " + (errs ? "bad" : "ok");
  pill.textContent = !S.cards.size ? "No card data" : errs ? `${errs} issue${errs > 1 ? "s" : ""}` : iss.length ? "Legal, with notes" : "Legal";
  $("#legalPop").replaceChildren(...iss.map(i => h("li", { class: i.lvl === "warn" ? "warn" : "" }, i.msg)));
}
/* Pages and split view. Each page draws into its own section, wrapped in a .slot; one slot is
   shown, or two side by side when split. The left page follows the header tabs, the right page has
   its own tab bar, and the divider between them can be dragged. Both pages redraw on every change,
   so an edit in one shows up in the other at once. */
const tabList = () => $$("#tabs button").map(b => [b.dataset.tab, b.textContent]);
const visibleTabs = () => S.ui.split && S.tab2 && S.tab2 !== S.tab ? [S.tab, S.tab2] : [S.tab];
function layoutTabs() {
  const [L, R] = visibleTabs(), panes = $("#panes");
  panes.classList.toggle("split", !!R);
  panes.style.setProperty("--left", (S.ui.splitAt || 50) + "%");
  for (const sl of $$("#panes .slot")) {
    const t = sl.dataset.tab;
    sl.classList.toggle("shown", t === L || t === R); sl.classList.toggle("left", t === L); sl.classList.toggle("right", t === R);
  }
  $$("#tabs button").forEach(b => b.setAttribute("aria-selected", b.dataset.tab === L));
  $("#tabs2").replaceChildren(...tabList().filter(([t]) => t !== L).map(([t, label]) =>
    h("button", { role: "tab", "aria-selected": t === R, onclick: () => setTab2(t) }, label)));
  $("#splitBtn").setAttribute("aria-pressed", !!R);
}
function setTab(t) {
  if (t === S.tab2) S.tab2 = S.tab;                                   // picking the right page on the left swaps them
  S.tab = t; save(); layoutTabs(); renderTab();
}
function setTab2(t) { if (t === S.tab) return; S.tab2 = t; save(); layoutTabs(); renderTab(); }
function toggleSplit() {
  S.ui.split = !S.ui.split;
  if (S.ui.split) S.ui.resultsOpenSplit = false;                         // results start folded so Card info is visible
  if (S.ui.split && (!S.tab2 || S.tab2 === S.tab)) S.tab2 = S.tab === "build" ? "hands" : "build";
  save(); layoutTabs(); renderTab();
}
// Drag the divider (or use the arrow keys on it) to share the width between the two pages.
function initSplitter() {
  const bar = $("#splitter"), panes = $("#panes");
  const setAt = pct => { S.ui.splitAt = Math.max(25, Math.min(75, Math.round(pct))); panes.style.setProperty("--left", S.ui.splitAt + "%"); };
  bar.addEventListener("pointerdown", e => {
    e.preventDefault(); bar.setPointerCapture(e.pointerId); document.body.classList.add("resizing");
    const move = ev => { const r = panes.getBoundingClientRect(); setAt((ev.clientX - r.left) / r.width * 100); };
    const up = () => { bar.removeEventListener("pointermove", move); bar.removeEventListener("pointerup", up); document.body.classList.remove("resizing"); save(); };
    bar.addEventListener("pointermove", move); bar.addEventListener("pointerup", up);
  });
  bar.addEventListener("keydown", e => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") { e.preventDefault(); setAt((S.ui.splitAt || 50) + (e.key === "ArrowLeft" ? -5 : 5)); save(); }
  });
}
// Tabs register themselves from main.js, so this module never imports them.
const TABS = {};
function registerTab(name, render) { TABS[name] = render; }
function renderOne(t) {
  const sec = $("#tab-" + t); if (!sec) return;
  if (!S.cards.size && t !== "format") renderSplash(sec); else TABS[t]?.();
  sec.classList.add("tab", "on");
}
function renderTab() { for (const t of visibleTabs()) renderOne(t); }
function renderSplash(root) {
  const st = h("p", { class: "dim" });
  const file = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try { await loadDataFile(f); toast(`Loaded ${S.meta.n} cards`); changed(); } catch (err) { st.textContent = `Couldn't load it: ${err.message}.`; }
  } });
  root.replaceChildren(h("div", { class: "splash panel" },
    h("h2", {}, "No card data yet"),

    h("div", { class: "row" },
      h("button", { class: "primary", onclick: () => file.click() }, "Load cards.json"),
      h("button", { onclick: async () => { st.textContent = "Checking…"; try { const r = await syncData(m => st.textContent = m); if (r.updated) { toast(`Loaded ${S.meta.n} cards`); changed(); } else st.textContent = `data/meta.json isn't reachable (${r.err || "no data"}).`; } catch (err) { st.textContent = err.message; } } }, "Try again")),
    st, file));
}
/* One place that always says what the pictures are doing, so a problem is never silent. */
function imageState() {
  if (S.ui.img === "off") return { text: "Pictures are off.", cls: "dim" };
  if (S.ui.img === "path") {
    if (IMGS.pathMisses && !IMGS.pathHits) return { text: `No pictures found at ${S.ui.imgTpl}.`, cls: "warn" };
    return { text: `Pictures from ${S.ui.imgTpl}.`, cls: "dim" };
  }
  if (IMGS.reading) return { text: `Reading picture folder… ${IMGS.reading}`, cls: "dim" };
  if (!canRememberFolder() && !IMGS.urls.size) return { text: location.protocol === "file:"
      ? "Opened as a file: choose the folder each visit."
      : "On this address the folder must be chosen each visit.", cls: "dim", btn: "Choose image folder" };
  if (IMGS.needsPermission) return { text: "Needs permission again.", cls: "warn", btn: "Reconnect image folder" };
  if (!IMGS.urls.size) return IMGS.diag ? { text: folderReport(), cls: "warn", btn: "Choose image folder" } : { text: "No picture folder chosen yet.", cls: "warn", btn: "Choose image folder" };
  if (IMGS.pathMisses) return { text: folderReport(), cls: "warn", btn: "Choose image folder" };
  return { text: folderReport(), cls: "dim" };
}
/* The List only mentions pictures when something needs doing: a button to connect the
   folder, "Loading pictures…", or a quiet "Outdated database" when cards in this deck have
   no picture in the folder. Everything else lives in Format > Card images. */
function pictureNotice() {
  const wrap = (...kids) => h("span", { class: "row pic-notice", id: "imgStatus" }, ...kids);
  if (S.ui.img === "off") return wrap();
  if (S.ui.img === "path") return IMGS.pathMisses && !IMGS.pathHits
    ? wrap(h("span", { class: "quiet-warn", title: `No pictures at ${S.ui.imgTpl}` }, "⚠ Pictures not found")) : wrap();
  if (IMGS.reading) return wrap(h("span", { class: "dim imgnote" }, "Loading pictures…"));
  if (!IMGS.urls.size) return wrap(h("button", { class: "small", title: imageState().text, onclick: connectFolder },
    IMGS.needsPermission ? "Reconnect pictures" : "Choose picture folder"));
  const missing = coverage().missing;
  return missing.length
    ? wrap(h("span", { class: "quiet-warn", title: `${missing.length} card${missing.length === 1 ? "" : "s"} in this deck ${missing.length === 1 ? "has" : "have"} no picture in your folder: ${missing.slice(0, 8).map(c => c.name).join(", ")}${missing.length > 8 ? "…" : ""}.\nRun scripts/download-images.mjs to add the missing ones.` }, "⚠ Outdated database"))
    : wrap();
}
function refreshImageStatus() { const el = $("#imgStatus"); if (el) el.replaceWith(pictureNotice()); }
function imageSelect() {
  return h("select", { "aria-label": "Card images", onchange: e => chooseImages(e.target.value) },
    [["off", "Off"], ["folder", "Image folder"], ["path", "Image URL path"]].map(([v, l]) => h("option", { value: v, selected: S.ui.img === v }, l)));
}
/* Drag and drop. The browser only reveals what's being dragged at drop time, so the card is
   also kept in `dragging` while it's in the air: that decides where the drop line may show. */
let dragging = null;
function dragData(e, id, from, cat, extra = {}) {
  dragging = Object.assign({ id, from, cat }, extra);
  e.dataTransfer.setData("text/plain", JSON.stringify(dragging)); e.dataTransfer.effectAllowed = "copyMove";
}

// The yellow line marking where a dragged card will land: at the left or right edge of a
// card in a grid, or above or below a row in a list.
let dropLine = null;
function dropAfter(e, el, rows = false) {
  const r = el.getBoundingClientRect();
  return rows ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
}
function showDropLine(el, after, rows = false) {
  dropLine ||= document.body.appendChild(h("div", { class: "drop-line", "aria-hidden": "true" }));
  const r = el.getBoundingClientRect(), t = 3;
  Object.assign(dropLine.style, rows
    ? { left: r.left + "px", width: r.width + "px", height: t + "px", top: (after ? r.bottom : r.top) - t / 2 + "px" }
    : { top: r.top + "px", height: r.height + "px", width: t + "px", left: (after ? r.right + 3 : r.left - 3) - t / 2 + "px" });
  dropLine.style.display = "block";
}
function hideDropLine() { if (dropLine) dropLine.style.display = "none"; }
if (typeof document !== "undefined") {
  document.addEventListener("dragend", () => { dragging = null; hideDropLine(); });
  document.addEventListener("drop", () => { dragging = null; hideDropLine(); });
}
const dropData = e => { try { return JSON.parse(e.dataTransfer.getData("text/plain")); } catch { return null; } };
function bubbles(c, f = fmt()) {
  const lab = limitLabel(c, f), p = f.points ? pointsOf(c) : 0;
  if (!lab && !p) return null;
  return h("span", { class: "bubs" },
    lab ? h("span", { class: "bub " + lab.cls, title: `${lab.text}: ${lab.l} cop${lab.l === 1 ? "y" : "ies"} allowed` }, lab.text) : null,
    p ? h("span", { class: "bub pts", title: `${f.name} points` }, `${p} pts`) : null);
}
/* Copies are drawn as cards stacked behind the tile, each peeking out STEP px lower and a little
   narrower and darker, so 1, 2 and 3 copies read at a glance. Box-shadows need no extra DOM. */
const STACK_STEP = 8, STACK_MAX = 4;   // at most 4 cards drawn behind; the badge gives the exact count
function stackStyle(n, bad) {
  const layers = Math.min(n, STACK_MAX + 1) - 1, sh = [];
  if (bad) sh.push("inset 0 0 0 2px var(--red)");
  for (let k = 1; k <= layers; k++) {
    const y = k * STACK_STEP + k, shrink = k;                         // +k offsets the negative spread
    const tone = `color-mix(in srgb, var(--fc) ${88 - 12 * k}%, #000)`;
    sh.push(`0 ${y}px 0 ${-shrink}px ${tone}`, `0 ${y + 1}px 0 ${-shrink}px rgba(0,0,0,.55)`);
  }
  return sh.length ? { boxShadow: sh.join(", "), marginBottom: layers * STACK_STEP + "px" } : {};
}
/* How every card shown in the deck behaves, whichever view draws it:
   click shows it in the panel, right-click (or Shift-click, Delete, "-") removes a copy,
   "+" adds one, and dropping another card on it places that card just before it.
   Inside a category box the drop is left to the box, which changes the category instead. */
function deckCardEvents(c, sec, boxCat) {
  // Inside a category box, dropping a card from another box changes its category (the box
  // handles that); from the same box, or anywhere else, it's placed next to this card.
  const placesHere = el => !el.closest(".catbox") || (dragging && dragging.from === sec && dragging.cat === (boxCat ? boxCat.id : null));
  return {
    draggable: true, tabindex: 0, title: c.name,
    oncontextmenu: e => { e.preventDefault(); add(c.id, sec, -1); },
    ondragstart: e => dragData(e, c.id, sec, boxCat === undefined ? undefined : boxCat ? boxCat.id : null),
    ondragover: e => {
      const el = e.currentTarget; if (!placesHere(el)) { hideDropLine(); return; }
      e.preventDefault(); e.stopPropagation();
      const list = el.classList.contains("kde-row");
      el.dataset.after = dropAfter(e, el, list) ? "1" : ""; showDropLine(el, !!el.dataset.after, list);
    },
    ondrop: e => {
      const el = e.currentTarget; if (!placesHere(el)) return;
      e.preventDefault(); e.stopPropagation(); hideDropLine();
      $$(".drop").forEach(x => x.classList.remove("drop"));
      const data = dropData(e); if (!data) return;
      // "After this card" = "before the next card in the deck's order" (or at the end).
      let before = c.id;
      if (el.dataset.after) { const o = ensureOrder(deck())[sec], i = o.indexOf(c.id); before = o[i + 1] ?? null; if (before === data.id) before = o[i + 2] ?? null; }
      if (data.from === sec) reorder(sec, data.id, before); else if (data.from) move(data.id, data.from, sec, before); else add(data.id, sec, 1, { before });
    },
    onclick: e => { if (e.shiftKey) add(c.id, sec, -1); else { S.sel = c.id; renderTab(); } },
    onkeydown: e => { if (e.key === "Enter") { S.sel = c.id; renderTab(); } if (e.key === "Delete" || e.key === "-") add(c.id, sec, -1); if (e.key === "+") add(c.id, sec, 1); }
  };
}
// Makes an element accept cards dropped from the search list or another section.
// Dropped in its own section on empty space, a card moves to the end.
function dropZone(el, sec) {
  el.addEventListener("dragover", e => { e.preventDefault(); el.classList.add("drop"); if (e.target === el) hideDropLine(); });
  el.addEventListener("dragleave", e => { if (!el.contains(e.relatedTarget)) el.classList.remove("drop"); });
  el.addEventListener("drop", e => {
    e.preventDefault(); el.classList.remove("drop");
    const data = dropData(e); if (!data) return;
    if (data.from === sec) reorder(sec, data.id, null); else if (data.from) move(data.id, data.from, sec); else add(data.id, sec);
  });
  return el;
}
const cardIsBad = c => totalCopies(deck(), c.id) > limitOf(c) || !inPool(c);
/* Cards slide to their new place when the List is redrawn (the FLIP technique): note every
   card's position before, then animate each from its old spot to its new one. Cards carry a
   data-flip key (section, card, and copy number); a card that changed section is matched by
   card instead. Skipped when the system asks for reduced motion. */
function flipSnapshot(root) {
  const at = new Map(), byCard = new Map();
  if (!root) return { at, byCard };
  for (const el of root.querySelectorAll("[data-flip]")) {
    const r = el.getBoundingClientRect(); at.set(el.dataset.flip, r);
    (byCard.get(el.dataset.card) || byCard.set(el.dataset.card, []).get(el.dataset.card)).push([el.dataset.flip, r]);
  }
  return { at, byCard };
}
function flipPlay(root, before) {
  if (!root || !before.at.size || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const now = [...root.querySelectorAll("[data-flip]")], kept = new Set(now.map(el => el.dataset.flip));
  for (const el of now) {
    let from = before.at.get(el.dataset.flip);
    if (!from) {                                                        // it changed section: use a vanished copy of the same card
      const spare = (before.byCard.get(el.dataset.card) || []).find(([k]) => !kept.has(k));
      if (!spare) continue;
      kept.add(spare[0]); from = spare[1];
    }
    const to = el.getBoundingClientRect(), dx = from.left - to.left, dy = from.top - to.top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5)
      el.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: 240, easing: "cubic-bezier(.2,.7,.2,1)" });
  }
}
const flipKey = (el, sec, id, copy = 0) => { el.dataset.flip = `${sec}:${id}:${copy}`; el.dataset.card = String(id); return el; };

/* Card as a picture with its name on a tag above it (Categories view).
   Extra copies stack behind the picture; long names scroll into view after a moment's hover. */
function tile(c, n, sec, boxCat) {
  const f = fmt(), bad = cardIsBad(c), pic = imgOn() && IMG_FULL(c.id), p = f.points ? pointsOf(c) : 0;
  const label = h("span", {}, c.name), tag = h("div", { class: "ctag" }, label);
  const el = h("div", Object.assign({ class: ["ctile", S.sel === c.id && "sel", bad && "illegal"].filter(Boolean).join(" ") }, deckCardEvents(c, sec, boxCat)),
    tag,
    h("div", { class: ["cpic", DARK_FRAMES.has(baseFrame(c)) && "dark", isPend(c) && "pend"].filter(Boolean).join(" "),
      style: Object.assign({ "--fc": frameColor(c) }, stackStyle(n, bad)) },
      pic ? h("img", { src: pic, alt: "", draggable: false, loading: "lazy", onerror: e => e.target.remove() }) : null,
      n > 1 ? h("span", { class: "cnt" }, "×" + n) : null,
      p ? h("span", { class: "bub pts on-pic", title: `${f.name} points` }, `${p} pts`) : null));
  marquee(el, tag, label);
  return flipKey(el, sec, c.id);
}
// Scrolls a clipped label to show its end while `host` is hovered (after a short pause).
function marquee(host, box, label) {
  host.addEventListener("mouseenter", () => {
    const d = label.scrollWidth - box.clientWidth;
    if (d <= 2 || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    label.style.transition = `transform ${Math.max(1, d / 45).toFixed(2)}s linear .6s`;
    label.style.transform = `translateX(${-d}px)`;
  });
  host.addEventListener("mouseleave", () => { label.style.transition = "transform .2s ease-out"; label.style.transform = ""; });
  // A faded right edge hints that the name continues.
  requestAnimationFrame(() => box.classList.toggle("long", label.scrollWidth > box.clientWidth + 2));
}
// A full miniature: the whole card picture, or a card-shaped frame with the name if there's none.
function mini(c, sec, events = deckCardEvents(c, sec)) {
  const pic = imgOn() && IMG_FULL(c.id);
  return h("div", Object.assign({ class: ["mini", DARK_FRAMES.has(baseFrame(c)) && "dark", isPend(c) && "pend", S.sel === c.id && "sel", cardIsBad(c) && "illegal", pic && "pic"].filter(Boolean).join(" "),
    style: { "--fc": frameColor(c) } }, events),
    pic ? h("img", { src: pic, alt: c.name, draggable: false, loading: "lazy", onerror: e => { e.target.closest(".mini").classList.remove("pic"); e.target.remove(); } }) : null,
    h("span", { class: "mini-name" }, c.name),
    pointsBubble(c));
}
// Genesys (or other) points, shown on the card the same way everywhere.
function pointsBubble(c) {
  const f = fmt(), p = f.points ? pointsOf(c) : 0;
  return p ? h("span", { class: "bub pts on-pic", title: `${f.name} points` }, `${p} pts`) : null;
}
function cardPicker(onPick, filter = () => true, placeholder = "Search a card") {
  const inp = h("input", { placeholder, style: { width: "100%" }, "aria-label": placeholder }), menu = h("div", { class: "menu", hidden: true });
  inp.addEventListener("input", () => {
    const q = inp.value.toLowerCase().trim(); if (q.length < 2) { menu.hidden = true; return; }
    const hits = []; for (const c of S.list) { if (c.name.toLowerCase().includes(q) && filter(c)) { hits.push(c); if (hits.length >= 12) break; } }
    menu.replaceChildren(...hits.map(c => h("div", { onmousedown: e => { e.preventDefault(); onPick(c); inp.value = ""; menu.hidden = true; } }, c.name)));
    menu.hidden = !hits.length;
  });
  inp.addEventListener("blur", () => setTimeout(() => menu.hidden = true, 150));
  return h("div", { class: "sugg" }, inp, menu);
}

export { bubbles, cardIsBad, cardPicker, deckCardEvents, dragData, dropAfter, dropData, dropZone, flipKey, flipPlay, flipSnapshot, hideDropLine, imageSelect, imageState, initSplitter, layoutTabs, marquee, mini, pictureNotice, refreshImageStatus, registerTab, renderHeader, renderSplash, renderTab, setTab, setTab2, showDropLine, STACK_STEP, stackStyle, TABS, tile, toggleSplit, visibleTabs };
