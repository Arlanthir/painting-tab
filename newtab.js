import { fetchPainting, paintingArks, parseCsv } from "./collection.js";
import { pickRandom, remember } from "./picker.js";

const MAX_ATTEMPTS = 4;

const $ = (id) => document.getElementById(id);
const storage = globalThis.chrome?.storage?.local;

async function loadState() {
  if (!storage) return { next: null, recent: [] };
  const { next = null, recent = [] } = await storage.get(["next", "recent"]);
  return { next, recent };
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

async function loadArks() {
  const res = await fetch("Results.csv");
  return paintingArks(parseCsv(await res.text()));
}

/** Fetches random paintings from the Louvre API until one has an image, skipping recent ones. */
async function findPainting(arks, state) {
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const arkId = pickRandom(arks, state.recent);
    try {
      const painting = await fetchPainting(arkId);
      if (painting) return painting;
    } catch (err) {
      console.warn(err);
    }
    state.recent = remember(state.recent, arkId);
  }
  throw new Error("Couldn't find a painting with an image");
}

function render(painting) {
  $("painting").src = painting.image;
  $("painting").alt = `${painting.title} — ${painting.artist}`;
  $("backdrop").style.backgroundImage = `url("${painting.image}")`;

  $("title").textContent = painting.title;
  $("title").href = painting.url;
  $("artist").textContent = painting.artist;
  $("date").textContent = painting.date;
  $("copyright").textContent = painting.copyright;

  $("info").hidden = false;
  $("status").textContent = "";
  document.body.classList.add("loaded");
}

async function show(arks, state, prepared) {
  if (prepared) {
    try {
      await loadImage(prepared.image);
      render(prepared);
      state.recent = remember(state.recent, prepared.arkId);
      return;
    } catch (err) {
      console.warn(err);
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const painting = await findPainting(arks, state);
      state.recent = remember(state.recent, painting.arkId);
      await loadImage(painting.image);
      render(painting);
      return;
    } catch (err) {
      console.warn(err);
    }
  }
  $("status").textContent = "Couldn't reach the Louvre collections. Check your connection.";
}

/** Choose the next tab's painting now and warm the HTTP cache so it appears instantly. */
async function prepareNext(arks, state) {
  try {
    const next = await findPainting(arks, state);
    await saveState({ next, recent: state.recent });
    loadImage(next.image).catch(() => {});
  } catch (err) {
    console.warn(err);
    await saveState({ next: null, recent: state.recent });
  }
}

async function main() {
  const arks = await loadArks();
  const state = await loadState();

  await show(arks, state, state.next);
  await prepareNext(arks, state);

  $("shuffle").addEventListener("click", async () => {
    document.body.classList.remove("loaded");
    await show(arks, state);
    await prepareNext(arks, state);
  });
}

main();
