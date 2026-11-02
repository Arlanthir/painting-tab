# Painting Tab

Chrome extension (Manifest V3, plain ES modules, no build step) that replaces the new tab page with
a random painting from the Musée du Louvre or The Met. See README.md for the user-facing overview.

## Files

- `newtab.html` / `newtab.css` / `newtab.js`: the new tab page. `newtab.js` is the only file that
  touches browser APIs (`chrome.storage.local`, `Image`, DOM).
- `louvre.js`: CSV parsing of `Results.csv` and the Louvre collections API.
- `met.js`: The Met Collection API (ID list search + object lookup).
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
- Met IDs are cached in storage (`metIds`, `metFetchedAt`, `metListId`) for a week. `met.LIST_ID`
  describes the search; change it whenever the Met filters change so caches refresh immediately.
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
- Neither API exposes anything usable to detect nudity (checked; only free-text descriptions).

## Development

- `npm test` runs the unit tests (`node --test`). Run them after every change.
- Verify UI changes in a real browser: Playwright's Chromium (installed under
  `~/Library/Caches/ms-playwright`) can load the unpacked extension headlessly with
  `chromium.launchPersistentContext("", { channel: "chromium", args: ["--disable-extensions-except=<repo>", "--load-extension=<repo>"] })`,
  then open `chrome://newtab` and wait for `body.loaded`. Keep such scripts in the scratchpad, not
  the repo. The user reloads the extension from `chrome://extensions` to see changes.
- Be polite to both APIs (small delays when sampling many objects).

## Preferences

- The details box stays in the bottom-left, faded (opacity 0.35) until hovered, with ↻ to the right
  of the text. A bottom-right layout with ↻ on the left was tried and reverted.
- Keep the README up to date when behaviour or data sources change.
- Keep this file up to date too: update it when the architecture, data sources, API behaviour or
  the user's preferences change, or when something non-obvious is discovered. Correct or remove
  anything that is no longer true (counts, endpoints, filters). Leave out short-lived details such
  as work in progress, commit status or one-off debugging.
