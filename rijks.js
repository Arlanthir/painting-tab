// Helpers for the Rijksmuseum data services (Linked Art), kept free of browser APIs so they can
// be tested in Node. Docs: https://data.rijksmuseum.nl/docs/

export const SOURCE = "rijks";
export const MUSEUM = "Rijksmuseum, Amsterdam";

const SEARCH = "https://data.rijksmuseum.nl/search/collection";
const ID_PREFIX = "https://id.rijksmuseum.nl/";
const PUBLIC_DOMAIN_SET = `${ID_PREFIX}260239`; // "Entire Public Domain Set"
const IMAGE_SIZE = "!2400,2400"; // IIIF: fit within 2400×2400, instead of the multi-MB original

// Getty AAT terms used by the Rijksmuseum's Linked Art records.
const ENGLISH = "http://vocab.getty.edu/aat/300388277";
const PREFERRED_TITLE = "http://vocab.getty.edu/aat/300404670";
const OBJECT_NUMBER = "http://vocab.getty.edu/aat/300312355";
const CREDIT_LINE = "http://vocab.getty.edu/aat/300026687";
const CREATOR_STATEMENT = "http://vocab.getty.edu/aat/300435417";

/** Identifies the search used for the cached ID list, so changing the filters refreshes it. */
export const LIST_ID = "type=painting&imageAvailable&publicDomain";

/** IDs of the public-domain paintings with images, following the search's page tokens. */
export async function fetchPaintingIds(fetchFn = fetch) {
  const params = new URLSearchParams({
    type: "painting",
    imageAvailable: true,
    memberOfSetId: PUBLIC_DOMAIN_SET,
  });
  const ids = [];
  for (let url = `${SEARCH}?${params}`; url; ) {
    const res = await fetchFn(url);
    if (!res.ok) throw new Error(`Rijksmuseum API returned ${res.status}`);
    const page = await res.json();
    for (const item of page.orderedItems ?? []) ids.push(item.id.replace(ID_PREFIX, ""));
    url = page.orderedItems?.length ? page.next?.id : undefined;
  }
  return ids;
}

const isEnglish = (node) => node.language?.some((l) => l.id === ENGLISH);
const hasType = (node, type) => node.classified_as?.some((c) => c.id === type);
const english = (nodes = []) => nodes.find(isEnglish) ?? nodes[0];
// Linked Art allows a single value where a list is expected (seen with `notation`).
const list = (value) => [value ?? []].flat();

/** Drops notes about the evidence, e.g. "Jan van Goyen (signed by artist)" → "Jan van Goyen". */
const withoutEvidence = (artist) =>
  artist.replace(/\s*\((signed|dated|inscribed|mentioned|monogrammed)\b[^)]*\)/gi, "");

/**
 * The attribution as the museum words it, e.g. "workshop of Joos van Cleve" or "attributed to
 * Augustin Hirschvogel", falling back to the names of the people linked to the production.
 */
function artistOf(production = {}) {
  const statement = english(list(production.referred_to_by))?.content;
  if (statement) return withoutEvidence(statement);
  const parts = list(production.part);
  const statements = parts
    .map((p) => english(list(p.referred_to_by).filter((r) => hasType(r, CREATOR_STATEMENT)))?.content)
    .filter(Boolean);
  const names = parts
    .flatMap((p) => list(p.carried_out_by))
    .map((a) => {
      const notation = list(a.notation);
      return (notation.find((n) => n["@language"] === "en") ?? notation[0])?.["@value"];
    })
    .filter(Boolean);
  return withoutEvidence([...new Set(statements.length ? statements : names)].join(", "));
}

/** Turns a Linked Art object into what the page shows, or null if it has no public-domain image. */
export function toPainting(record) {
  const access = (record.subject_of ?? [])
    .flatMap((s) => s.digitally_carried_by ?? [])
    .find((d) => d.referred_to_by?.some((r) => /publicdomain/.test(r.content ?? "")));
  const image = access?.access_point?.[0]?.id;
  if (!image) return null;

  const names = (record.identified_by ?? []).filter((i) => i.type === "Name");
  const title = english(names.filter((n) => hasType(n, PREFERRED_TITLE))) ?? english(names);
  const objectNumber = record.identified_by?.find(
    (i) => i.type === "Identifier" && hasType(i, OBJECT_NUMBER),
  )?.content;

  const production = record.produced_by ?? {};
  const date = english(production.timespan?.identified_by)?.content ?? "";
  const credit = english((record.referred_to_by ?? []).filter((r) => hasType(r, CREDIT_LINE)));
  const id = record.id.replace(ID_PREFIX, "");

  return {
    key: `${SOURCE}:${id}`,
    museum: MUSEUM,
    title: title?.content ?? "",
    artist: artistOf(production),
    date,
    image: image.replace("/full/max/", `/full/${IMAGE_SIZE}/`),
    copyright: credit?.content ?? "",
    url: objectNumber
      ? `https://www.rijksmuseum.nl/en/collection/${encodeURIComponent(objectNumber)}`
      : record.id,
  };
}

/** Fetches an object's Linked Art record and returns its painting, or null. */
export async function fetchPainting(id, fetchFn = fetch) {
  const res = await fetchFn(`${ID_PREFIX}${id}`, { headers: { Accept: "application/ld+json" } });
  if (!res.ok) throw new Error(`Rijksmuseum API returned ${res.status} for ${id}`);
  return toPainting(await res.json());
}
