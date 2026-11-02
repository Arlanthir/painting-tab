# Painting Tab — A random painting in every new tab

A Chrome extension that replaces the new tab page with a random painting from the
[Musée du Louvre](https://collections.louvre.fr/) or
[The Metropolitan Museum of Art](https://www.metmuseum.org/art/collection), with its museum,
title, artist and date.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a new tab.

## How it works

Paintings come from two lists, and each new tab picks uniformly across both:

- **Louvre:** `Results.csv` is an export of the Louvre collections search, filtered to paintings on
  display at the Louvre. Only rows from the Département des Peintures are used (2,881 paintings).
- **The Met:** objects of type "Paintings" on view with open-access images, across all departments
  (about 1,700), fetched from [The Met Collection API](https://metmuseum.github.io/) and cached for
  a week. The open-access filter (`openAccess=true`) is undocumented but matches the "Has open
  access image" filter on the Met's website.

Each new tab skips the last 50 paintings shown and fetches the chosen painting's details and image
from its museum's API (the Louvre's `<ark url>.json` or the Met's `/objects/<id>`). Paintings without
a downloadable image, such as works still under copyright at the Met, are skipped. The next
painting is fetched and its image preloaded in advance, so it appears instantly, both in the next
new tab and when pressing ↻.

Hover the caption in the bottom-left corner to see details. The buttons in the bottom-right corner
go back to the previous painting (←, shown only when there is one) or show another one (↻). After
going back, ↻ turns into → and moves forward again until you reach the newest painting.

Keyboard shortcuts:

- **Space** or **→**: show another painting (or move forward again after going back).
- **←**: go back to the previous painting shown in this tab. Each tab keeps its own history, which
  starts empty.

Chrome puts the keyboard focus in the address bar when a new tab opens, so click anywhere on the
painting first for the shortcuts to work.

## Development

```sh
npm test   # unit tests
```

To refresh the Louvre list, export new results from the Louvre collections search and replace
`Results.csv`. Keep it a Louvre-only export; the Met list is fetched separately.

Louvre images © GrandPalaisRmn (musée du Louvre); Met images are public domain (CC0). Credits are
shown with each painting.
