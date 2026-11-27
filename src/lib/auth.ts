import "server-only";
import { cookies } from "next/headers";
import { COOKIE, validToken } from "./session";

export async function loggedIn() {
  return validToken((await cookies()).get(COOKIE)?.value);
}
