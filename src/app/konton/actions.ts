"use server";
import { revalidatePath } from "next/cache";
import { loggedIn, isAdmin, currentUser } from "@/lib/auth";
import { usersReady, hashPassword, checkPassword, NAME_RE, MIN_PASSWORD, type Role } from "@/lib/users";
import { MIN_TEAM_CODE } from "@/lib/teamcode";
import { gate, LIMITS, TOO_MANY } from "@/lib/ratelimit";

export type Result = { ok: boolean; msg: string } | null;

export async function addUser(_prev: Result, form: FormData): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, msg: "Bara admin kan lägga till konton" };
  const role: Role = form.get("role") === "admin" ? "admin" : "player";
  const u = await usersReady();
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  const pass = String(form.get("pass") ?? ""), pass2 = String(form.get("pass2") ?? "");
  if (!NAME_RE.test(name)) return { ok: false, msg: "Namnet ska vara 2–20 bokstäver (A–Ö), inga mellanslag eller siffror" };
  if (pass.length < MIN_PASSWORD) return { ok: false, msg: `Lösenordet ska vara minst ${MIN_PASSWORD} tecken` };
  if (pass !== pass2) return { ok: false, msg: "Lösenorden är inte lika" };
  if (!(await u.add(name, await hashPassword(pass), role))) return { ok: false, msg: "Namnet är upptaget" };
  revalidatePath("/konton");
  return { ok: true, msg: `Kontot ${name.toUpperCase()} är skapat` };
}

export async function changePassword(_prev: Result, form: FormData): Promise<Result> {
  const me = await loggedIn();
  if (!me) return { ok: false, msg: "Du är inte inloggad" };
  const u = await usersReady();
  const g = await gate([{ key: "pw:name:" + me, limit: LIMITS.name }]);
  if (g.wait) return { ok: false, msg: TOO_MANY };
  const hash = await u.hash(me);
  if (!hash || !(await checkPassword(String(form.get("old") ?? ""), hash))) {
    await g.fail();
    await new Promise(r => setTimeout(r, 600));
    return { ok: false, msg: "Nuvarande lösenord stämmer inte" };
  }
  await g.clear(["pw:name:" + me]);
  const pass = String(form.get("pass") ?? ""), pass2 = String(form.get("pass2") ?? "");
  if (pass.length < MIN_PASSWORD) return { ok: false, msg: `Lösenordet ska vara minst ${MIN_PASSWORD} tecken` };
  if (pass !== pass2) return { ok: false, msg: "Lösenorden är inte lika" };
  await u.setHash(me, await hashPassword(pass));
  return { ok: true, msg: "Lösenordet är bytt" };
}

export async function changeTeamCode(_prev: Result, form: FormData): Promise<{ ok: boolean; msg: string; code?: string } | null> {
  if (!(await isAdmin())) return { ok: false, msg: "Bara admin kan byta lagkod" };
  // capitals only, so it can be read out and typed in any case
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  if (code.length < MIN_TEAM_CODE) return { ok: false, msg: `Lagkoden ska vara minst ${MIN_TEAM_CODE} tecken` };
  if (code.length > 40) return { ok: false, msg: "Lagkoden får vara högst 40 tecken" };
  await (await usersReady()).setTeamCode(await hashPassword(code));
  return { ok: true, msg: "Lagkoden är sparad. Den gamla slutar fungera. Ge den nya till laget:", code };
}

/* Admin: make someone admin or player. There is always at least one admin. */
export async function setUserRole(form: FormData) {
  const me = await currentUser();
  if (me?.role !== "admin") return;
  const name = String(form.get("name") ?? ""), role: Role = form.get("role") === "admin" ? "admin" : "player";
  const u = await usersReady();
  const all = await u.list();
  if (!all.some(x => x.name === name)) return;
  if (role === "player" && all.filter(x => x.role === "admin" && x.name !== name).length === 0) return;
  await u.setRole(name, role);
  revalidatePath("/konton");
}
