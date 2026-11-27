/* One shared password. A session is "<expiry>.<hmac>" signed with AUTH_SECRET.
   Web Crypto only, so it runs in the proxy and in route handlers alike. */
export const COOKIE = "bp_session";
export const MAX_AGE = 60 * 60 * 24 * 90; // 90 days: he shouldn't have to log in often

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

async function hmac(msg: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function makeToken() {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  return exp + "." + (await hmac(exp));
}

export async function validToken(token: string | undefined) {
  if (!token) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return same(sig, await hmac(exp));
}

export async function passwordOk(given: string) {
  const want = process.env.APP_PASSWORD;
  if (!want) throw new Error("APP_PASSWORD must be set");
  // compare digests so the length of the password doesn't leak
  return same(await hmac("pw:" + given), await hmac("pw:" + want));
}
