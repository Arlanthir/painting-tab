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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fadeOutMs = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--fade-out"));

/**
 * Fades the current painting out while the next image loads, then fades the new one in, so every
 * change looks the same whether or not the image was already downloaded.
 */
async function display(painting) {
  const fadingOut = document.body.classList.contains("loaded");
  document.body.classList.remove("loaded");
  await Promise.all([loadImage(painting.image), fadingOut && delay(fadeOutMs())]);
  render(painting);
}

/** Shows a new painting, using the prepared one when possible. Returns it, or null on failure. */
async function show(keys, state, prepared) {
  // A prepared painting can be the one already on screen if it was not replaced in time.
  if (prepared && prepared.key !== state.current) {
    try {
      await display(prepared);
      state.current = prepared.key;
      state.recent = remember(state.recent, prepared.key);
      return prepared;
    } catch (err) {
      console.warn(err);
    }
  }

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      const painting = await findPainting(keys, state);
      state.recent = remember(state.recent, painting.key);
      await display(painting);
      state.current = painting.key;
      return painting;
    } catch (err) {
      console.warn(err);
    }
  }
  $("status").textContent = "Couldn't reach the museums' collections. Check your connection.";
  return null;
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

  // Paintings shown in this tab, oldest first, for going back and forward. Not persisted, so each
  // tab starts with its own empty history.
  const history = [];
  let position = -1;

  const updateControls = () => {
    $("controls").hidden = position < 0;
    $("previous").disabled = position <= 0;
  };

  const first = await show(keys, state, state.next);
  if (first) position = history.push(first) - 1;
  updateControls();
  await refreshMetIds(state);
  let preparing = prepareNext(keys, state);

  let showing = false;
  /** Runs one navigation at a time; input arriving meanwhile is dropped. */
  async function navigate(action) {
    if (showing) return;
    showing = true;
    try {
      await action();
    } finally {
      showing = false;
      updateControls();
    }
  }

  async function revisit(index) {
    const painting = history[index];
    try {
      await display(painting);
      position = index;
      state.current = painting.key;
    } catch (err) {
      // Keep the painting that was on screen.
      console.warn(err);
      document.body.classList.add("loaded");
    }
  }

  const forward = () =>
    navigate(async () => {
      if (position < history.length - 1) {
        await revisit(position + 1);
        return;
      }
      // Wait for a painting still being prepared rather than fetching another one from scratch.
      await preparing;
      // Re-read storage: other tabs may have used and replaced the prepared painting.
      const { next, recent } = await loadState();
      state.recent = recent;
      const painting = await show(keys, state, next);
      if (painting) position = history.push(painting) - 1;
      preparing = prepareNext(keys, state);
    });

  const back = () =>
    navigate(async () => {
      if (position > 0) await revisit(position - 1);
    });

  $("shuffle").addEventListener("click", forward);
  $("previous").addEventListener("click", back);
  // Clicking doesn't focus the buttons, so Space keeps meaning "another painting" afterwards
  // instead of re-activating whichever button was clicked last.
  $("controls").addEventListener("mousedown", (event) => event.preventDefault());

  document.addEventListener("keydown", (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    // Space on a button focused with Tab activates that button natively.
    if (event.key === " " && event.target instanceof HTMLButtonElement) return;
    if (event.key === " " || event.key === "ArrowRight") {
      event.preventDefault();
      forward();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      back();
    }
  });
}

main();
