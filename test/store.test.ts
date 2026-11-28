import { test, before } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The file store keeps its data under process.cwd()/.data, so run in a scratch directory.
let store: typeof import("../src/lib/store").store;
let newPlayData: typeof import("../src/lib/play").newPlayData;
before(async () => {
  delete process.env.DATABASE_URL;
  process.chdir(mkdtempSync(join(tmpdir(), "bandy-test-")));
  ({ store } = await import("../src/lib/store"));
  ({ newPlayData } = await import("../src/lib/play"));
});

test("update with a stale rev answers conflict and writes nothing", async () => {
  const s = store();
  const play = await s.create("Spel", newPlayData());
  const first = await s.update(play.id, "Ett", newPlayData(), 0);
  assert.ok(first && first !== "conflict");
  assert.equal(first.revision, 1);
  assert.equal(await s.update(play.id, "Stale", newPlayData(), 0), "conflict");
  assert.equal((await s.get(play.id))?.name, "Ett");
  const second = await s.update(play.id, "Två", newPlayData(), 1);
  assert.ok(second && second !== "conflict");
  assert.equal(second.revision, 2);
});

test("a save without rev (old tab) still saves; unknown play is null", async () => {
  const s = store();
  const play = await s.create("Gammal", newPlayData());
  const r = await s.update(play.id, "Ny", newPlayData());
  assert.ok(r && r !== "conflict");
  assert.equal(await s.update("nope", "x", newPlayData(), 0), null);
});

test("saving keeps tags and unknown fields", async () => {
  const s = store();
  const play = await s.create("Taggad", { ...newPlayData(), future: 7 } as never, ["a"]);
  await s.update(play.id, "Taggad", newPlayData());
  const got = await s.get(play.id);
  assert.deepEqual(got?.tags, ["a"]);
  assert.equal((got as unknown as Record<string, unknown>).future, 7);
});
