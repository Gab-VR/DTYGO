// images.js
import { card, deck, idb, S, save } from "./store.js";
import { BUILD, emit, h, toast } from "./util.js";

/* Images: "off" | "folder" (a folder the user picks; files stay on their machine)
   | "path" (a URL template such as pics/{id}.jpg, for a self-hosted or local copy) */
const IMGS = { urls: new Map(), handle: null, needsPermission: false, pathHits: 0, pathMisses: 0 };
// In path mode, try a few of the deck's images so we can say clearly when the path finds nothing.
// Test-load a handful of images (deck cards first) so a mode that "works" but shows nothing is reported.
function probePath() {
  IMGS.pathHits = IMGS.pathMisses = 0; IMGS.probeErr = null;
  if (S.ui.img === "off" || (S.ui.img === "folder" && !IMGS.urls.size)) return;
  const d = deck();
  let ids = [...new Set([...Object.keys(d.main), ...Object.keys(d.extra), ...Object.keys(d.side)])].map(Number);
  if (S.ui.img === "folder") {   // deck cards that have images, plus a random sample across the folder
    const keys = [...IMGS.urls.keys()];
    ids = ids.filter(id => IMGS.urls.has(id)).slice(0, 6);
    for (let i = 0; i < 6 && keys.length; i++) ids.push(keys[Math.floor(Math.random() * keys.length)]);
  }
  ids = [...new Set(ids)].slice(0, 12);
  if (!ids.length) return;
  let left = ids.length;
  const done = ok => { ok ? IMGS.pathHits++ : IMGS.pathMisses++; if (--left === 0) emit("images"); };
  for (const id of ids) { const im = new Image(); im.onload = () => done(true); im.onerror = () => done(false); im.src = IMG_FULL(id); }
}
const imgOn = () => S.ui.img === "path" || (S.ui.img === "folder" && IMGS.urls.size > 0);
const IMG_FULL = id => S.ui.img === "path" ? S.ui.imgTpl.replace("{id}", id) : IMGS.urls.get(+id) || "";
const IMG_ART = id => S.ui.img === "path" && S.ui.artTpl ? S.ui.artTpl.replace("{id}", id) : IMG_FULL(id);
// a full card image has its art box in the upper middle; a cropped-art template is used as is
const artPos = () => S.ui.img === "path" && S.ui.artTpl ? {} : { backgroundSize: "150%", backgroundPosition: "50% 28%" };
const hideBroken = e => { e.target.style.visibility = "hidden"; };
/* ================= image folder ================= */
/* Folder images. IMGS.diag records what happened so failures are explained, not silent. */
const IMG_NAME = /^(\d+)\.(jpe?g|png|webp)$/i;
function newDiag() { return { scanned: 0, matched: 0, others: [], unreadable: 0, error: null }; }
function indexFiles(files, diag = newDiag()) {
  for (const u of new Set(IMGS.urls.values())) URL.revokeObjectURL(u);
  IMGS.urls.clear(); IMGS.pathHits = IMGS.pathMisses = 0;   // old probe results no longer apply
  for (const f of files) {
    diag.scanned++;
    const m = IMG_NAME.exec(f.name);
    if (!m) { if (diag.others.length < 3) diag.others.push(f.name); continue; }
    diag.matched++;
    if (!IMGS.urls.has(+m[1])) IMGS.urls.set(+m[1], URL.createObjectURL(f));
  }
  linkAltArts();
  IMGS.diag = diag;
}
// A card whose image only exists under an alternate-art passcode uses that image.
function linkAltArts() {
  for (const [alt, main] of S.alias) if (!IMGS.urls.has(main) && IMGS.urls.has(alt)) IMGS.urls.set(main, IMGS.urls.get(alt));
}
// How many known cards (overall and in the current deck) have an image in the chosen folder.
function coverage() {
  let have = 0, unknown = 0;
  for (const c of S.list) if (IMGS.urls.has(c.id)) have++;
  for (const id of IMGS.urls.keys()) if (!S.cards.has(id) && !S.alias.has(id)) unknown++;
  const d = deck(), ids = [...new Set([...Object.keys(d.main), ...Object.keys(d.extra), ...Object.keys(d.side)])].map(Number);
  const missing = ids.filter(id => !IMGS.urls.has(id)).map(card).filter(Boolean);
  return { have, total: S.list.length, unknown, deckTotal: ids.length, missing };
}
async function* walkDir(dir, depth = 0) {
  const subdirs = [];
  for await (const e of dir.values()) { if (e.kind === "file") yield e; else if (depth < 2) subdirs.push(e); }
  for (const d of subdirs) yield* walkDir(d, depth + 1);   // top-level files win over subfolders like pics/field
}
async function indexHandle(dir) {
  const files = [], diag = newDiag();
  IMGS.folderName = dir.name; IMGS.reading = "listing files"; emit("images:progress");
  const handles = [];
  for await (const fh of walkDir(dir)) {
    if (IMG_NAME.test(fh.name)) handles.push(fh);
    else { diag.scanned++; if (diag.others.length < 3) diag.others.push(fh.name); }
  }
  for (let i = 0; i < handles.length; i += 250) {          // open files in parallel batches, not one by one
    const got = await Promise.allSettled(handles.slice(i, i + 250).map(fh => fh.getFile()));
    for (const r of got) { if (r.status === "fulfilled") files.push(r.value); else { diag.unreadable++; diag.error ||= `${r.reason.name}: ${r.reason.message}`; } }
    IMGS.reading = `${Math.min(i + 250, handles.length).toLocaleString()}/${handles.length.toLocaleString()}`; emit("images:progress");
  }
  // Cloud-only files list fine but fail when read, so test one.
  if (files.length) {
    try { await files[0].slice(0, 16).arrayBuffer(); }
    catch (e) { diag.error = `${e.name}: ${e.message}`; diag.unreadable = files.length; files.length = 0; }
  }
  IMGS.reading = null;
  indexFiles(files, diag);          // counts the readable images into diag
  diag.scanned += diag.unreadable;
  IMGS.needsPermission = false;
}
function folderReport() {
  const d = IMGS.diag; if (!d) return "";
  if (IMGS.urls.size && IMGS.pathMisses && !IMGS.pathHits) return "The pictures in that folder couldn't be displayed. Check that they're complete image files, then choose the folder again.";
  if (IMGS.urls.size && IMGS.pathMisses) return `Some pictures in "${IMGS.folderName || "the folder"}" couldn't be displayed.`;
  if (IMGS.urls.size) return `Pictures from "${IMGS.folderName || "your folder"}"${IMGS.session ? " (for this session)" : ""}.`;
  if (d.unreadable) return `Found ${d.unreadable} images but couldn't read them (${d.error}). Choose the folder again.`;
  if (d.gone) return "The image folder you chose before was moved or deleted. Choose it again from its new location.";
  if (d.aborted) return d.via ? "No folder was selected." : "Edge closed the folder dialog without giving the app a folder. Press the button to try again.";
  if (d.error) return `Couldn't read the folder: ${d.error}.`;
  if (!d.scanned) return "That folder is empty. Pick the folder that directly contains the image files.";
  return `None of the ${d.scanned} files are named by passcode (like 89631139.jpg). Examples found: ${d.others.join(", ")}.`;
}
// Second route: the standard folder field ("set" a folder). Works in any browser, and nothing is
// sent anywhere (the files are only read by this page), but the choice lasts one session.
function pickWithInput() {
  return new Promise(res => {
    const inp = h("input", { type: "file", webkitdirectory: true, multiple: true, style: { display: "none" } });
    document.body.append(inp);
    const done = v => { inp.remove(); res(v); };
    inp.addEventListener("change", () => {
      const files = [...inp.files];
      IMGS.handle = null; IMGS.needsPermission = false;
      IMGS.folderName = files[0] && files[0].webkitRelativePath ? files[0].webkitRelativePath.split("/")[0] : "your folder";
      indexFiles(files); IMGS.session = true; done(true);
    });
    inp.addEventListener("cancel", () => { IMGS.diag = Object.assign(newDiag(), { aborted: true, error: "cancelled", via: "file picker" }); done(true); });
    inp.click();
  });
}
async function pickFolder() {
  if (!window.showDirectoryPicker) return pickWithInput();
  let d;
  try { d = await window.showDirectoryPicker({ mode: "read" }); }
  catch (e) {
    // AbortError covers both "Cancel" and Edge refusing the folder (e.g. "contains system files").
    IMGS.diag = Object.assign(newDiag(), { aborted: e.name === "AbortError", error: `${e.name}: ${e.message}` });
    return true;
  }
  IMGS.handle = d; IMGS.session = false;
  try { await idb.set("imgdir", d); } catch {}
  try { await indexHandle(d); } catch (e) { IMGS.reading = null; IMGS.diag = Object.assign(IMGS.diag || newDiag(), { error: `${e.name}: ${e.message}` }); }
  return true;
}
// The saved folder may have been moved, renamed or deleted since last time; then forget it
// so the button offers a fresh "Choose image folder" instead of reconnecting to a dead path.
async function forgetFolder(reason) {
  IMGS.handle = null; IMGS.needsPermission = false; IMGS.urls.clear();
  try { await idb.set("imgdir", null); } catch {}
  IMGS.diag = Object.assign(newDiag(), { error: reason, gone: true });
}
const isGone = e => e && (e.name === "NotFoundError" || e.name === "NotReadableError" && /not found|could not be found/i.test(e.message));
async function restoreFolder() {
  const d = await idb.get("imgdir");
  IMGS.restore = !d ? "no saved folder" : !d.queryPermission ? "saved folder is not a folder handle" : "found";
  if (!d || !d.queryPermission) return;
  IMGS.handle = d;
  let perm;
  try { perm = await d.queryPermission({ mode: "read" }); } catch { return forgetFolder("saved folder unavailable"); }
  IMGS.restore = `permission ${perm}`;
  if (perm !== "granted") { IMGS.needsPermission = true; return; }
  try { await indexHandle(d); } catch (e) { IMGS.reading = null; IMGS.restore = `read failed: ${e.name}: ${e.message}`; return isGone(e) ? forgetFolder("moved or deleted") : (IMGS.needsPermission = true); }
}
async function reconnectFolder() {
  try {
    if (!IMGS.handle || await IMGS.handle.requestPermission({ mode: "read" }) !== "granted") return false;
    await indexHandle(IMGS.handle); return true;
  } catch (e) {
    if (isGone(e)) { await forgetFolder("moved or deleted"); return pickFolder(); }   // same click: go straight to the picker
    IMGS.diag = Object.assign(newDiag(), { error: `${e.name}: ${e.message}` }); return true;
  }
}
// Called from a button click, so the browser allows the folder dialog.
// Folder access that Edge remembers only works on http(s) pages; elsewhere use the folder field.
const canRememberFolder = () => !!window.showDirectoryPicker && window.isSecureContext && location.protocol !== "file:";
async function connectFolder() {
  if (!canRememberFolder()) return connectWithInput();   // decided before any await, so the click still counts
  IMGS.reading = null; IMGS.diag = null;
  const ok = IMGS.needsPermission ? await reconnectFolder() : await pickFolder();
  if (ok && IMGS.urls.size) toast(`${IMGS.urls.size.toLocaleString()} pictures loaded`);
  probePath(); emit("images");
}
async function connectWithInput() {   // must run straight from the click, so no await before pickWithInput
  IMGS.reading = null; IMGS.diag = null;
  const p = pickWithInput(); await p;
  if (IMGS.urls.size) toast(`${IMGS.urls.size.toLocaleString()} pictures loaded`);
  probePath(); emit("images");
}
// Switching modes never opens a dialog by itself (a dropdown change doesn't always count as a click);
// folder mode shows a "Choose image folder" button instead.
// Everything needed to debug pictures, for pasting into a bug report.
async function imageDiagnostics() {
  let saved = null, perm = null;
  try { saved = await idb.get("imgdir"); } catch (e) { saved = `error ${e.name}`; }
  try { if (saved && saved.queryPermission) perm = await saved.queryPermission({ mode: "read" }); } catch (e) { perm = `error ${e.name}`; }
  return JSON.stringify({ build: BUILD, origin: location.origin, secureContext: window.isSecureContext, mode: S.ui.img, pickerAvailable: !!window.showDirectoryPicker,
    indexedDB: !!idb.db, savedFolder: saved ? (saved.name || typeof saved) : null, permission: perm, restore: IMGS.restore || null,
    folderName: IMGS.folderName || null, sessionOnly: !!IMGS.session, pictures: IMGS.urls.size, needsPermission: IMGS.needsPermission, reading: IMGS.reading || null,
    diag: IMGS.diag || null, probe: { ok: IMGS.pathHits, failed: IMGS.pathMisses }, cards: S.cards.size, browser: navigator.userAgent }, null, 1);
}
function chooseImages(mode) { S.ui.img = mode; save(); probePath(); emit("images"); }

export { artPos, canRememberFolder, chooseImages, connectFolder, connectWithInput, coverage, folderReport, forgetFolder, hideBroken, imageDiagnostics, IMG_ART, IMG_FULL, IMG_NAME, imgOn, IMGS, indexFiles, indexHandle, isGone, linkAltArts, newDiag, pickFolder, pickWithInput, probePath, reconnectFolder, restoreFolder, walkDir };
