import type { Metadata } from "next";
import Link from "next/link";
import RegisterForm from "./RegisterForm";

export const metadata: Metadata = { title: "Skapa konto · Bandyspel" };

export default function RegisterPage() {
  return (
    <main className="gate">
      <div className="title"><span className="kicker">Skapa konto</span><h1>Bandyspel</h1></div>
      <RegisterForm />
      <p className="gate-alt">Har du redan ett konto? <Link href="/login">Logga in</Link></p>
      <p className="gate-alt">Genom att skapa ett konto godkänner du <Link href="/villkor">användarvillkoren</Link> och har läst <Link href="/integritet">integritetspolicyn</Link>.</p>
    </main>
  );
}
