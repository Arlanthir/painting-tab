# Painting Tab — A random painting in every new tab

A Chrome extension that replaces the new tab page with a random painting from the
[Louvre's collections](https://collections.louvre.fr/), with its title, artist and date.

## Install

1. Open `chrome://extensions` and enable **Developer mode**.
2. Click **Load unpacked** and select this folder.
3. Open a new tab.

## How it works

- `Results.csv` is an export of the Louvre collections search filtered to paintings on display at
  the Louvre. Only rows from the Département des Peintures are used (2,881 paintings).
- Each new tab picks one at random, skipping the last 50 shown, and fetches its title, artist,
  date and image from the Louvre's public per-object API (`<ark url>.json`).
- The next tab's painting is fetched and its image preloaded in advance, so it appears instantly.
- Hover the caption in the bottom-left corner to see details; ↻ shows another painting.

## Development

```sh
npm test   # unit tests
```

To refresh the list, export new results from the Louvre collections search and replace
`Results.csv`.

Images © GrandPalaisRmn (musée du Louvre); credits are shown with each painting.
