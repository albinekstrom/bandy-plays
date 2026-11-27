/* Safe JSON files for the local (dev) stores: writes are queued per file and
   atomic (temp file + rename), and a broken file is an error instead of
   silently reading as empty (which the next write would then make permanent). */
import "server-only";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { dirname } from "node:path";

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  let text: string;
  try { text = await readFile(file, "utf8"); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback; throw e; }
  try { return JSON.parse(text) as T; }
  catch { throw new Error(`${file} is not valid JSON; fix or remove it`); }
}

export async function writeJson(file: string, value: unknown) {
  await mkdir(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 1));
  await rename(tmp, file);
}

// one queue per file, kept on globalThis so dev hot-reloads share it
const g = globalThis as unknown as { __jsonLocks?: Map<string, Promise<unknown>> };
const locks = (g.__jsonLocks ??= new Map());

/** Run a read-modify-write on `file` after any earlier one has finished. */
export function locked<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const run = (locks.get(file) ?? Promise.resolve()).then(fn, fn);
  locks.set(file, run.catch(() => undefined));
  return run;
}
