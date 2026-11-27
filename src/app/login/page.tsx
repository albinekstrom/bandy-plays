import type { Metadata } from "next";
import Link from "next/link";
import LoginForm from "./LoginForm";

export const metadata: Metadata = { title: "Logga in · Bandyspel" };

export default function LoginPage() {
  return (
    <main className="gate">
      <div className="title"><h1>Bandyspel</h1></div>
      <LoginForm />
      <p className="gate-alt">Ny i laget? <Link href="/registrera">Skapa konto</Link></p>
    </main>
  );
}
