import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchPainting, paintingArks, parseCsv, pickImage, toPainting } from "../collection.js";

const csv = `﻿ARK;"Object name/Title";Author;Collection
cl1;"Le ""Grand"" tableau";"Un ; Deux";"Département des Peintures"
cl2;L'Annonciation;;"Département des Peintures"
cl3;"Vase";X;"Département des Objets d'art"
`;

test("parseCsv handles the BOM, quoted fields, escaped quotes and delimiters inside quotes", () => {
  const records = parseCsv(csv);
  assert.equal(records.length, 3);
  assert.deepEqual(records[0], {
    ARK: "cl1",
    "Object name/Title": 'Le "Grand" tableau',
    Author: "Un ; Deux",
    Collection: "Département des Peintures",
  });
  assert.equal(records[1]["Object name/Title"], "L'Annonciation");
  assert.equal(records[1].Author, "");
});

test("paintingArks keeps only the Paintings department", () => {
  assert.deepEqual(paintingArks(parseCsv(csv)), ["cl1", "cl2"]);
});

test("the bundled Results.csv parses and includes the Mona Lisa", async () => {
  const records = parseCsv(await readFile(new URL("../Results.csv", import.meta.url), "utf8"));
  const arks = paintingArks(records);
  assert.equal(records.length, 2901);
  assert.equal(arks.length, 2881);
  assert.ok(arks.includes("cl010062370"));
  assert.ok(arks.every((ark) => /^cl\d+$/.test(ark)));
});

test("pickImage prefers a full frameless view over details", () => {
  const images = [
    { type: "face ; détail", urlImage: "detail" },
    { type: "face ; vue d'ensemble", urlImage: "framed" },
    { type: "face ; vue d'ensemble ; vue sans cadre", urlImage: "frameless" },
  ];
  assert.equal(pickImage(images).urlImage, "frameless");
  assert.equal(pickImage(images.slice(0, 2)).urlImage, "framed");
  assert.equal(pickImage(images.slice(0, 1)).urlImage, "detail");
  assert.equal(pickImage([]), undefined);
});

const record = {
  arkId: "cl010062370",
  url: "https://collections.louvre.fr/ark:/53355/cl010062370",
  title: "La Joconde",
  displayDateCreated: "Date de création/fabrication : 1e quart du XVIe siècle (1503 - 1519)",
  creator: [
    { label: "Italie", linkType: "École de" },
    { label: "Léonard de Vinci", linkType: "" },
  ],
  image: [{ type: "vue sans cadre", urlImage: "img.jpg", copyright: "© RMN" }],
};

test("toPainting extracts the details the page shows", () => {
  assert.deepEqual(toPainting(record), {
    arkId: "cl010062370",
    title: "La Joconde",
    artist: "Léonard de Vinci",
    date: "1e quart du XVIe siècle (1503 - 1519)",
    image: "img.jpg",
    copyright: "© RMN",
    url: "https://collections.louvre.fr/ark:/53355/cl010062370",
  });
});

test("toPainting unwraps a date that is only a parenthesised year", () => {
  const painting = toPainting({ ...record, displayDateCreated: "Date de création/fabrication : (1512)" });
  assert.equal(painting.date, "1512");
});

test("toPainting returns null when the object has no image", () => {
  assert.equal(toPainting({ ...record, image: [] }), null);
});

test("fetchPainting requests the ARK's JSON and fails on HTTP errors", async () => {
  const urls = [];
  const ok = async (url) => (urls.push(url), { ok: true, json: async () => record });
  assert.equal((await fetchPainting("cl010062370", ok)).title, "La Joconde");
  assert.deepEqual(urls, ["https://collections.louvre.fr/ark:/53355/cl010062370.json"]);

  const notFound = async () => ({ ok: false, status: 404 });
  await assert.rejects(fetchPainting("cl0", notFound), /404/);
});
