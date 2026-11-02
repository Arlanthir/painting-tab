// Helpers for The Met Collection API, kept free of browser APIs so they can be tested in Node.

export const SOURCE = "met";
export const MUSEUM = "The Metropolitan Museum of Art, New York";

const API = "https://collectionapi.metmuseum.org/public/collection";
const OBJECT_TYPE = "Paintings"; // "Object Type / Material" on the Met's site; must be plural
const PAGE_SIZE = 500; // the search endpoint's maximum

/** Identifies the search used for the cached ID list, so changing the filters refreshes it. */
export const LIST_ID = `medium=${OBJECT_TYPE}&hasImages&isOnView&openAccess`;

/** Object IDs of the paintings on view at The Met with open-access images, across all departments. */
export async function fetchPaintingIds(fetchFn = fetch) {
  const ids = [];
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const params = new URLSearchParams({
      medium: OBJECT_TYPE,
      hasImages: true,
      isOnView: true,
      // Undocumented, but matches the site's "Has open access image" filter. If it is ever
      // dropped, works without a downloadable image are still skipped when picked.
      openAccess: true,
      q: "*",
      limit: PAGE_SIZE,
      offset,
    });
    const res = await fetchFn(`${API}/v1.1/search?${params}`);
    if (!res.ok) throw new Error(`Met API returned ${res.status}`);
    const { total, objectIDs } = await res.json();
    ids.push(...(objectIDs ?? []));
    if (!objectIDs?.length || ids.length >= total) return ids;
  }
}

/** Turns a Met Collection API object into what the page shows, or null if it has no image. */
export function toPainting(record) {
  // Only public-domain works come with a downloadable image.
  if (!record.primaryImage) return null;
  return {
    key: `${SOURCE}:${record.objectID}`,
    museum: MUSEUM,
    title: record.title,
    artist: record.artistDisplayName ?? "",
    date: record.objectDate ?? "",
    image: record.primaryImage,
    copyright: record.creditLine ?? "",
    url: record.objectURL,
  };
}

/** Fetches an object from the Met Collection API and returns its painting, or null. */
export async function fetchPainting(objectId, fetchFn = fetch) {
  const res = await fetchFn(`${API}/v1/objects/${objectId}`);
  if (!res.ok) throw new Error(`Met API returned ${res.status} for ${objectId}`);
  return toPainting(await res.json());
}
