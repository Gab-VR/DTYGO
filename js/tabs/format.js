// tabs/format.js
import { backupAll, restoreAll } from "../backup.js";
import { loadDataFile, syncData } from "../cards.js";
import { connectFolder, coverage, folderReport, imageDiagnostics, IMGS, probePath } from "../images.js";
import { limitOf, newFormat, PRESETS } from "../legality.js";
import { card, changed, fmt, S, save } from "../store.js";
import { cardPicker, imageSelect, renderHeader } from "../ui.js";
import { $, BUILD, emit, h, toast, uid } from "../util.js";

/* ================= format tab ================= */
function renderFormat() {
  const root = $("#tab-format"), f = fmt();
  const upd = () => { save(); renderHeader(); renderFormat(); emit("results"); };
  const num = (k, attrs = {}) => h("input", Object.assign({ type: "number", value: f[k], min: 0, onchange: e => { f[k] = Math.max(0, +e.target.value || 0); upd(); } }, attrs));
  const list = h("aside", { class: "panel" }, h("h2", {}, "Formats"),
    S.formats.map(x => h("div", { class: "list-item" + (x.id === f.id ? " on" : ""), tabindex: 0, onclick: () => { S.fmtId = x.id; upd(); }, onkeydown: e => e.key === "Enter" && e.target.click() },
      h("span", {}, x.name), h("span", { class: "dim", style: { fontSize: "12px" } }, x.points ? `${x.cap} pts` : x.banlist === "none" ? "no list" : x.banlist.toUpperCase()))),
    h("h3", { style: { marginTop: "14px" } }, "New from preset"),
    h("div", { class: "row" }, Object.keys(PRESETS).map(p => h("button", { class: "small", onclick: () => { const n = newFormat(p, uniqueName(p)); S.formats.push(n); S.fmtId = n.id; upd(); } }, p))),
    h("h3", { style: { marginTop: "18px" } }, "Card images"),
    h("div", {}, imageSelect()),
    S.ui.img === "folder" ? h("div", { style: { marginTop: "6px" } },
      h("p", { class: "dim", style: { fontSize: "12px" } }, folderReport() || (IMGS.needsPermission ? "Needs permission again." : "No folder chosen yet.")),
      IMGS.urls.size && coverage().missing.length ? h("details", { style: { fontSize: "12px", margin: "0 0 8px" } },
        h("summary", {}, "Cards in this deck without an image"),
        h("ul", { style: { margin: "4px 0", paddingLeft: "18px" } }, coverage().missing.map(c => h("li", {}, c.name)))) : null,
      h("button", { class: "small", onclick: async () => { await connectFolder(); renderFormat(); } },
        IMGS.needsPermission ? "Reconnect folder" : IMGS.urls.size ? "Choose another folder" : "Choose folder")) : null,
    h("button", { class: "small ghost", style: { marginTop: "6px" }, onclick: async () => {
      const t = await imageDiagnostics();
      try { await navigator.clipboard.writeText(t); toast("Picture diagnostics copied"); } catch { prompt("Copy this:", t); } } }, "Copy picture diagnostics"),
    S.ui.img === "path" ? h("div", { style: { marginTop: "6px" } },
      h("label", { class: "dim", style: { fontSize: "12px" } }, "Full card image URL"),
      h("input", { style: { width: "100%" }, value: S.ui.imgTpl, onchange: e => { S.ui.imgTpl = e.target.value.trim() || "pics/{id}.jpg"; save(); probePath(); } }),
      h("label", { class: "dim", style: { fontSize: "12px", display: "block", marginTop: "4px" } }, "Cropped art URL (optional)"),
      h("input", { style: { width: "100%" }, value: S.ui.artTpl, placeholder: "e.g. art/{id}.jpg", onchange: e => { S.ui.artTpl = e.target.value.trim(); save(); } }),
      null) : null,
    h("h3", { style: { marginTop: "18px" } }, "Backup"),
    h("div", { class: "row" },
      h("button", { class: "small", onclick: backupAll }, "Back up everything"),
      h("button", { class: "small", onclick: () => $("#backupIn").click() }, "Restore backup")),
    h("input", { type: "file", id: "backupIn", accept: ".json,application/json", hidden: true, onchange: async e => {
      const f = e.target.files[0]; e.target.value = ""; if (!f) return;
      try { const r = restoreAll(JSON.parse(await f.text())); toast(`Restored ${r.decks} deck${r.decks === 1 ? "" : "s"} and ${r.formats} format${r.formats === 1 ? "" : "s"}`); changed(); }
      catch (err) { toast(`That file isn't a backup from this app (${err.message})`); } } }),
    h("h3", { style: { marginTop: "18px" } }, "Card data"),
    h("p", { class: "dim", style: { fontSize: "13px" } }, S.meta ? `${S.meta.n} cards, built ${new Date(S.meta.fetched).toLocaleString()}${S.meta.source ? ` from YGOPRODeck database v${S.meta.source}` : ""}. Points lists: ${Object.keys(S.gp).length} Genesys, ${Object.keys(S.gpo).length} Genesys OCG.` : "Not loaded yet."),
    (() => {
      const st = h("p", { class: "dim", style: { fontSize: "12px" } });
      const file = h("input", { type: "file", accept: ".json,application/json", hidden: true, onchange: async e => { const f = e.target.files[0]; if (!f) return;
        try { await loadDataFile(f); st.textContent = "Loaded."; changed(); emit("results"); } catch (err) { st.textContent = `Couldn't load it: ${err.message}.`; } } });
      return [h("div", { class: "row" },
        h("button", { class: "small", onclick: async () => { st.textContent = "Checking…";
          try { const r = await syncData(m => st.textContent = m); st.textContent = !r.reachable ? `Can't reach data/meta.json (${r.err}).` : r.updated ? "Updated." : "Already up to date."; if (r.updated) changed(); }
          catch (err) { st.textContent = `Update failed: ${err.message}`; } } }, "Check for updates"),
        h("button", { class: "small", onclick: () => file.click() }, "Load cards.json")), st, file];
    })(),
    h("p", { class: "dim", style: { fontSize: "11px", marginTop: "18px" } }, "Card data from YGOPRODeck. Yu-Gi-Oh! card text and images are copyright 4K Media Inc., a subsidiary of Konami Digital Entertainment. A deckbuilder is not affiliated with either.", h("br"), `Build ${BUILD}.`));
  const overRows = Object.keys({ ...f.over, ...f.pover }).map(id => card(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  const editor = h("div", { class: "panel" },
    h("div", { class: "row", style: { marginBottom: "12px" } }, h("h2", { class: "grow" }, f.name),
      h("button", { onclick: () => { const c = JSON.parse(JSON.stringify(f)); c.id = uid(); c.name = uniqueName(f.name + " copy"); S.formats.push(c); S.fmtId = c.id; upd(); } }, "Duplicate"),
      h("button", { disabled: S.formats.length < 2, onclick: () => { if (!confirm(`Delete format "${f.name}"?`)) return; S.formats = S.formats.filter(x => x !== f); S.fmtId = S.formats[0].id; upd(); } }, "Delete")),
    h("div", { class: "form" },
      h("label", {}, "Name"), h("input", { value: f.name, onchange: e => { f.name = e.target.value.trim() || f.name; upd(); } }),
      h("label", {}, "Main Deck size"), h("div", { class: "row" }, num("min", { style: { width: "80px" }, "aria-label": "Minimum" }), "to", num("max", { style: { width: "80px" }, "aria-label": "Maximum" })),
      h("label", {}, "Extra Deck max"), num("extraMax"),
      h("label", {}, "Side Deck max"), num("sideMax"),
      h("label", {}, "Copies per card"), num("copies", { max: 60 }),
      h("label", {}, "Forbidden & Limited list"), h("select", { onchange: e => { f.banlist = e.target.value; upd(); } },
        [["none", "None"], ["tcg", "TCG (current)"], ["ocg", "OCG (current)"], ["goat", "Goat"]].map(([v, l]) => h("option", { value: v, selected: f.banlist === v }, l))),
      h("label", {}, "Card pool"), h("select", { onchange: e => { f.pool = e.target.value; upd(); } },
        [["any", "Any card"], ["TCG", "TCG"], ["OCG", "OCG"], ["GOAT", "Goat"], ["Edison", "Edison"], ["Master Duel", "Master Duel"], ["Duel Links", "Duel Links"]].map(([v, l]) => h("option", { value: v, selected: f.pool === v }, l))),
      h("label", {}, "Ban Link & Pendulum"), h("label", { class: "row" }, h("input", { type: "checkbox", checked: f.noLinkPend, onchange: e => { f.noLinkPend = e.target.checked; upd(); } }), h("span", { class: "dim" }, "Genesys rule")),
      h("label", {}, "Points"), h("label", { class: "row" }, h("input", { type: "checkbox", checked: f.points, onchange: e => { f.points = e.target.checked; upd(); } }), "Count points"),
      h("label", {}, "Points list"), h("select", { disabled: !f.points, onchange: e => { f.pointsList = e.target.value; upd(); } },
        [["gp", "Genesys"], ["gpo", "Genesys OCG"]].map(([v, l]) => h("option", { value: v, selected: f.pointsList === v }, l))),
      h("label", {}, "Point cap"), num("cap", { disabled: !f.points })),
    h("h3", { style: { marginTop: "20px" } }, "Card overrides"),
    h("div", { style: { maxWidth: "360px", marginBottom: "10px" } }, cardPicker(c => { if (f.over[c.id] == null && f.pover[c.id] == null) f.over[c.id] = limitOf(c); upd(); })),
    overRows.length ? h("table", { style: { maxWidth: "620px" } },
      h("tr", {}, h("th", {}, "Card"), h("th", {}, "Limit"), h("th", {}, "Points"), h("th", {})),
      overRows.map(c => h("tr", {}, h("td", {}, c.name),
        h("td", {}, h("input", { type: "number", min: 0, max: 60, style: { width: "70px" }, value: f.over[c.id] ?? "", placeholder: String((() => { const o = f.over[c.id]; delete f.over[c.id]; const l = limitOf(c); if (o != null) f.over[c.id] = o; return l; })()),
          "aria-label": "Limit override", onchange: e => { e.target.value === "" ? delete f.over[c.id] : f.over[c.id] = Math.max(0, +e.target.value); upd(); } })),
        h("td", {}, h("input", { type: "number", min: 0, style: { width: "70px" }, value: f.pover[c.id] ?? "", placeholder: String((S[f.pointsList] || {})[c.id] || 0),
          "aria-label": "Points override", onchange: e => { e.target.value === "" ? delete f.pover[c.id] : f.pover[c.id] = Math.max(0, +e.target.value); upd(); } })),
        h("td", {}, h("button", { class: "small ghost", title: "Remove override", onclick: () => { delete f.over[c.id]; delete f.pover[c.id]; upd(); } }, "✕")))))
      : h("p", { class: "dim" }, "No overrides yet."));
  root.className = "tab on fmt"; root.replaceChildren(list, editor);
}
function uniqueName(base) { let n = base, i = 2; while (S.formats.some(f => f.name === n)) n = `${base} ${i++}`; return n; }

export { renderFormat, uniqueName };
