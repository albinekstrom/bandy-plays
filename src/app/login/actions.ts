"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, MAX_AGE, makeToken } from "@/lib/session";
import { usersReady, hashPassword, checkPassword, NAME_RE, MIN_PASSWORD } from "@/lib/users";
import { gate, clientKey, LIMITS, TOO_MANY } from "@/lib/ratelimit";

const slow = () => new Promise(r => setTimeout(r, 600)); // makes guessing slower
// checked when the name is unknown, so both cases take as long (scrypt of "x")
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$" + "A".repeat(86) + "==";

async function startSession(name: string) {
  (await cookies()).set(COOKIE, await makeToken(name), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const u = await usersReady();
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const pass = String(form.get("pass") ?? "");
  // per IP and per name (any name, known or not, so the answer never tells which exist)
  const nameKey = "login:name:" + (NAME_RE.test(name) ? name : "?");
  const g = await gate([{ key: "login:ip:" + await clientKey(), limit: LIMITS.ip }, { key: nameKey, limit: LIMITS.name }]);
  if (g.wait) { await slow(); return TOO_MANY; }
  const hash = NAME_RE.test(name) ? await u.hash(name) : null;
  const ok = await checkPassword(pass, hash ?? DUMMY_HASH);
  if (!hash || !ok) { await g.fail(); await slow(); return "Fel namn eller lösenord"; }
  await g.clear([nameKey]); // the IP count stays: one good login must not reset a guessing run
  await startSession(name);
  redirect("/");
}

/* Anyone with the team code can make their own account. */
export async function register(_prev: string | null, form: FormData): Promise<string | null> {
  const u = await usersReady();
  const g = await gate([{ key: "code:ip:" + await clientKey(), limit: LIMITS.name * 2 }]);
  if (g.wait) { await slow(); return TOO_MANY; }
  const code = await u.teamCode();
  // codes are shown in capitals, so "k7m4qx9p" counts too; older codes keep their exact case
  const given = String(form.get("code") ?? "").trim();
  const codeOk = !!code && ((await checkPassword(given, code)) || (given !== given.toUpperCase() && await checkPassword(given.toUpperCase(), code)));
  if (!codeOk) { await g.fail(); await slow(); return "Fel lagkod"; }
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const pass = String(form.get("pass") ?? ""), pass2 = String(form.get("pass2") ?? "");
  if (!NAME_RE.test(name)) return "Namnet ska vara 2–20 bokstäver (A–Ö), inga mellanslag eller siffror";
  if (pass.length < MIN_PASSWORD) return `Lösenordet ska vara minst ${MIN_PASSWORD} tecken`;
  if (pass !== pass2) return "Lösenorden är inte lika";
  if (!(await u.add(name, await hashPassword(pass), "player"))) return "Namnet är upptaget";
  await startSession(name);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
