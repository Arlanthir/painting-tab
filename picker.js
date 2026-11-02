// Pure helpers for choosing paintings, kept free of browser APIs so they can be tested in Node.
// Paintings are identified by keys of the form "<source>:<id>", e.g. "louvre:cl010062370".

export const RECENT_LIMIT = 50;

/** Builds the keys for a source's painting IDs. */
export function toKeys(source, ids) {
  return ids.map((id) => `${source}:${id}`);
}

/** Splits a key into its source and ID. */
export function parseKey(key) {
  const separator = key.indexOf(":");
  return { source: key.slice(0, separator), id: key.slice(separator + 1) };
}

/**
 * Picks a random key, avoiding recently shown ones while there are alternatives.
 */
export function pickRandom(keys, recent = [], random = Math.random) {
  const recentSet = new Set(recent);
  const fresh = keys.filter((key) => !recentSet.has(key));
  const pool = fresh.length ? fresh : keys;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * Returns the recent-history list with `key` moved to the front, capped at `limit`.
 */
export function remember(recent, key, limit = RECENT_LIMIT) {
  return [key, ...recent.filter((k) => k !== key)].slice(0, limit);
}
