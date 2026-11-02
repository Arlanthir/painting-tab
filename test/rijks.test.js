import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchPainting, fetchPaintingIds, toPainting } from "../rijks.js";

const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });

const AAT = "http://vocab.getty.edu/aat/";
const EN = [{ id: `${AAT}300388277` }];
const NL = [{ id: `${AAT}300388256` }];
const type = (id) => [{ id: `${AAT}${id}` }];

test("fetchPaintingIds follows the page tokens until the last page", async () => {
  const urls = [];
  const pages = [
    { orderedItems: [{ id: "https://id.rijksmuseum.nl/1" }, { id: "https://id.rijksmuseum.nl/2" }], next: { id: "page-2" } },
    { orderedItems: [{ id: "https://id.rijksmuseum.nl/3" }] },
  ];
  const fetchFn = async (url) => (urls.push(url), json(pages[urls.length - 1]));

  assert.deepEqual(await fetchPaintingIds(fetchFn), ["1", "2", "3"]);
  assert.equal(urls[1], "page-2");
  const params = new URL(urls[0]).searchParams;
  assert.equal(params.get("type"), "painting");
  assert.equal(params.get("imageAvailable"), "true");
  assert.equal(params.get("memberOfSetId"), "https://id.rijksmuseum.nl/260239");
});

test("fetchPaintingIds stops on an empty page and fails on HTTP errors", async () => {
  assert.deepEqual(await fetchPaintingIds(async () => json({ orderedItems: [], next: { id: "x" } })), []);
  await assert.rejects(fetchPaintingIds(async () => json({}, 503)), /503/);
});

const image = {
  digitally_carried_by: [
    {
      access_point: [{ id: "https://iiif.micr.io/mPymb/full/max/0/default.jpg" }],
      referred_to_by: [{ content: "https://creativecommons.org/publicdomain/mark/1.0/" }],
    },
  ],
};

const record = {
  id: "https://id.rijksmuseum.nl/200100988",
  identified_by: [
    { type: "Identifier", classified_as: type("300312355"), content: "SK-C-1726" },
    { type: "Name", classified_as: type("300404670"), language: NL, content: "Mistige zee" },
    { type: "Name", classified_as: type("300404670"), language: EN, content: "Misty Sea" },
    { type: "Name", classified_as: type("300417200"), language: EN, content: "Other title" },
  ],
  produced_by: {
    referred_to_by: [
      { language: NL, content: "Jan Toorop (gesigneerd door kunstenaar)" },
      { language: EN, content: "Jan Toorop (signed by artist)" },
    ],
    timespan: { identified_by: [{ language: NL, content: "1899" }, { language: EN, content: "1899" }] },
  },
  referred_to_by: [
    { classified_as: type("300026687"), language: NL, content: "Bruikleen van de Triton Collection Foundation" },
    { classified_as: type("300026687"), language: EN, content: "On loan from the Triton Collection Foundation" },
    { classified_as: type("300435429"), language: EN, content: "oil on canvas" },
  ],
  subject_of: [image],
};

test("toPainting extracts the details the page shows", () => {
  assert.deepEqual(toPainting(record), {
    key: "rijks:200100988",
    museum: "Rijksmuseum, Amsterdam",
    title: "Misty Sea",
    artist: "Jan Toorop",
    date: "1899",
    image: "https://iiif.micr.io/mPymb/full/!2400,2400/0/default.jpg",
    copyright: "On loan from the Triton Collection Foundation",
    url: "https://www.rijksmuseum.nl/en/collection/SK-C-1726",
  });
});

test("toPainting keeps attributions but drops notes about the evidence", () => {
  const attributed = (content) =>
    toPainting({ ...record, produced_by: { referred_to_by: [{ language: EN, content }] } }).artist;
  assert.equal(attributed("workshop of Joos van Cleve"), "workshop of Joos van Cleve");
  assert.equal(attributed("Pieter Pietersz. (I)"), "Pieter Pietersz. (I)");
  assert.equal(attributed("Willem de Zwart (mentioned on object)"), "Willem de Zwart");
});

test("toPainting falls back to the people linked to the production, with single-value notations", () => {
  const production = {
    part: [
      { carried_out_by: [{ notation: { "@language": "nl", "@value": "Hui Nian" } }] },
      { carried_out_by: [{ notation: [{ "@language": "nl", "@value": "X" }, { "@language": "en", "@value": "Jan Steen" }] }] },
    ],
  };
  assert.equal(toPainting({ ...record, produced_by: production }).artist, "Hui Nian, Jan Steen");
});

test("toPainting returns null without a public-domain image", () => {
  assert.equal(toPainting({ ...record, subject_of: [] }), null);
  const restricted = structuredClone(image);
  restricted.digitally_carried_by[0].referred_to_by = [{ content: "https://rightsstatements.org/vocab/InC/1.0/" }];
  assert.equal(toPainting({ ...record, subject_of: [restricted] }), null);
});

test("fetchPainting asks for Linked Art JSON and fails on HTTP errors", async () => {
  const calls = [];
  const ok = async (url, options) => (calls.push([url, options]), json(record));
  assert.equal((await fetchPainting("200100988", ok)).title, "Misty Sea");
  assert.equal(calls[0][0], "https://id.rijksmuseum.nl/200100988");
  assert.equal(calls[0][1].headers.Accept, "application/ld+json");
  await assert.rejects(fetchPainting("1", async () => json({}, 404)), /404/);
});
