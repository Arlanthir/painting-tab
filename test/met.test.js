import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPainting, fetchPaintingIds, toPainting } from "../met.js";

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

test("fetchPaintingIds pages through the search results", async () => {
  const pages = { 0: [1, 2], 500: [3] };
  const urls = [];
  const fetchFn = async (url) => {
    urls.push(url);
    const offset = new URL(url).searchParams.get("offset");
    return json({ total: 3, objectIDs: pages[offset] });
  };

  assert.deepEqual(await fetchPaintingIds(fetchFn), [1, 2, 3]);
  assert.equal(urls.length, 2);
  const params = new URL(urls[0]).searchParams;
  assert.equal(new URL(urls[0]).pathname, "/public/collection/v1.1/search");
  assert.equal(params.get("medium"), "Paintings");
  assert.equal(params.has("departmentId"), false);
  assert.equal(params.get("hasImages"), "true");
  assert.equal(params.get("isOnView"), "true");
  assert.equal(params.get("openAccess"), "true");
});

test("fetchPaintingIds stops on an empty page and fails on HTTP errors", async () => {
  assert.deepEqual(await fetchPaintingIds(async () => json({ total: 10, objectIDs: null })), []);
  await assert.rejects(fetchPaintingIds(async () => json({}, 503)), /503/);
});

const record = {
  objectID: 436535,
  title: "Wheat Field with Cypresses",
  artistDisplayName: "Vincent van Gogh",
  objectDate: "1889",
  primaryImage: "https://images.metmuseum.org/CRDImages/ep/original/DP-42549-001.jpg",
  creditLine: "Purchase, The Annenberg Foundation Gift, 1993",
  objectURL: "https://www.metmuseum.org/art/collection/search/436535",
};

test("toPainting extracts the details the page shows", () => {
  assert.deepEqual(toPainting(record), {
    key: "met:436535",
    museum: "The Metropolitan Museum of Art, New York",
    title: "Wheat Field with Cypresses",
    artist: "Vincent van Gogh",
    date: "1889",
    image: "https://images.metmuseum.org/CRDImages/ep/original/DP-42549-001.jpg",
    copyright: "Purchase, The Annenberg Foundation Gift, 1993",
    url: "https://www.metmuseum.org/art/collection/search/436535",
  });
});

test("toPainting returns null for works without a downloadable image", () => {
  assert.equal(toPainting({ ...record, primaryImage: "" }), null);
});

test("fetchPainting requests the object and fails on HTTP errors", async () => {
  const urls = [];
  const ok = async (url) => (urls.push(url), json(record));
  assert.equal((await fetchPainting("436535", ok)).title, "Wheat Field with Cypresses");
  assert.deepEqual(urls, ["https://collectionapi.metmuseum.org/public/collection/v1/objects/436535"]);
  await assert.rejects(fetchPainting("1", async () => json({}, 404)), /404/);
});
