import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { loggedIn } from "@/lib/auth";
import { users } from "@/lib/users";
import { AddUserForm, ChangePasswordForm } from "./forms";

export const metadata: Metadata = { title: "Konton · Bandyspel" };

export default async function Accounts() {
  const me = await loggedIn();
  if (!me) redirect("/login");
  const names = await users().names();
  return (
    <main className="page">
      <header className="top">
        <div className="title">
          <Link className="back" href="/">← Mina spel</Link>
          <h1>Konton</h1>
        </div>
      </header>
      <section className="acc">
        <h2>Alla konton</h2>
        <p className="acc-note">Alla som loggar in ser och kan ändra samma spel.</p>
        <ul className="acc-list">{names.map(n => <li key={n}>{n}{n === me ? " (du)" : ""}</li>)}</ul>
      </section>
      <section className="acc">
        <h2>Lägg till konto</h2>
        <AddUserForm />
      </section>
      <section className="acc">
        <h2>Byt ditt lösenord</h2>
        <ChangePasswordForm />
      </section>
    </main>
  );
}
