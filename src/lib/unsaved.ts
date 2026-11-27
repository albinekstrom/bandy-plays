/* Client-side: parts of the page with unsaved work register a flush,
   so "Ladda om" can save everything first. */
type Flush = () => Promise<boolean>;
const flushes = new Set<Flush>();

export function onFlush(fn: Flush) {
  flushes.add(fn);
  return () => { flushes.delete(fn); };
}

/** Save everything that is pending. True when all of it is safely stored. */
export async function flushAll(): Promise<boolean> {
  const results = await Promise.all([...flushes].map(f => f().catch(() => false)));
  return results.every(Boolean);
}
