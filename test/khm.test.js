import { test } from "node:test";
import assert from "node:assert/strict";
import { detailsQuery, fetchPainting, fetchPaintingIds, formatDate, isUsable, toPainting } from "../khm.js";

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const literal = (value) => ({ value });

test("fetchPaintingIds asks Wikidata for KHM paintings with a photo and returns item IDs", async () => {
  const calls = [];
  const fetchFn = async (url, options) => {
    calls.push([url, options]);
    return json({ results: { bindings: [{ p: literal("http://www.wikidata.org/entity/Q1") }, { p: literal("http://www.wikidata.org/entity/Q2") }] } });
  };
  assert.deepEqual(await fetchPaintingIds(fetchFn), ["Q1", "Q2"]);
  const query = new URL(calls[0][0]).searchParams.get("query");
  assert.match(query, /wdt:P195 wd:Q95569/);
  assert.match(query, /wdt:P31 wd:Q3305213/);
  assert.match(query, /wdt:P18/);
  assert.equal(calls[0][1].headers.Accept, "application/sparql-results+json");
  await assert.rejects(fetchPaintingIds(async () => json({}, 403)), /403/);
});

test("detailsQuery targets the given item", () => {
  assert.match(detailsQuery("Q27978026"), /BIND\(wd:Q27978026 AS \?p\)/);
});

test("formatDate follows Wikidata's precision", () => {
  assert.equal(formatDate("1630-01-01T00:00:00Z", 11), "1630");
  assert.equal(formatDate("1630-01-01T00:00:00Z", 9), "1630");
  assert.equal(formatDate("1634-01-01T00:00:00Z", 8), "1630s");
  assert.equal(formatDate("1550-01-01T00:00:00Z", 7), "16th century");
  assert.equal(formatDate("1601-01-01T00:00:00Z", 7), "17th century");
  assert.equal(formatDate("1201-01-01T00:00:00Z", 7), "13th century");
  assert.equal(formatDate("1100-01-01T00:00:00Z", 7), "11th century");
  assert.equal(formatDate("", 9), "");
  assert.equal(formatDate("1600-01-01T00:00:00Z", 6), "");
});

const info = (licence, width = 4000, height = 3000) => ({
  width,
  height,
  thumburl: "https://thumb.wikimedia.org/x/1920px-x.jpg",
  url: "https://upload.wikimedia.org/x.jpg",
  extmetadata: { LicenseShortName: { value: licence } },
});

test("isUsable keeps public-domain photos that are large enough", () => {
  assert.equal(isUsable(info("Public domain")), true);
  assert.equal(isUsable(info("PD-Art")), true);
  assert.equal(isUsable(info("CC0")), true);
  assert.equal(isUsable(info("CC BY-SA 3.0")), false);
  assert.equal(isUsable(info("Public domain", 1100, 800)), false);
  assert.equal(isUsable(info("Public domain", 900, 1300)), true); // portrait: the longer side counts
  assert.equal(isUsable(undefined), false);
});

const row = {
  title: literal("Penitent St. Peter"),
  artists: literal("Jusepe de Ribera"),
  date: literal("1630-01-01T00:00:00Z"),
  precision: literal("9"),
  image: literal("http://commons.wikimedia.org/wiki/Special:FilePath/Jusepe%20Ribera%20-%20Penitent.jpg"),
  khm: literal("12ffb0968f"),
};

test("toPainting links to the KHM's German object page, or Wikidata without a KHM ID", () => {
  assert.deepEqual(toPainting("Q1", row, info("Public domain")), {
    key: "khm:Q1",
    museum: "Kunsthistorisches Museum, Vienna",
    title: "Penitent St. Peter",
    artist: "Jusepe de Ribera",
    date: "1630",
    image: "https://thumb.wikimedia.org/x/1920px-x.jpg",
    copyright: "Photo: Wikimedia Commons, public domain · Data: Wikidata",
    url: "https://www.khm.at/de/object/12ffb0968f/",
  });
  const { khm, ...withoutKhm } = row;
  assert.equal(toPainting("Q1", withoutKhm, info("Public domain")).url, "https://www.wikidata.org/wiki/Q1");
});

test("fetchPainting asks Commons about the photo and skips unusable ones", async () => {
  const commons = (licence) => json({ query: { pages: { 1: { imageinfo: [info(licence)] } } } });
  const urls = [];
  const fetchFor = (licence) => async (url) => {
    urls.push(url);
    return url.startsWith("https://query.wikidata.org") ? json({ results: { bindings: [row] } }) : commons(licence);
  };

  assert.equal((await fetchPainting("Q1", fetchFor("Public domain"))).title, "Penitent St. Peter");
  const params = new URL(urls[1]).searchParams;
  assert.equal(params.get("titles"), "File:Jusepe Ribera - Penitent.jpg");
  assert.equal(params.get("iiurlwidth"), "1920");
  assert.equal(await fetchPainting("Q1", fetchFor("CC BY-SA 3.0")), null);

  const rateLimited = async (url) =>
    url.startsWith("https://query.wikidata.org") ? json({ results: { bindings: [row] } }) : json({}, 429);
  await assert.rejects(fetchPainting("Q1", rateLimited), /429/);
});
