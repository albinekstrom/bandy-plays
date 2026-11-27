"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, MAX_AGE, makeToken, setupKeyOk } from "@/lib/session";
import { users, hashPassword, checkPassword, NAME_RE, MIN_PASSWORD } from "@/lib/users";

const slow = () => new Promise(r => setTimeout(r, 600)); // makes guessing slower

async function startSession(name: string) {
  (await cookies()).set(COOKIE, await makeToken(name), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
}

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const pass = String(form.get("pass") ?? "");
  const hash = NAME_RE.test(name) ? await users().hash(name) : null;
  if (!hash || !(await checkPassword(pass, hash))) { await slow(); return "Fel namn eller lösenord"; }
  await startSession(name);
  redirect("/");
}

/* The very first account, unlocked once with the old shared password. */
export async function setup(_prev: string | null, form: FormData): Promise<string | null> {
  if ((await users().count()) > 0) return "Det finns redan konton. Logga in.";
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const pass = String(form.get("pass") ?? ""), pass2 = String(form.get("pass2") ?? "");
  if (!(await setupKeyOk(String(form.get("key") ?? "")))) { await slow(); return "Fel engångsnyckel"; }
  if (!NAME_RE.test(name)) return "Namnet ska vara 2–20 små bokstäver (a–ö), inga mellanslag";
  if (pass.length < MIN_PASSWORD) return `Lösenordet ska vara minst ${MIN_PASSWORD} tecken`;
  if (pass !== pass2) return "Lösenorden är inte lika";
  if (!(await users().add(name, await hashPassword(pass)))) return "Namnet är upptaget";
  await startSession(name);
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
