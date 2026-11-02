// Helpers for the Kunsthistorisches Museum Wien, kept free of browser APIs so they can be tested in
// Node. The KHM has no public API, so paintings come from Wikidata (catalogued by volunteers) and
// their photos from Wikimedia Commons. Docs: https://www.wikidata.org/wiki/Wikidata:SPARQL_query_service
// and https://commons.wikimedia.org/w/api.php

export const SOURCE = "khm";
export const MUSEUM = "Kunsthistorisches Museum, Vienna";

const SPARQL = "https://query.wikidata.org/sparql";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const KHM = "wd:Q95569";
const PAINTING = "wd:Q3305213";
const IMAGE_WIDTH = 1920; // a standard Commons thumbnail step; others get rounded up (e.g. to 3840)
const MIN_IMAGE_SIDE = 1200; // smaller photos look soft full-screen

/** Identifies the query used for the cached ID list, so changing it refreshes the cache. */
export const LIST_ID = "wikidata:painting&collection=Q95569&image";

async function sparql(query, fetchFn) {
  const res = await fetchFn(`${SPARQL}?${new URLSearchParams({ query })}`, {
    headers: { Accept: "application/sparql-results+json" },
  });
  if (!res.ok) throw new Error(`Wikidata returned ${res.status}`);
  return (await res.json()).results.bindings;
}

/** Wikidata item IDs (e.g. "Q27978026") of the KHM's paintings that have a photo on Commons. */
export async function fetchPaintingIds(fetchFn = fetch) {
  const rows = await sparql(
    `SELECT DISTINCT ?p WHERE { ?p wdt:P31 ${PAINTING}; wdt:P195 ${KHM}; wdt:P18 [] }`,
    fetchFn,
  );
  return rows.map((row) => row.p.value.split("/").pop());
}

/** One row with the painting's English (else German) title, artists, date, photo and KHM ID. */
export function detailsQuery(id) {
  const label = (item, name) =>
    `OPTIONAL { ${item} rdfs:label ?${name}En FILTER(LANG(?${name}En) = "en") }
     OPTIONAL { ${item} rdfs:label ?${name}De FILTER(LANG(?${name}De) = "de") }`;
  return `SELECT (SAMPLE(COALESCE(?titleEn, ?titleDe)) AS ?title)
      (GROUP_CONCAT(DISTINCT ?artist; separator = ", ") AS ?artists)
      (SAMPLE(?time) AS ?date) (SAMPLE(?timePrecision) AS ?precision)
      (MIN(STR(?photo)) AS ?image) (SAMPLE(?khmId) AS ?khm)
    WHERE {
      BIND(wd:${id} AS ?p)
      ?p wdt:P18 ?photo .
      ${label("?p", "title")}
      OPTIONAL { ?p wdt:P170 ?creator . ${label("?creator", "creator")}
        BIND(COALESCE(?creatorEn, ?creatorDe) AS ?artist) }
      OPTIONAL { ?p p:P571/psv:P571 [ wikibase:timeValue ?time; wikibase:timePrecision ?timePrecision ] }
      OPTIONAL { ?p wdt:P8960 ?khmId }
    }`;
}

const ordinal = (n) => {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th";
  return `${n}${suffix}`;
};

/** Formats a Wikidata date at its stated precision: 9 = year, 8 = decade, 7 = century. */
export function formatDate(time, precision) {
  const year = parseInt(time ?? "", 10);
  if (Number.isNaN(year)) return "";
  if (precision >= 9) return String(year);
  if (precision === 8) return `${year - (year % 10)}s`;
  if (precision === 7) return `${ordinal(Math.floor((year - 1) / 100) + 1)} century`;
  return "";
}

/** Whether a Commons file is public domain (or CC0) and large enough to show full-screen. */
export function isUsable(imageinfo) {
  const licence = imageinfo?.extmetadata?.LicenseShortName?.value ?? "";
  const publicDomain = /^(public domain|pd\b|pd-|cc0)/i.test(licence.trim());
  return publicDomain && Math.max(imageinfo.width, imageinfo.height) >= MIN_IMAGE_SIDE;
}

/** Combines the Wikidata row and the Commons image info into what the page shows. */
export function toPainting(id, row, imageinfo) {
  const value = (name) => row[name]?.value ?? "";
  const khmId = value("khm");
  return {
    key: `${SOURCE}:${id}`,
    museum: MUSEUM,
    title: value("title"),
    artist: value("artists"),
    date: formatDate(value("date"), Number(value("precision"))),
    image: imageinfo.thumburl ?? imageinfo.url,
    copyright: "Photo: Wikimedia Commons, public domain · Data: Wikidata",
    // The KHM's German object pages; the English ones (/en/object/…) open the wrong artwork.
    url: khmId ? `https://www.khm.at/de/object/${khmId}/` : `https://www.wikidata.org/wiki/${id}`,
  };
}

/** Commons file name from a Wikidata image value ("…/Special:FilePath/<name>"). */
const fileName = (image) => decodeURIComponent(image.split("Special:FilePath/").pop());

/** Fetches a painting's details and photo info, or null if the photo isn't usable. */
export async function fetchPainting(id, fetchFn = fetch) {
  const [row] = await sparql(detailsQuery(id), fetchFn);
  if (!row?.image) return null;

  const params = new URLSearchParams({
    action: "query",
    format: "json",
    origin: "*",
    prop: "imageinfo",
    iiprop: "url|size|extmetadata",
    iiextmetadatafilter: "LicenseShortName",
    iiurlwidth: IMAGE_WIDTH,
    titles: `File:${fileName(row.image.value)}`,
  });
  const res = await fetchFn(`${COMMONS_API}?${params}`, {
    headers: { "Api-User-Agent": "painting-tab (Chrome extension showing museum paintings)" },
  });
  if (!res.ok) throw new Error(`Wikimedia Commons returned ${res.status}`);
  const page = Object.values((await res.json()).query?.pages ?? {})[0];
  const imageinfo = page?.imageinfo?.[0];
  return isUsable(imageinfo) ? toPainting(id, row, imageinfo) : null;
}
