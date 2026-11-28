import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { usersReady, ROLE_NAMES } from "@/lib/users";
import { setUserRole, logoutEverywhere } from "./actions";
import { randomTeamCode } from "@/lib/teamcode";
import { AddUserForm, ChangePasswordForm, TeamCodeForm, PlayerTools, RemoveMyAccountForm } from "./forms";

export const metadata: Metadata = { title: "Konton · Bandyspel" };

export default async function Accounts() {
  const me = await currentUser();
  if (!me) redirect("/login");
  const admin = me.role === "admin";
  const all = admin ? await (await usersReady()).list() : [];
  const admins = all.filter(u => u.role === "admin").length;
  return (
    <main className="page">
      <header className="top">
        <div className="title">
          <Link className="back" href="/">← Mina spel</Link>
          <h1>Konton</h1>
        </div>
      </header>
      <p className="acc-note">Inloggad som <b>{me.name.toUpperCase()}</b> · {ROLE_NAMES[me.role]}</p>
      {admin && <>
        <section className="acc">
          <h2>Alla konton</h2>
          <p className="acc-note">Admin kan ändra spel och konton. Spelare kan titta, köra quiz och 3D. Under &quot;Hantera&quot; kan du ge en spelare ett nytt lösenord eller ta bort kontot.</p>
          <ul className="acc-rows">
            {all.map(u => (
              <li key={u.name}>
                <span className="acc-name">{u.name.toUpperCase()}{u.name === me.name ? " (du)" : ""}</span>
                <form action={setUserRole} className="seg-mini" aria-label={`Nivå för ${u.name}`}>
                  <input type="hidden" name="name" value={u.name} />
                  {(["player", "admin"] as const).map(r => (
                    <button key={r} type="submit" name="role" value={r} aria-pressed={u.role === r}
                      disabled={u.role === r || (r === "player" && u.role === "admin" && admins <= 1)}>{ROLE_NAMES[r]}</button>
                  ))}
                </form>
                {u.role === "player" && u.name !== me.name && <PlayerTools name={u.name} />}
              </li>
            ))}
          </ul>
        </section>
        <section className="acc">
          <h2>Lägg till konto</h2>
          <AddUserForm />
        </section>
        <section className="acc">
          <h2>Lagkod</h2>
          <p className="acc-note">Med lagkoden kan spelare skapa egna konton under &quot;Skapa konto&quot; på inloggningssidan. De blir spelare. Spara en ny kod så slutar den gamla fungera; konton som redan finns påverkas inte.</p>
          <TeamCodeForm suggestion={randomTeamCode()} />
        </section>
      </>}
      <section className="acc">
        <h2>Byt ditt lösenord</h2>
        <ChangePasswordForm />
      </section>
      <section className="acc">
        <h2>Logga ut överallt</h2>
        <p className="acc-note">Loggar ut dig på alla telefoner och datorer, också den här. Gör det om du har loggat in på en dator som inte är din.</p>
        <form action={logoutEverywhere}><button className="btn ghost" type="submit">Logga ut överallt</button></form>
      </section>
      <section className="acc">
        <h2>Ta bort ditt konto</h2>
        <p className="acc-note">Ditt namn och lösenord tas bort och du loggas ut. Spelen finns kvar. Det går inte att ångra.</p>
        <RemoveMyAccountForm lastAdmin={admin && admins <= 1} />
      </section>
    </main>
  );
}
