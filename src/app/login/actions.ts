"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, MAX_AGE, makeToken } from "@/lib/session";
import { usersReady, hashPassword, checkPassword, NAME_RE, MIN_PASSWORD } from "@/lib/users";

const slow = () => new Promise(r => setTimeout(r, 600)); // makes guessing slower

async function startSession(name: string) {
  (await cookies()).set(COOKIE, await makeToken(name), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const u = await usersReady();
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const pass = String(form.get("pass") ?? "");
  const hash = NAME_RE.test(name) ? await u.hash(name) : null;
  if (!hash || !(await checkPassword(pass, hash))) { await slow(); return "Fel namn eller lösenord"; }
  await startSession(name);
  redirect("/");
}

/* Anyone with the team code can make their own account. */
export async function register(_prev: string | null, form: FormData): Promise<string | null> {
  const u = await usersReady();
  const code = await u.teamCode();
  if (!code || !(await checkPassword(String(form.get("code") ?? ""), code))) { await slow(); return "Fel lagkod"; }
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
