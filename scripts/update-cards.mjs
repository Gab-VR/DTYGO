#!/usr/bin/env node
// Builds data/cards.json and data/meta.json from the YGOPRODeck API.
//
// Polite by design (https://ygoprodeck.com/api-guide/):
//  * asks checkDBVer.php first and stops if nothing changed;
//  * otherwise makes 3 requests, one second apart (limit is 20/s);
//  * still checks the Genesys point lists every run (they can change without a version bump);
//  * refreshes everything anyway once a week.
//
// Usage: node scripts/update-cards.mjs [--force]      (Node 18+)

import { readFile, writeFile, mkdir } from "node:fs/promises";

const API = "https://db.ygoprodeck.com/api/v7/";
const OUT = new URL("../data/", import.meta.url);
const WEEK = 7 * 24 * 3600 * 1000;
const SCHEMA = 2;   // bump when the file layout changes, so clients and this script rebuild
const force = process.argv.includes("--force");
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getJSON(path) {
  const r = await fetch(API + path, { headers: { "User-Agent": "A-deckbuilder-updater" } });
  if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
  return r.json();
}

// Set names and rarities repeat thousands of times, so they're stored once and referenced by index.
const setNames = [], rarities = [], setIdx = new Map(), rarIdx = new Map();
const intern = (v, list, map) => { if (!map.has(v)) { map.set(v, list.length); list.push(v); } return map.get(v); };

// Keep only what the app uses; this roughly halves the file.
function trim(c) {
  const m = c.misc_info?.[0] ?? {}, b = c.banlist_info ?? {};
  const o = { id: c.id, name: c.name, type: c.type, frame: c.frameType ?? "", desc: c.desc ?? "", race: c.race ?? "" };
  if (c.attribute) o.attr = c.attribute;
  if (c.atk != null) o.atk = c.atk;
  if (c.def != null) o.def = c.def;
  if (c.level != null) o.level = c.level;
  if (c.linkval != null) o.link = c.linkval;
  if (c.scale != null) o.scale = c.scale;
  if (c.archetype) o.arch = c.archetype;
  o.ban = { tcg: b.ban_tcg ?? null, ocg: b.ban_ocg ?? null, goat: b.ban_goat ?? null };
  o.formats = (m.formats ?? []).map(s => s.toLowerCase());
  const alts = (c.card_images ?? []).map(i => i.id).filter(id => id !== c.id);
  if (alts.length) o.alts = alts;
  if (m.tcg_date) o.tcg = m.tcg_date;
  if (m.ocg_date) o.ocg = m.ocg_date;
  if (c.card_sets?.length) o.sets = c.card_sets.map(s => [s.set_code, intern(s.set_name, setNames, setIdx), intern(s.set_rarity, rarities, rarIdx)]);
  return o;
}
const points = (cards, key) => {
  const out = {};
  for (const c of cards) { const v = Number(c.misc_info?.[0]?.[key]); if (v) out[c.id] = v; }
  return out;
};

const prev = await readFile(new URL("meta.json", OUT), "utf8").then(JSON.parse).catch(() => null);
const ver = await getJSON("checkDBVer.php");
const dbVersion = String((Array.isArray(ver) ? ver[0] : ver)?.database_version ?? "unknown");
const stale = !prev || Date.now() - Date.parse(prev.fetched) > WEEK;

// Point lists can change without a database version bump, so they're checked on every run.
async function pointLists() {
  await sleep(1000);
  const gp = points((await getJSON("cardinfo.php?format=genesys&misc=yes")).data, "genesys_points");
  await sleep(1000);
  let gpo = null;
  try { gpo = points((await getJSON("cardinfo.php?format=genesys%20ocg&misc=yes")).data, "genesys_ocg_points"); }
  catch (e) { console.warn(`Genesys OCG list skipped: ${e.message}`); }
  if (Object.keys(gp).length === 0) throw new Error("Empty Genesys point list; not writing.");
  return { gp, gpo };
}
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

if (!force && !stale && prev.source === dbVersion && prev.schema === SCHEMA) {
  const old = await readFile(new URL("cards.json", OUT), "utf8").then(JSON.parse).catch(() => null);
  if (!old) { console.log("cards.json missing; rebuilding."); }
  else {
    const { gp, gpo } = await pointLists();
    if (same(gp, old.gp || {}) && (!gpo || same(gpo, old.gpo || {}))) {
      console.log(`Up to date (YGOPRODeck database v${dbVersion}, point lists unchanged).`);
      process.exit(0);
    }
    // Only the points changed: keep the cards, update the lists, and bump the version so the app reloads.
    const fetched = new Date().toISOString();
    Object.assign(old, { gp, gpo: gpo ?? old.gpo ?? {}, version: fetched, fetched });
    await writeFile(new URL("cards.json", OUT), JSON.stringify(old));
    await writeFile(new URL("meta.json", OUT), JSON.stringify({ schema: SCHEMA, version: fetched, fetched, source: dbVersion, count: old.cards.length }, null, 2) + "\n");
    console.log(`Point lists updated: ${Object.keys(gp).length} Genesys, ${Object.keys(old.gpo).length} Genesys OCG entries.`);
    process.exit(0);
  }
}

console.log(`Building from YGOPRODeck database v${dbVersion}…`);
await sleep(1000);
const all = (await getJSON("cardinfo.php?misc=yes")).data;
const lists = await pointLists();
const gp = lists.gp, gpo = lists.gpo ?? {};

// Refuse to publish something obviously broken.
if (!Array.isArray(all) || all.length < 10000) throw new Error(`Only ${all?.length} cards returned; not writing.`);

const fetched = new Date().toISOString();
const cards = all.filter(c => c.frameType !== "skill").map(trim);
const blob = { schema: SCHEMA, version: fetched, fetched, source: dbVersion, cards, gp, gpo, setNames, rarities };

await mkdir(OUT, { recursive: true });
await writeFile(new URL("cards.json", OUT), JSON.stringify(blob));
await writeFile(new URL("meta.json", OUT), JSON.stringify({ schema: SCHEMA, version: fetched, fetched, source: dbVersion, count: cards.length }, null, 2) + "\n");
console.log(`Wrote ${cards.length} cards, ${Object.keys(gp).length} Genesys and ${Object.keys(gpo).length} Genesys OCG point entries.`);
