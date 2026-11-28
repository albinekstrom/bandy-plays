import { test, before } from "node:test";
import assert from "node:assert/strict";

const SECRET = "test-secret-test-secret-test-secret-123";
process.env.AUTH_SECRET = SECRET;
let makeToken: typeof import("../src/lib/session").makeToken;
let tokenUser: typeof import("../src/lib/session").tokenUser;
let MAX_AGE: number;
let same: typeof import("../src/lib/session").same;
before(async () => {
  ({ makeToken, tokenUser, MAX_AGE, same } = await import("../src/lib/session"));
});

test("token round-trips to the name", async () => {
  assert.equal(await tokenUser(await makeToken("daniel")), "daniel");
});

test("missing or malformed tokens are rejected", async () => {
  for (const t of [undefined, "", "a", "a.b", "a.b.c.d", "..", "daniel.9999999999."]) {
    assert.equal(await tokenUser(t), null, String(t));
  }
});

test("a tampered name, expiry or signature is rejected", async () => {
  const [name, exp, sig] = (await makeToken("anna")).split(".");
  assert.equal(await tokenUser(`daniel.${exp}.${sig}`), null);
  assert.equal(await tokenUser(`${name}.${Number(exp) + 1000}.${sig}`), null);
  assert.equal(await tokenUser(`${name}.${exp}.${sig.replace(/.$/, c => (c === "0" ? "1" : "0"))}`), null);
  assert.equal(await tokenUser(`${name}.${exp}.${"0".repeat(sig.length)}`), null);
});

test("an expired token is rejected, even with a valid signature", async () => {
  const real = Date.now;
  try {
    Date.now = () => real() - (MAX_AGE + 60) * 1000; // issued in the past
    const old = await makeToken("anna");
    Date.now = real;
    assert.equal(await tokenUser(old), null);
  } finally { Date.now = real; }
});

test("a token signed with another secret is rejected", async () => {
  const t = await makeToken("anna");
  process.env.AUTH_SECRET = "another-secret-another-secret-another-1";
  try { assert.equal(await tokenUser(t), null); }
  finally { process.env.AUTH_SECRET = SECRET; }
});

test("a short AUTH_SECRET is refused", async () => {
  process.env.AUTH_SECRET = "short";
  try { await assert.rejects(makeToken("anna")); }
  finally { process.env.AUTH_SECRET = SECRET; }
});

test("same compares strings exactly", () => {
  assert.ok(same("abc", "abc"));
  assert.ok(!same("abc", "abd"));
  assert.ok(!same("abc", "ab"));
});
