// Helpers for the Louvre collection export (Results.csv) and the Louvre collections API,
// kept free of browser APIs so they can be tested in Node.

export const SOURCE = "louvre";
export const MUSEUM = "Musée du Louvre, Paris";
export const PAINTINGS_DEPARTMENT = "Département des Peintures";

const arkUrl = (arkId) => `https://collections.louvre.fr/ark:/53355/${arkId}`;

/**
 * Parses semicolon-separated CSV with optional "quoted" fields ("" escapes a quote) into
 * objects keyed by the header row.
 */
export function parseCsv(text, delimiter = ";") {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) rows.push([...row, field]);

  const [header, ...records] = rows.filter((r) => r.some(Boolean));
  const keys = header.map((key, i) => (i === 0 ? key.replace(/^﻿/, "") : key));
  return records.map((r) => Object.fromEntries(keys.map((key, i) => [key, r[i] ?? ""])));
}

/** ARK IDs of the Paintings department's objects in the export. */
export function paintingArks(records) {
  return records.filter((r) => r.Collection === PAINTINGS_DEPARTMENT).map((r) => r.ARK);
}

/** Picks the best image from an API record: a full, frameless view if possible. */
export function pickImage(images = []) {
  const full = images.filter((i) => !/détail/.test(i.type));
  return full.find((i) => /sans cadre/.test(i.type)) ?? full[0] ?? images[0];
}

/** Turns a Louvre collections API record into what the page shows, or null if it has no image. */
export function toPainting(record) {
  const image = pickImage(record.image);
  if (!image) return null;
  const creator = record.creator?.find((c) => !c.linkType) ?? record.creator?.[0];
  return {
    key: `${SOURCE}:${record.arkId}`,
    museum: MUSEUM,
    title: record.title,
    artist: creator?.label ?? "",
    date: (record.displayDateCreated ?? "").replace(/^[^:]*:\s*/, "").replace(/^\((.*)\)$/, "$1"),
    image: image.urlImage,
    copyright: image.copyright,
    url: record.url ?? arkUrl(record.arkId),
  };
}

/** Fetches an object from the Louvre collections API and returns its painting, or null. */
export async function fetchPainting(arkId, fetchFn = fetch) {
  const res = await fetchFn(`${arkUrl(arkId)}.json`);
  if (!res.ok) throw new Error(`Louvre API returned ${res.status} for ${arkId}`);
  return toPainting(await res.json());
}
