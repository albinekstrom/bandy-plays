import "server-only";
import { cookies } from "next/headers";
import { COOKIE, tokenUser } from "./session";
import { usersReady, type Role } from "./users";

/** The logged-in name, or null. */
export async function loggedIn() {
  return tokenUser((await cookies()).get(COOKIE)?.value);
}

/** The logged-in user and his role (from the database, so a changed role counts at once). */
export async function currentUser(): Promise<{ name: string; role: Role } | null> {
  const name = await loggedIn();
  if (!name) return null;
  const role = await (await usersReady()).role(name);
  return role ? { name, role } : null;
}

export async function isAdmin() {
  return (await currentUser())?.role === "admin";
}
