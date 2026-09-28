# A deckbuilder: development notes

Notes for working on the app. For using it, see [README.md](README.md).

A Yu-Gi-Oh! deckbuilder: search and build with legality checks for editable formats
(including Genesys points), exact opening-hand probabilities by category, deck stats,
and a Small World bridge graph. It is a single static page with no build step.

```
index.html                 page skeleton
css/app.css                all styles
js/                        the app, as ES modules (see "Code layout")
assets/KDE_DeckList.pdf    Konami's fillable deck registration sheet (the Sheet view fills it)
tests/                     unit tests: node --test
data/cards.json            card snapshot (generated, don't edit)
data/meta.json             snapshot version (generated)
scripts/update-cards.mjs   builds data/ from the YGOPRODeck API
scripts/download-images.mjs  one-time fill of a local picture folder
.github/workflows/         daily data update; tests on every push
```

## Code layout

Logic modules never import interface code. They report changes with `emit()` and
`main.js` decides what to redraw, so every file can be read (and tested) on its own.

```
js/util.js        h() element helper, toast, binom, event bus (on/emit), download
js/store.js       app state S, saving (localStorage + IndexedDB), card()/deck()/fmt(), changed()
js/cards.js       card model helpers, loading and syncing data/cards.json
js/legality.js    formats, limits, Genesys points, card pool, validate()
js/deck.js        add/move/reorder, custom order, categories
js/ydk.js         .ydk and ydke:// import/export
js/decklist.js    the deck registration sheet: slots, and filling Konami's PDF form
js/smallworld.js  Small World links and bridges; the radial layout (twins merged, ring order
                  chosen to minimise crossings)
js/prob.js        exact opening-hand probabilities (multivariate hypergeometric); hand
                  patterns are matched slot-by-slot using Hall's theorem
js/images.js      picture folder / URL path, diagnostics
js/backup.js      back up and restore every deck and format
js/ui.js          header, tab switching, card tiles, drag-and-drop line, picture notice, card picker
js/deckmenu.js    the header's Deck menu: new, rename, duplicate, delete, .ydk, YDKE
js/tabs/*.js      one file per tab: build, hands, stats, smallworld, format
js/tabs/deckviews.js  the Build tab's Table and Sheet views (Categories is in build.js)
js/vendor/        pdf-lib 1.17.1 (MIT), stored locally so nothing is fetched online
js/main.js        registers the tabs, wires events, starts the app
```

To add a tab: create `js/tabs/mytab.js` exporting a `renderMyTab()` that fills
`#tab-mytab`, add a `<button data-tab="mytab">` and `<section class="tab" id="tab-mytab">`
to `index.html`, and call `registerTab("mytab", renderMyTab)` in `main.js`.

Open the app with `?debug` (`http://localhost:8000/?debug`) to use every module's
functions from the browser console.

## Deck views

The Build tab shows the deck three ways: **Table** (every copy as a full card miniature),
**Sheet** (the deck registration form, with your details and an *Export PDF* button that
fills in Konami's form; the fields stay editable in the PDF) and **Categories** (Main Deck
cards grouped by category). In all three, drag cards to reorder and right-click to remove.

## Hands

Build the opening you hope for from card-shaped slots. Each slot is *Any* or one or more
categories (either will do), and every card needs its own slot, so [Starter, Extender] needs
two different cards. The big number is the exact chance; with several hands it's the chance
of opening at least one of them. "+" tests a six-card hand.

## Tests

```
node --test        # Node 18+; no packages to install
```

They cover the hand-probability engine against closed-form hypergeometric values,
format legality (lists, overrides, Genesys), deck editing rules, .ydk / ydke, and the
deck registration sheet, including filling the real form and reading the values back.
GitHub runs them on every push.

## How data flows

The update workflow runs on GitHub's servers once a day. It asks YGOPRODeck for its
database version (one tiny request) and stops if nothing changed. When the version
changes, or at least once a week, it downloads the card list and both Genesys point
lists (three requests, a second apart), trims them, and commits `data/`.

Each browser checks `data/meta.json` on load and downloads `data/cards.json` only when
the version differs from its cached copy, which lives in IndexedDB. Browsers never
contact YGOPRODeck or any other third party.

## First-time setup

1. Create a repository and add these files. Keep the `.github` folder.
2. Open the **Actions** tab, choose **Update card data**, and click **Run workflow**.
   After about a minute, `data/` is committed.
3. Pick a host (next section).

To run the script on your own machine instead (Node 18 or newer):

```
node scripts/update-cards.mjs          # skips work if nothing changed
node scripts/update-cards.mjs --force  # rebuild anyway
```

## Hosting

The published site is public in every setup below. Keeping the repository private only
hides your source history.

**Public repo, GitHub Pages.** Go to *Settings, Pages*, then *Deploy from a branch*,
`main`, `/ (root)`. The daily commit redeploys the site automatically.

**Private repo, Cloudflare Pages or Netlify.** Connect the repository in their
dashboard. Leave the build command empty and set the output directory to `/`. Every
push, including the bot's daily commit, redeploys. Actions minutes come from your free
monthly quota; this job uses roughly 30 minutes a month.

**Private source, public site repo.** Uncomment the last step of the workflow and follow
its comment to add a deploy key. The public repo then only ever receives the built
site, and you enable GitHub Pages there.

## Running it

The app needs a local web server (browsers won't run it from `file://`; the page says
so if you try). Two launchers are included, and both work from wherever the folder is:

- **Windows:** double-click `Run.bat`. It runs `tools/serve.ps1`, a
  small server using the PowerShell built into Windows 10/11, so nothing needs
  installing. It serves this folder to this computer only and opens the browser.
- **macOS / Linux:** double-click (or run) `start.command`. It uses Python 3.

Both use `http://localhost:47123`. Keep that port: the browser stores decks per address,
so a different port starts empty. If the port is busy, the Windows launcher uses the
next free one and says so. Use *Format, Backup* to move decks between addresses or PCs.

For development you can also run `python3 -m http.server 47123` from the repo folder.

## Sharing it

Zip the folder (including `data/`, so the card list works offline) or use GitHub's
*Code, Download ZIP*. `READ ME FIRST.txt` explains starting it to non-technical users.

## Card images

Nothing is downloaded by default; tiles are coloured by card frame. Under
*Format, Card images*:

- **Image folder**: pick a folder of images named by passcode, such as EDOPro's `pics/`.
  Files are read locally and never uploaded. Chrome and Edge remember the folder
  between visits; Firefox and Safari ask each session.
- **Image URL path**: a template such as `pics/{id}.jpg` or `https://your-host/{id}.jpg`,
  if you host your own copy of the images.

The app does not hotlink YGOPRODeck's image server, per their API guidelines.

To fill a local folder once (YGOPRODeck's recommended "download once, store locally"):

```
node scripts/download-images.mjs /mnt/c/YgoImages/pics             # from WSL; or any path
node scripts/download-images.mjs /mnt/c/YgoImages/pics --dry-run   # count what's missing
node scripts/download-images.mjs /mnt/c/YgoImages/pics --size full
```

It skips images you already have, runs at about 4 requests per second, and can be
stopped and resumed. Keep the folder out of OneDrive, and never commit it: the images
are Konami's.
