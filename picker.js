// Pure helpers for choosing paintings, kept free of browser APIs so they can be tested in Node.

export const RECENT_LIMIT = 50;

/**
 * Picks a random ARK ID, avoiding recently shown ones while there are alternatives.
 */
export function pickRandom(arkIds, recent = [], random = Math.random) {
  const recentSet = new Set(recent);
  const fresh = arkIds.filter((id) => !recentSet.has(id));
  const pool = fresh.length ? fresh : arkIds;
  return pool[Math.floor(random() * pool.length)];
}

/**
 * Returns the recent-history list with `arkId` moved to the front, capped at `limit`.
 */
export function remember(recent, arkId, limit = RECENT_LIMIT) {
  return [arkId, ...recent.filter((id) => id !== arkId)].slice(0, limit);
}
