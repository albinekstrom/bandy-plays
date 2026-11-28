import "server-only";
import { cookies } from "next/headers";
import { COOKIE, COOKIE_OPTIONS, DEV_NO_LOGIN, checkToken, makeToken } from "./session";
import { usersReady, SEED_NAME, type Role } from "./users";

/** The logged-in user and his role, from the database on every call, so a changed
    role counts at once and a session ended elsewhere (password change, "Logga ut
    överallt", removed account) is refused. Every route handler, server action and
    page that shows data checks this; the proxy only checks the signature. */
export async function currentUser(): Promise<{ name: string; role: Role } | null> {
  const s = await checkToken((await cookies()).get(COOKIE)?.value);
  const u = await usersReady();
  if (s) {
    const a = await u.account(s.name);
    if (a && a.version === s.version) return { name: s.name, role: a.role };
  }
  if (DEV_NO_LOGIN) {
    const a = await u.account(SEED_NAME);
    if (a) return { name: SEED_NAME, role: a.role };
  }
  return null;
}

export async function isAdmin() {
  return (await currentUser())?.role === "admin";
}

/** Set the session cookie for `name` at his current session version (server actions only). */
export async function startSession(name: string, version?: number) {
  const v = version ?? (await (await usersReady()).account(name))?.version;
  if (v == null) return;
  (await cookies()).set(COOKIE, await makeToken(name, v), COOKIE_OPTIONS);
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}
