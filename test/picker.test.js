import { test } from "node:test";
import assert from "node:assert/strict";
import { pickRandom, remember } from "../picker.js";

const arks = ["a", "b", "c"];

test("pickRandom avoids recently shown paintings", () => {
  for (let i = 0; i < 50; i++) {
    assert.equal(pickRandom(arks, ["a", "b"]), "c");
  }
});

test("pickRandom falls back to all paintings when every one is recent", () => {
  assert.equal(pickRandom(arks, ["a", "b", "c"], () => 0.99), "c");
});

test("remember moves the id to the front without duplicates and caps the length", () => {
  assert.deepEqual(remember(["a", "b", "c"], "b"), ["b", "a", "c"]);
  assert.deepEqual(remember(["a", "b", "c"], "d", 3), ["d", "a", "b"]);
});
