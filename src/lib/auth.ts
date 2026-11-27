import "server-only";
import { cookies } from "next/headers";
import { COOKIE, tokenUser } from "./session";

/** The logged-in name, or null. */
export async function loggedIn() {
  return tokenUser((await cookies()).get(COOKIE)?.value);
}
