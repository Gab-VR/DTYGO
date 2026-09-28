// main.js
import { initDeckMenu } from "./deckmenu.js";
import { loadDB, syncData } from "./cards.js";
import { migrateCats, newDeck } from "./deck.js";
import { IMGS, probePath, restoreFolder } from "./images.js";
import { newFormat } from "./legality.js";
import { changed, fmt, idb, LS, S } from "./store.js";
import { DECK_VIEWS, renderBuild, renderResults, SEARCH_SORTS } from "./tabs/build.js";
import { renderFormat } from "./tabs/format.js";
import { renderHands } from "./tabs/hands.js";
import { renderSW } from "./tabs/smallworld.js";
import { refreshImageStatus, registerTab, renderHeader, renderTab, setTab } from "./ui.js";
import { $, BUILD, h, on, toast } from "./util.js";
import { importDeck, parseYdk } from "./ydk.js";

/* Entry point: wires the tabs and events together, then starts the app. */
window.__deckbuilderStarted = true;   // index.html shows a help message if this never gets set

// Each tab draws itself; ui.js only knows them through this registry.
registerTab("build", renderBuild);
registerTab("hands", renderHands);
registerTab("sw", renderSW);
registerTab("format", renderFormat);

// What to redraw when the logic modules announce a change.
on("changed", () => { renderHeader(); renderTab(); });
on("select", () => renderTab());
on("results", () => renderResults());
on("images", () => { renderHeader(); renderResults(); renderTab(); });
on("images:progress", () => refreshImageStatus());

// If anything fails at startup, say so on the page instead of leaving it blank.
function showFatal(msg) {
  if ($("#fatal")) return;
  document.body.prepend(h("div", { id: "fatal", role: "alert", style: { background: "#5a2a28", color: "#fff", padding: "10px 16px", borderBottom: "1px solid var(--red)" } },
    h("b", {}, "A deckbuilder hit an error: "), msg, h("div", { style: { fontSize: "12px", opacity: .8, marginTop: "4px" } }, `Build ${BUILD}. Press F12 and open the Console tab for details.`)));
}

window.addEventListener("error", e => {
  const msg = e.message || String(e.error);
  if (/ResizeObserver loop/.test(msg)) return;                       // a harmless browser notice, not an app error
  showFatal(msg);
});
window.addEventListener("unhandledrejection", e => showFatal((e.reason && (e.reason.message || e.reason)) + ""));

/* Brings data saved by older versions up to date. Each step is safe to run on every load. */
function upgradeSaved() {
  for (const d of S.decks) {
    d.swPool ||= []; d.tags ||= {}; d.cats ||= []; d.order ||= {};
    migrateCats(d);                                   // categories: current built-ins
    delete d.scen; delete d.hand;                     // old hand scenarios (now d.probs)
  }
  for (const f of S.formats) { f.over ||= {}; f.pover ||= {}; }
  const ui = S.ui;
  if (!SEARCH_SORTS[ui.searchSort]) ui.searchSort = "alpha";
  if (!DECK_VIEWS.some(([v]) => v === ui.deckView)) ui.deckView = ui.deckSort === "cats" ? "cats" : "table";   // old Sort menu
  if (!ui.uiV || ui.uiV < 2) { ui.textSearch = true; ui.uiV = 2; }                  // "Match card text" became the default
  if (ui.img === "local") ui.img = "path"; else if (!["off", "folder", "path"].includes(ui.img)) ui.img = "off";
  for (const k of ["deckSort", "xinfoOpen", "art", "dealSize", "catWidth"]) delete ui[k];   // settings of removed features
}

async function init() {
  S.decks = LS.get("decks", []); S.formats = LS.get("formats", []);
  if (!S.decks.length) S.decks.push(newDeck("My deck"));
  if (!S.formats.length) S.formats.push(newFormat("TCG"), newFormat("Genesys"), newFormat("Unlimited"));
  upgradeSaved();
  const cur = LS.get("cur", {});
  S.deckId = S.decks.some(d => d.id === cur.deck) ? cur.deck : S.decks[0].id;
  S.fmtId = S.formats.some(f => f.id === cur.fmt) ? cur.fmt : S.formats[0].id;
  $("#tabs").addEventListener("click", e => { const t = e.target.closest("button"); if (t) setTab(t.dataset.tab); });
  $("#deckSel").onchange = e => { S.deckId = e.target.value; S.sel = null; changed(); };
  $("#fmtSel").onchange = e => { S.fmtId = e.target.value; changed(); renderResults(); };
  $("#ptsToggle").onchange = e => { fmt().points = e.target.checked; changed(); renderResults(); };
  $("#legalPill").onclick = e => { e.stopPropagation(); $("#legal").classList.toggle("open"); };   // tap support for touch screens
  document.addEventListener("click", () => $("#legal").classList.remove("open"));
  $("#fileIn").onchange = async e => { const file = e.target.files[0]; if (!file) return;
    const { d, unknown } = parseYdk(await file.text()); importDeck(d, unknown, file.name.replace(/\.ydk$/i, "")); e.target.value = ""; };
  document.addEventListener("dragover", e => e.preventDefault());
  document.addEventListener("drop", async e => { const f = e.dataTransfer.files && e.dataTransfer.files[0]; if (f && /\.ydk$/i.test(f.name)) { e.preventDefault(); const { d, unknown } = parseYdk(await f.text()); importDeck(d, unknown, f.name.replace(/\.ydk$/i, "")); } });
  await idb.open();
  await loadDB();
  renderHeader(); setTab(cur.tab === "probs" ? "hands" : cur.tab === "stats" || !cur.tab ? "build" : cur.tab);   // app first; pictures load afterwards
  // Re-reading a big image folder can take a while (thousands of files), so it runs in the background.
  // Always redraw afterwards: the folder may need a "Reconnect" click, and that button must appear.
  restoreFolder().then(() => { if (IMGS.urls.size) probePath(); renderResults(); renderTab(); })
    .catch(e => console.warn("Image folder:", e));
  // quiet background check: a tiny meta.json request, full download only when the data changed
  syncData().then(r => { if (r.updated) { toast(`Card data updated (${S.meta.n} cards)`); changed(); renderResults(); } }).catch(e => console.warn(e));
}

initDeckMenu();
init().catch(e => { console.error(e); showFatal(e.message || String(e)); });

// Open the app with ?debug in the address to use every module's functions from the browser console.
if (new URLSearchParams(location.search).has("debug")) {
  const mods = ["util", "store", "cards", "legality", "deck", "ydk", "prob", "smallworld", "images", "backup", "ui",
    "tabs/build", "tabs/hands", "tabs/smallworld", "tabs/format"];
  Promise.all(mods.map(m => import(`./${m}.js`))).then(ms => { ms.forEach(x => Object.assign(window, x)); console.info("Debug: module functions are on window."); });
}
