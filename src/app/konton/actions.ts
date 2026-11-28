"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isAdmin, currentUser, startSession, endSession } from "@/lib/auth";
import { usersReady, hashPassword, checkPassword, NAME_RE, type Role } from "@/lib/users";
import { passwordProblem, MAX_PASSWORD } from "@/lib/password";
import { MIN_TEAM_CODE } from "@/lib/teamcode";
import { gate, forgetName, LIMITS, TOO_MANY } from "@/lib/ratelimit";

export type Result = { ok: boolean; msg: string } | null;

const NOT_LOGGED_IN = { ok: false, msg: "Du är inte inloggad" };

/** The new password from the form (pass + pass2), or what is wrong with it. */
function newPassword(form: FormData, name: string): { pass: string } | { msg: string } {
  const pass = String(form.get("pass") ?? ""), pass2 = String(form.get("pass2") ?? "");
  const bad = passwordProblem(pass, name);
  if (bad) return { msg: bad };
  if (pass !== pass2) return { msg: "Lösenorden är inte lika" };
  return { pass };
}

/** Is `given` my current password? Rate-limited per account; null when it is. */
async function wrongPassword(me: string, given: string): Promise<string | null> {
  const key = "pw:name:" + me;
  const g = await gate([{ key, limit: LIMITS.name }]);
  if (g.wait) return TOO_MANY;
  const hash = await (await usersReady()).hash(me);
  if (!hash || given.length > MAX_PASSWORD || !(await checkPassword(given, hash))) {
    await g.fail();
    await new Promise(r => setTimeout(r, 600));
    return "Nuvarande lösenord stämmer inte";
  }
  await g.clear([key]);
  return null;
}

/** An admin may reset or remove a player who is not himself (admins are made players first). */
async function playerToManage(form: FormData): Promise<{ name: string } | { msg: string }> {
  const me = await currentUser();
  if (me?.role !== "admin") return { msg: "Bara admin kan göra det" };
  const name = String(form.get("name") ?? "");
  if (name === me.name) return { msg: "Det gör du för ditt eget konto längre ner" };
  const a = await (await usersReady()).account(name);
  if (!a) return { msg: "Kontot finns inte" };
  if (a.role !== "player") return { msg: "Gör kontot till spelare först" };
  return { name };
}

export async function addUser(_prev: Result, form: FormData): Promise<Result> {
  if (!(await isAdmin())) return { ok: false, msg: "Bara admin kan lägga till konton" };
  const role: Role = form.get("role") === "admin" ? "admin" : "player";
  const u = await usersReady();
  const name = String(form.get("name") ?? "").trim().toLowerCase();
  if (!NAME_RE.test(name)) return { ok: false, msg: "Namnet ska vara 2–20 bokstäver (A–Ö), inga mellanslag eller siffror" };
  const pw = newPassword(form, name);
  if ("msg" in pw) return { ok: false, msg: pw.msg };
  if (!(await u.add(name, await hashPassword(pw.pass), role))) return { ok: false, msg: "Namnet är upptaget" };
  revalidatePath("/konton");
  return { ok: true, msg: `Kontot ${name.toUpperCase()} är skapat` };
}

export async function changePassword(_prev: Result, form: FormData): Promise<Result> {
  const me = (await currentUser())?.name;
  if (!me) return NOT_LOGGED_IN;
  const wrong = await wrongPassword(me, String(form.get("old") ?? ""));
  if (wrong) return { ok: false, msg: wrong };
  const pw = newPassword(form, me);
  if ("msg" in pw) return { ok: false, msg: pw.msg };
  // ends every other session; this browser gets a fresh cookie and stays logged in
  await startSession(me, (await (await usersReady()).setHash(me, await hashPassword(pw.pass))) ?? undefined);
  return { ok: true, msg: "Lösenordet är bytt. Du är utloggad på alla andra enheter." };
}

/* Admin: a new password for a player who forgot his. His sessions end. */
export async function resetPassword(_prev: Result, form: FormData): Promise<Result> {
  const who = await playerToManage(form);
  if ("msg" in who) return { ok: false, msg: who.msg };
  const pw = newPassword(form, who.name);
  if ("msg" in pw) return { ok: false, msg: pw.msg };
  await (await usersReady()).setHash(who.name, await hashPassword(pw.pass));
  await forgetName(who.name); // a locked-out player can log in with the new password at once
  return { ok: true, msg: `${who.name.toUpperCase()} har fått ett nytt lösenord. Ge det till spelaren.` };
}

/* Admin: remove a player's account. */
export async function removeUser(_prev: Result, form: FormData): Promise<Result> {
  const who = await playerToManage(form);
  if ("msg" in who) return { ok: false, msg: who.msg };
  await (await usersReady()).remove(who.name);
  await forgetName(who.name);
  revalidatePath("/konton");
  return { ok: true, msg: `Kontot ${who.name.toUpperCase()} är borttaget` };
}

/* Remove my own account (needs my password). The last admin can't. */
export async function removeMyAccount(_prev: Result, form: FormData): Promise<Result> {
  const me = await currentUser();
  if (!me) return NOT_LOGGED_IN;
  const u = await usersReady();
  if (me.role === "admin" && (await u.list()).filter(x => x.role === "admin").length <= 1) {
    return { ok: false, msg: "Du är enda admin. Gör någon annan till admin först." };
  }
  const wrong = await wrongPassword(me.name, String(form.get("old") ?? ""));
  if (wrong) return { ok: false, msg: wrong };
  await u.remove(me.name);
  await forgetName(me.name);
  await endSession();
  redirect("/login");
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
  // a new role starts new sessions (the role itself counts at once anyway)
  const v = await u.bump(name);
  if (name === me.name && v != null) await startSession(name, v);
  revalidatePath("/konton");
}

/* End every session of mine, this one too. */
export async function logoutEverywhere() {
  const me = await currentUser();
  if (me) await (await usersReady()).bump(me.name);
  await endSession();
  redirect("/login");
}
