# Painting Tab

Chrome extension (Manifest V3, plain ES modules, no build step) that replaces the new tab page with
a random painting from the Musée du Louvre, The Met or the Rijksmuseum. See README.md for the
user-facing overview.

## Files

- `newtab.html` / `newtab.css` / `newtab.js`: the new tab page. `newtab.js` is the only file that
  touches browser APIs (`chrome.storage.local`, `Image`, DOM).
- `louvre.js`: CSV parsing of `Results.csv` and the Louvre collections API.
- `met.js`: The Met Collection API (ID list search + object lookup).
- `rijks.js`: Rijksmuseum data services (Linked Art search + object lookup).
- `picker.js`: random choice, recent-history and `"<source>:<id>"` key helpers.
- `Results.csv`: Louvre export. **Never edit it**; the user drops in fresh Louvre exports. Keep it
  Louvre-only; other museums' lists are fetched separately.
- `icon.svg` (tab favicon) and `icons/icon-{16,32,48,128}.png` (extension icon, rendered from the
  SVG; Chrome requires PNG in the manifest). Hand-drawn, no licence concerns.
- `test/*.test.js`: unit tests for the pure modules.

## How it works

- Paintings are identified by keys like `louvre:cl010062370` or `met:436535`. Each source module
  exports `SOURCE`, `MUSEUM` and `fetchPainting(id)` returning
  `{ key, museum, title, artist, date, image, copyright, url }`, or `null` when there is no
  usable image. `newtab.js` maps the key prefix to the module via `SOURCES`.
- The pick is uniform over all keys from both museums, skipping the last 50 shown (`recent`).
- One prepared painting (`next` in `chrome.storage.local`) is shared by new tabs and the ↻ button
  in every tab; whoever uses it prepares a replacement and preloads its image. ↻ re-reads storage
  and waits for an in-flight preparation instead of fetching from scratch.
- Keyboard: Space/→ = ↻, ← = previous painting. Each tab keeps an in-memory `history` with a
  `position`; after going back, Space/→ step forward through history before showing new paintings.
  History is not persisted, so new tabs start empty. Navigations are serialised (`navigate`), held
  keys (`event.repeat`) and modifier combos are ignored. The ← and ↻ buttons (`#previous`,
  `#shuffle` in `#controls`) don't take focus on mouse click, so Space keeps meaning "another
  painting" after clicking ←; Space on a button focused with Tab is left to its native click.
- Every painting change goes through `display()`: the painting, backdrop and caption text fade out
  (`--fade-out`, 250 ms) while the next image loads, the content swaps while invisible, then fades
  in (`--fade-in`, 600 ms). `newtab.js` reads `--fade-out` from the CSS, so change it only there.
  A crossfade (new painting fading in on top of the old one) was tried and rolled back.
- Chrome focuses the address bar when a new tab opens, so keys only reach the page after the user
  clicks it. Extensions can't take focus from the omnibox on a new tab override; headless
  Playwright tests don't show this because they send keys to the page directly.
- Museums with API-fetched lists (`FETCHED_SOURCES`: Met, Rijksmuseum) also export `LIST_ID` and
  `fetchPaintingIds()`. Lists are cached in storage as `lists[source] = { ids, fetchedAt, listId }`
  for a week, refreshed in the background (not awaited) after the first painting is shown.
  `LIST_ID` describes the search; change it whenever a museum's filters change so caches refresh
  immediately. Adding a museum: new module + `SOURCES`, `FETCHED_SOURCES` if API-listed, manifest
  `host_permissions`, tests, README.
- Storage written by older versions must keep working (e.g. `next` without `key` is ignored).

## Data sources: hard-won facts

- **Louvre**: per-object JSON at `https://collections.louvre.fr/ark:/53355/<ark>.json`, no API key.
  The search page (`/en/recherche`) is behind a "WADP – I am not a robot" bot check (HTTP 429).
  Do not try to bypass it; the user exports `Results.csv` from it manually. robots.txt disallows
  `/search/export` and blocks AI crawlers from images. Image URLs embed the object number.
- `Results.csv`: UTF-8 with BOM, `;`-separated, quoted fields with `""` escapes. Only rows with
  `Collection == "Département des Peintures"` are used (2,881 of 2,901 at last check).
- The Louvre API lists former attributions in `creator`; the artist shown is the first creator
  without a `linkType`. Preferring `attributionLevel == "Attribution actuelle"` would be more robust.
- **The Met**: `/public/collection/v1/search` was retired on 2026-10-01; use `v1.1/search`
  (paginated, max `limit` 500, `offset + limit` ≤ 10,000). Current filters:
  `medium=Paintings` (must be plural; "Painting" returns 0), `hasImages`, `isOnView`, and the
  undocumented `openAccess=true` (matches the site's "Has open access image" filter; verified by
  sampling). About 1,678 IDs. Docs: https://metmuseum.github.io/
- Met images: only `primaryImage` (full resolution, up to ~8 MB) is sharp enough for full screen;
  `primaryImageSmall` is ~600 px. Non-public-domain works have an empty `primaryImage`.
- **Rijksmuseum**: the old keyed API (`www.rijksmuseum.nl/api/...`) returns 410. Use the keyless
  Linked Art services: search at `https://data.rijksmuseum.nl/search/collection` (100 per page,
  follow `next.id` page tokens; ~49 pages, ~6 s) with `type=painting&imageAvailable=true&
  memberOfSetId=https://id.rijksmuseum.nl/260239` ("Entire Public Domain Set"): about 4,884 IDs.
  There is no "on display" filter or set. Objects: `https://id.rijksmuseum.nl/<id>` with
  `Accept: application/ld+json` (no redirect, CORS `*`). Docs: https://data.rijksmuseum.nl/docs/
- Rijksmuseum records: image is the IIIF `access_point` under `subject_of[].digitally_carried_by`
  whose licence mentions `publicdomain`; the IIIF server resizes (`/full/!2400,2400/`), so don't
  load `/full/max/` (several MB). Titles/dates/credit come in Dutch and English (pick by Getty AAT
  language). Artist: prefer the production's worded attribution ("workshop of …", "attributed to
  …"); workshop/attributed works have no `carried_out_by`. `notation` can be a single object
  instead of a list. Some titles exist only in Dutch; a few records are the backs of paintings.
  Page link: `https://www.rijksmuseum.nl/en/collection/<object number>`.
- Neither the Louvre nor the Met exposes anything usable to detect nudity (checked; only free-text
  descriptions). The Louvre has no "highlight" flag; bibliography and image counts correlate with
  fame.

## Development

- `npm test` runs the unit tests (`node --test`). Run them after every change.
- Verify UI changes in a real browser: Playwright's Chromium (installed under
  `~/Library/Caches/ms-playwright`) can load the unpacked extension headlessly with
  `chromium.launchPersistentContext("", { channel: "chromium", args: ["--disable-extensions-except=<repo>", "--load-extension=<repo>"] })`,
  then open `chrome://newtab` and wait for `body.loaded`. Keep such scripts in the scratchpad, not
  the repo. The user reloads the extension from `chrome://extensions` to see changes.
- Be polite to both APIs (small delays when sampling many objects).

## Preferences

- The details card stays in the bottom-left, faded (opacity 0.35) until hovered, sizes to its text,
  and contains only the painting's details.
- The ← (previous) and ↻ buttons sit in the bottom-right corner of the screen, outside the card:
  subtle, no background behind them, always faded (0.45). Hovering only highlights the button
  under the pointer, not the whole area; Tab focus does brighten the area. They're anchored to the screen so they
  never move and can be clicked repeatedly without moving the mouse. When there is no earlier
  painting in the tab, ← fades out and disappears (not just dimmed); it fades back in when needed.
  When not on the newest painting, ↻ crossfades to → (both glyphs are stacked in `#shuffle`, the
  `.forward` class picks one). Before this, ↻ lived inside the card (to the right, in a column on
  the left, then on its own row); all were replaced by this layout. A bottom-right layout with ↻ on the left was tried and reverted.
- Keep the README up to date when behaviour or data sources change.
- Keep this file up to date too: update it when the architecture, data sources, API behaviour or
  the user's preferences change, or when something non-obvious is discovered. Correct or remove
  anything that is no longer true (counts, endpoints, filters). Leave out short-lived details such
  as work in progress, commit status or one-off debugging.
