import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { DEV_NO_LOGIN } from "@/lib/session";

export const metadata: Metadata = { title: "Logga in · Bandyspel" };

export default function LoginPage() {
  if (DEV_NO_LOGIN) redirect("/"); // local dev without login (never in a build)
  return (
    <main className="gate">
      <div className="title"><h1>Bandyspel</h1></div>
      <LoginForm />
      <p className="gate-alt">Ny i laget? <Link href="/registrera">Skapa konto</Link></p>
      <p className="gate-alt"><Link href="/integritet">Integritetspolicy</Link> · <Link href="/villkor">Användarvillkor</Link></p>
    </main>
  );
}
