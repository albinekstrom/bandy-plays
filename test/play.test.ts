import { test } from "node:test";
import assert from "node:assert/strict";
import { newPlayData, plan, frameAt, endState, stepAfter, skatedBefore, placeFromStart, carried, SKATE } from "../src/lib/play";
import { dist } from "../src/lib/geom";
import type { Step } from "../src/lib/types";

const near = (a: number, b: number, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

function twoSteps() {
  const { pieces, steps } = newPlayData();
  const a = steps[0];
  const runner = pieces.find(p => p.side === "us" && p.id !== a.ball.holder)!.id;
  const p = a.pos[runner];
  const end: [number, number] = [p.x + 12, p.y + 4];
  const a2: Step = { ...a, arrows: [{ id: "r1", kind: "run", piece: runner, pts: [[p.x, p.y], end] }] };
  const { pos, ball } = endState(a2, pieces);
  const b: Step = { id: "s2", text: "", pos, ball, arrows: [] };
  return { pieces, a: a2, b, runner, end };
}

test("at t=0 everyone is where step a puts them; at the end where step b does", () => {
  const { a, b } = twoSteps();
  const pl = plan(a, b);
  const f0 = frameAt(pl, 0);
  for (const id of Object.keys(a.pos)) {
    near(f0.pos[id].x, a.pos[id].x); near(f0.pos[id].y, a.pos[id].y);
  }
  const fe = frameAt(pl, pl.T);
  for (const id of Object.keys(b.pos)) {
    near(fe.pos[id].x, b.pos[id].x); near(fe.pos[id].y, b.pos[id].y);
  }
});

test("nobody teleports: positions move at most skating speed between frames", () => {
  const { a, b } = twoSteps();
  const pl = plan(a, b);
  const dt = 0.02;
  let prev = frameAt(pl, 0);
  for (let t = dt; t <= pl.T + dt; t += dt) {
    const f = frameAt(pl, t);
    for (const id of Object.keys(f.pos)) {
      // the in-out easing peaks at 2x the average speed
      assert.ok(dist([f.pos[id].x, f.pos[id].y], [prev.pos[id].x, prev.pos[id].y]) <= SKATE * 2.05 * dt + 1e-6, `${id} at ${t}`);
    }
    prev = f;
  }
});

test("a run takes length / SKATE seconds and the step lasts at least 0.8 s", () => {
  const { a, b, runner } = twoSteps();
  const pl = plan(a, b);
  near(pl.movers[runner].dur, pl.movers[runner].len / SKATE, 1e-9);
  assert.ok(pl.T >= 0.8);
  assert.ok(pl.T >= pl.movers[runner].dur);
});

test("a holder keeps the ball in front of him while it is not passed", () => {
  const { a, b } = twoSteps();
  const pl = plan(a, b);
  const f = frameAt(pl, pl.T / 2);
  const c = carried(f.pos[a.ball.holder!]);
  near(f.ball[0], c[0], 1e-6); near(f.ball[1], c[1], 1e-6);
});

test("a pass leaves after every run and reaches the receiver", () => {
  const { pieces, a, b, runner } = twoSteps();
  const target = b.pos[runner];
  const passStep: Step = { ...a, arrows: [...a.arrows, { id: "p1", kind: "pass", piece: a.ball.holder, pts: [[0, 0], [target.x, target.y]] }] };
  const end = endState(passStep, pieces);
  const next: Step = { ...b, ball: end.ball, pos: end.pos };
  assert.equal(next.ball.holder, runner);
  const pl = plan(passStep, next);
  assert.ok(pl.pass);
  assert.ok(pl.pass.start >= pl.movers[runner].dur - 1e-9);
  const fe = frameAt(pl, pl.T);
  const c = carried(fe.pos[runner]);
  near(fe.ball[0], c[0], 0.3); near(fe.ball[1], c[1], 0.3);
});

test("stepAfter starts where the previous step's runs end", () => {
  const { pieces, a, runner, end } = twoSteps();
  const s = stepAfter([a], 0, pieces);
  near(s.pos[runner].x, end[0], 0.01); near(s.pos[runner].y, end[1], 0.01);
  assert.equal(s.arrows.length, 0);
});

test("skatedBefore and placeFromStart: only up to the first run", () => {
  const { a, b, runner } = twoSteps();
  assert.equal(skatedBefore([a, b], 1, runner), true);
  assert.equal(skatedBefore([a, b], 0, runner), false);
  const moved = placeFromStart([a, b], runner, { x: 50, y: 30 });
  assert.equal(moved[0].pos[runner].x, 50);
  assert.equal(moved[1].pos[runner].x, b.pos[runner].x); // after his run: untouched
});
