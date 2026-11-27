export const SUGGESTED_TAGS = ["Anfall", "Försvar", "Hörna", "Frislag", "Inslag", "Avslag"];
export const MAX_TAGS = 8;
export const MAX_TAG_LEN = 24;

/** Trim, drop empties, cap length, dedupe case-insensitively (first spelling wins). */
export function cleanTags(input: unknown[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of input) {
    if (typeof t !== "string") continue;
    const s = t.trim().replace(/\s+/g, " ").slice(0, MAX_TAG_LEN).trim();
    const k = s.toLocaleLowerCase("sv");
    if (!s || seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out.slice(0, MAX_TAGS);
}
