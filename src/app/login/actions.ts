"use server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COOKIE, MAX_AGE, makeToken, passwordOk } from "@/lib/session";

export async function login(_prev: string | null, form: FormData): Promise<string | null> {
  const pass = String(form.get("pass") ?? "");
  if (!(await passwordOk(pass))) {
    await new Promise(r => setTimeout(r, 600)); // slow down guessing a little
    return "Fel lösenord";
  }
  (await cookies()).set(COOKIE, await makeToken(), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: MAX_AGE,
  });
  redirect("/");
}

export async function logout() {
  (await cookies()).delete(COOKIE);
  redirect("/login");
}
