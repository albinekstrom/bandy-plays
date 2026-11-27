"use server";
import { loggedIn } from "@/lib/auth";
import { users, hashPassword, checkPassword, NAME_RE, MIN_PASSWORD } from "@/lib/users";

export type Result = { ok: boolean; msg: string } | null;

export async function addUser(_prev: Result, form: FormData): Promise<Result> {
  if (!(await loggedIn())) return { ok: false, msg: "Du är inte inloggad" };
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const pass = String(form.get("pass") ?? ""), pass2 = String(form.get("pass2") ?? "");
  if (!NAME_RE.test(name)) return { ok: false, msg: "Namnet ska vara 2–20 små bokstäver (a–ö), inga mellanslag" };
  if (pass.length < MIN_PASSWORD) return { ok: false, msg: `Lösenordet ska vara minst ${MIN_PASSWORD} tecken` };
  if (pass !== pass2) return { ok: false, msg: "Lösenorden är inte lika" };
  if (!(await users().add(name, await hashPassword(pass)))) return { ok: false, msg: "Namnet är upptaget" };
  return { ok: true, msg: `Kontot "${name}" är skapat` };
}

export async function changePassword(_prev: Result, form: FormData): Promise<Result> {
  const me = await loggedIn();
  if (!me) return { ok: false, msg: "Du är inte inloggad" };
  const hash = await users().hash(me);
  if (!hash || !(await checkPassword(String(form.get("old") ?? ""), hash))) {
    await new Promise(r => setTimeout(r, 600));
    return { ok: false, msg: "Nuvarande lösenord stämmer inte" };
  }
  const pass = String(form.get("pass") ?? ""), pass2 = String(form.get("pass2") ?? "");
  if (pass.length < MIN_PASSWORD) return { ok: false, msg: `Lösenordet ska vara minst ${MIN_PASSWORD} tecken` };
  if (pass !== pass2) return { ok: false, msg: "Lösenorden är inte lika" };
  await users().setHash(me, await hashPassword(pass));
  return { ok: true, msg: "Lösenordet är bytt" };
}
