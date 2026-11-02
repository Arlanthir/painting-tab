import { test } from "node:test";
import assert from "node:assert/strict";
import { parseKey, pickRandom, remember, toKeys } from "../picker.js";

const keys = ["louvre:a", "met:1", "met:2"];

test("toKeys and parseKey round-trip a source and ID", () => {
  assert.deepEqual(toKeys("met", [1, 2]), ["met:1", "met:2"]);
  assert.deepEqual(parseKey("louvre:cl010062370"), { source: "louvre", id: "cl010062370" });
});

test("pickRandom draws uniformly from all sources", () => {
  assert.equal(pickRandom(keys, [], () => 0), "louvre:a");
  assert.equal(pickRandom(keys, [], () => 0.5), "met:1");
  assert.equal(pickRandom(keys, [], () => 0.99), "met:2");
});

test("pickRandom avoids recently shown paintings", () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(pickRandom(keys, ["louvre:a", "met:1"]), "met:2");
  }
});

test("pickRandom falls back to all paintings when every one is recent", () => {
  assert.equal(pickRandom(keys, keys, () => 0.99), "met:2");
});

test("remember moves the key to the front without duplicates and caps the length", () => {
  assert.deepEqual(remember(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(remember(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
});
