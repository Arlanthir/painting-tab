import * as louvre from "./louvre.js";
import * as met from "./met.js";
import { parseKey, pickRandom, remember, toKeys } from "./picker.js";

const MAX_ATTEMPTS = 4;
const MET_IDS_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const SOURCES = { [louvre.SOURCE]: louvre, [met.SOURCE]: met };

const $ = (id) => document.getElementById(id);
const storage = globalThis.chrome?.storage?.local;

async function loadState() {
  if (!storage) return { next: null, recent: [], metIds: [], metFetchedAt: 0, metListId: "" };
  const {
    next = null,
    recent = [],
    metIds = [],
    metFetchedAt = 0,
    metListId = "",
  } = await storage.get(["next", "recent", "metIds", "metFetchedAt", "metListId"]);
  // Paintings prepared by older versions have no key; ignore them.
  return { next: next?.key ? next : null, recent, metIds, metFetchedAt, metListId };
}

function saveState(state) {
  return storage?.set(state);
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(src);
    img.onerror = () => reject(new Error(`Failed to load ${src}`));
    img.src = src;
  });
}

async function loadLouvreKeys() {
  const res = await fetch("Results.csv");
  return toKeys(louvre.SOURCE, louvre.paintingArks(louvre.parseCsv(await res.text())));
}

/** Refreshes the cached list of Met paintings when it is missing, outdated or older than a week. */
async function refreshMetIds(state) {
  const fresh = Date.now() - state.metFetchedAt < MET_IDS_MAX_AGE;
  if (state.metIds.length && state.metListId === met.LIST_ID && fresh) return;
  try {
    state.metIds = await met.fetchPaintingIds();
    state.metFetchedAt = Date.now();
    state.metListId = met.LIST_ID;
    await saveState({ metIds: state.metIds, metFetchedAt: state.metFetchedAt, metListId: state.metListId });
  } catch (err) {
    console.warn(err);
  }
}

/** Fetches random paintings from the museums' APIs until one has an image, skipping recent ones. */
async function findPainting(keys, state) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const key = pickRandom(keys(), state.recent);
    const { source, id } = parseKey(key);
    try {
      const painting = await SOURCES[source].fetchPainting(id);
      if (painting) return painting;
    } catch (err) {
      console.warn(err);
    }
    state.recent = remember(state.recent, key);
  }
  throw new Error("Couldn't find a painting with an image");
}

function render(painting) {
  $("painting").src = painting.image;
  $("painting").alt = `${painting.title} — ${painting.artist}`;
  $("backdrop").style.backgroundImage = `url("${painting.image}")`;

  $("museum").textContent = painting.museum;
  $("title").textContent = painting.title;
  $("title").href = painting.url;
  $("artist").textContent = painting.artist;
  $("date").textContent = painting.date;
  $("copyright").textContent = painting.copyright;

  $("info").hidden = false;
  $("status").textContent = "";
  document.body.classList.add("loaded");
}

async function show(keys, state, prepared) {
  // A prepared painting can be the one already on screen if it was not replaced in time.
  if (prepared && prepared.key !== state.current) {
    try {
      await loadImage(prepared.image);
      render(prepared);
      state.current = prepared.key;
      state.recent = remember(state.recent, prepared.key);
      return;
    } catch (err) {
      console.warn(err);
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const painting = await findPainting(keys, state);
      state.recent = remember(state.recent, painting.key);
      await loadImage(painting.image);
      render(painting);
      state.current = painting.key;
      return;
    } catch (err) {
      console.warn(err);
    }
  }
  $("status").textContent = "Couldn't reach the museums' collections. Check your connection.";
}

/**
 * Choose the next painting now and warm the HTTP cache so it appears instantly, whether it is
 * shown by the next new tab or by ↻ in any open tab.
 */
async function prepareNext(keys, state) {
  try {
    const next = await findPainting(keys, state);
    await saveState({ next, recent: state.recent });
    loadImage(next.image).catch(() => {});
  } catch (err) {
    console.warn(err);
    await saveState({ next: null, recent: state.recent });
  }
}

async function main() {
  const louvreKeys = await loadLouvreKeys();
  const state = await loadState();
  // Read lazily so the Met list joins the pool as soon as it has been fetched.
  const keys = () => [...louvreKeys, ...toKeys(met.SOURCE, state.metIds)];

  await show(keys, state, state.next);
  await refreshMetIds(state);
  let preparing = prepareNext(keys, state);

  let showing = false;
  $("shuffle").addEventListener("click", async () => {
    if (showing) return;
    showing = true;
    try {
      // Wait for a painting still being prepared rather than fetching another one from scratch.
      await preparing;
      // Re-read storage: other tabs may have used and replaced the prepared painting.
      const { next, recent } = await loadState();
      state.recent = recent;
      document.body.classList.remove("loaded");
      await show(keys, state, next);
    } finally {
      showing = false;
    }
    preparing = prepareNext(keys, state);
  });
}

main();
