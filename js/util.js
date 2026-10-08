// util.js
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") { for (const [p, x] of Object.entries(v)) p.startsWith("--") ? e.style.setProperty(p, x) : e.style[p] = x; }
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("aria-")) e.setAttribute(k, String(v));
    else if (k in e && typeof v !== "string") e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) e.append(k.nodeType ? k : String(k));
  return e;
}
// let replaceChildren skip null/false like h() does
if (typeof Element !== "undefined") { const rc = Element.prototype.replaceChildren; Element.prototype.replaceChildren = function (...k) { rc.apply(this, k.flat(Infinity).filter(x => x != null && x !== false)); }; }
const uid = () => Math.random().toString(36).slice(2, 10);
const pct = p => p <= 0 ? "0%" : p >= 1 ? "100%" : (100 * p).toFixed(p > 0.999 || p < 0.001 ? 2 : 1) + "%";
function toast(msg) { if (typeof document === "undefined") return; const t = $("#toast"); t.textContent = msg; t.style.display = "block"; clearTimeout(toast.t); toast.t = setTimeout(() => t.style.display = "none", 2600); }
const binomMemo = new Map();
function binom(n, k) {
  if (k < 0 || k > n) return 0; k = Math.min(k, n - k);
  const key = n * 1000 + k; if (binomMemo.has(key)) return binomMemo.get(key);
  let r = 1; for (let i = 1; i <= k; i++) r = r * (n - k + i) / i;
  binomMemo.set(key, r); return r;
}
const BUILD = "2026-09-28 results-bar";

/* A tiny event bus: logic modules announce what changed, main.js decides what to redraw.
   Events: "changed" (deck/format edited), "select" (selected card), "results" (search list),
   "images" (pictures loaded or failed), "images:progress" (folder being read). */
const listeners = {};
function on(ev, fn) { (listeners[ev] ||= []).push(fn); }
function emit(ev, ...args) { for (const fn of listeners[ev] || []) fn(...args); }

// Saves a Blob as a download (backups, .ydk files).
function download(blob, name) {
  const a = h("a", { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export { $, $$, binom, binomMemo, BUILD, download, emit, h, listeners, on, pct, toast, uid };
