/* A session is "<name>.<expiry>.<version>.<hmac>" signed with AUTH_SECRET.
   The version is the user's session_version when the cookie was made; bumping
   it in the database ends every session made before (checked by currentUser()).
   Cookies from before versions are "<name>.<expiry>.<hmac>" and count as version 0.
   Web Crypto only, so it runs in the proxy and in route handlers alike. */
export const COOKIE = "bp_session";
export const MAX_AGE = 60 * 60 * 24 * 90; // 90 days: nobody should have to log in often

/** How the session cookie is set: never readable from scripts, HTTPS only when deployed. */
export const COOKIE_OPTIONS = {
  httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
} as const;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, "0")).join("");

async function hmac(msg: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET must be set (32+ chars)");
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", key, enc.encode(msg)));
}

export function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function makeToken(name: string, version: number) {
  const exp = String(Math.floor(Date.now() / 1000) + MAX_AGE);
  const body = `${name}.${exp}.${version}`;
  return `${body}.${await hmac(body)}`;
}

/* Local development without logging in: everyone is the admin "daniel".
   Needs DEV_NO_LOGIN=1 in .env.local AND `npm run dev` AND the local file store.
   `next build` sets NODE_ENV=production, so in a deployed build this is always false;
   it is also off on Vercel and whenever a real database is connected. */
export const DEV_NO_LOGIN =
  process.env.NODE_ENV === "development" && process.env.DEV_NO_LOGIN === "1" && !process.env.VERCEL && !process.env.DATABASE_URL;

export type Session = { name: string; version: number };

/** A correctly signed, unexpired session, or null. This is all the proxy checks;
    currentUser() (src/lib/auth.ts) also compares the version with the database. */
export async function checkToken(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3 && parts.length !== 4) return null;
  const sig = parts.pop()!;
  const [name, exp, ver = "0"] = parts; // no version: a cookie from before versions
  if (!name || !/^\d+$/.test(exp) || !/^\d+$/.test(ver) || Number(exp) < Date.now() / 1000) return null;
  return same(sig, await hmac(parts.join("."))) ? { name, version: Number(ver) } : null;
}

/** The proxy's check: someone is (probably) logged in. */
export async function tokenOk(token: string | undefined) {
  return DEV_NO_LOGIN || !!(await checkToken(token));
}

/** Only for creating the very first account: the old shared password as a one-time key. */
export async function setupKeyOk(given: string) {
  const want = process.env.APP_PASSWORD;
  if (!want) return false;
  return same(await hmac("pw:" + given), await hmac("pw:" + want));
}
