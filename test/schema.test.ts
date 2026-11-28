import { test } from "node:test";
import assert from "node:assert/strict";
import { SCHEMA_VERSION, upgrade, parsePlayData, dataOf } from "../src/lib/schema";
import { newPlayData } from "../src/lib/play";
import { ZONE_MIN, ZONE_MAX } from "../src/lib/rink";

/* eslint-disable @typescript-eslint/no-explicit-any */
const fresh = (): any => JSON.parse(JSON.stringify(newPlayData()));

test("every old version upgrades to the current one, keeping content", () => {
  for (let v = 0; v < SCHEMA_VERSION; v++) {
    const old = { ...fresh(), v, extra: { keep: v } };
    const up: any = upgrade(old);
    assert.equal(up.v, SCHEMA_VERSION, `from v${v}`);
    assert.deepEqual(up.pieces, old.pieces);
    assert.deepEqual(up.steps, old.steps);
    assert.deepEqual(up.extra, { keep: v });
  }
});

test("plays without a valid version are treated as version 0", () => {
  const noVersion = fresh();
  delete noVersion.v;
  assert.equal(upgrade(noVersion).v, SCHEMA_VERSION);
  assert.equal(upgrade({ ...fresh(), v: -3 }).v, SCHEMA_VERSION);
  assert.equal(upgrade({ ...fresh(), v: "x" }).v, SCHEMA_VERSION);
});

test("plays from a newer version are left as they are", () => {
  assert.equal(upgrade({ ...fresh(), v: SCHEMA_VERSION + 5 }).v, SCHEMA_VERSION + 5);
});

test("upgrade does not mutate its input and fills missing step text", () => {
  const old = fresh();
  delete old.steps[0].text;
  const copy = JSON.stringify(old);
  const up = upgrade(old);
  assert.equal(JSON.stringify(old), copy);
  assert.equal(up.steps[0].text, "");
});

test("a fresh play parses and is returned unchanged", () => {
  const p = fresh();
  assert.deepEqual(parsePlayData(p), p);
});

test("older optional fields parse (no text, old ctrl curve, passAt, notes)", () => {
  const p = fresh();
  const s = p.steps[0];
  const id = p.pieces[0].id;
  delete s.text;
  s.passAt = 0.5;
  s.notes = { [id]: "hej" };
  s.arrows = [{ id: "a1", kind: "run", piece: id, pts: [[1, 1], [5, 5]], ctrl: [3, 1] }];
  const out: any = parsePlayData(p);
  assert.ok(out);
  assert.equal(out.steps[0].text, "");
  assert.equal(out.steps[0].passAt, 0.5);
});

test("unknown fields are kept at every level", () => {
  const p = fresh();
  const id = p.pieces[0].id;
  p.top = 1;
  p.pieces[0].futurePiece = "a";
  p.steps[0].futureStep = "b";
  p.steps[0].pos[id].futurePos = "c";
  p.steps[0].ball.futureBall = "d";
  p.steps[0].arrows = [{ id: "a1", kind: "pass", piece: null, pts: [[1, 1]], futureArrow: "e" }];
  p.variants = [{ id: "v1", name: "B", from: 0, futureVariant: "f", steps: [{ ...fresh().steps[0], futureVStep: "g" }] }];
  const out: any = parsePlayData(p);
  assert.ok(out);
  assert.equal(out.top, 1);
  assert.equal(out.pieces[0].futurePiece, "a");
  assert.equal(out.steps[0].futureStep, "b");
  assert.equal(out.steps[0].pos[id].futurePos, "c");
  assert.equal(out.steps[0].ball.futureBall, "d");
  assert.equal(out.steps[0].arrows[0].futureArrow, "e");
  assert.equal(out.variants[0].futureVariant, "f");
  assert.equal(out.variants[0].steps[0].futureVStep, "g");
  const up: any = upgrade(out);
  assert.equal(up.top, 1);
  assert.equal(up.steps[0].futureStep, "b");
  assert.equal(up.variants[0].steps[0].futureVStep, "g");
});

test("dataOf strips metadata but keeps unknown fields", () => {
  const out = dataOf({ id: "x", name: "n", revision: 3, rev: 2, tags: [], shareToken: null, steps: [], pieces: [], future: 1 });
  assert.deepEqual(Object.keys(out).sort(), ["future", "pieces", "steps"]);
});

test("invalid data is rejected", () => {
  assert.equal(parsePlayData(null), null);
  assert.equal(parsePlayData("x"), null);
  assert.equal(parsePlayData([]), null);
  const bad: [string, (p: any) => void][] = [
    ["no steps", p => { p.steps = []; }],
    ["steps not array", p => { p.steps = {}; }],
    ["pieces missing", p => { delete p.pieces; }],
    ["bad piece side", p => { p.pieces[0].side = "x"; }],
    ["piece label too long", p => { p.pieces[0].label = "x".repeat(21); }],
    ["empty step id", p => { p.steps[0].id = ""; }],
    ["NaN position", p => { p.steps[0].pos[p.pieces[0].id].x = NaN; }],
    ["string position", p => { p.steps[0].pos[p.pieces[0].id].y = "3"; }],
    ["ball holder wrong type", p => { p.steps[0].ball.holder = 5; }],
    ["bad arrow kind", p => { p.steps[0].arrows = [{ id: "a", kind: "fly", piece: null, pts: [[1, 1]] }]; }],
    ["arrow without points", p => { p.steps[0].arrows = [{ id: "a", kind: "run", piece: null, pts: [] }]; }],
    ["arrow bad point", p => { p.steps[0].arrows = [{ id: "a", kind: "run", piece: null, pts: [[1]] }]; }],
    ["text too long", p => { p.steps[0].text = "x".repeat(501); }],
    ["too many steps", p => { p.steps = Array.from({ length: 201 }, () => p.steps[0]); }],
    ["variant from out of range", p => { p.variants = [{ id: "v", name: "B", from: 9, steps: [p.steps[0]] }]; }],
    ["variant without steps", p => { p.variants = [{ id: "v", name: "B", from: 0, steps: [] }]; }],
    ["zone too small", p => { p.zone = ZONE_MIN - 1; }],
    ["zone too large", p => { p.zone = ZONE_MAX + 1; }],
  ];
  for (const [name, mutate] of bad) {
    const p = fresh();
    mutate(p);
    assert.equal(parsePlayData(p), null, name);
  }
});

test("a valid zone parses", () => {
  assert.ok(parsePlayData({ ...fresh(), zone: ZONE_MIN }));
  assert.ok(parsePlayData({ ...fresh(), zone: ZONE_MAX }));
});
